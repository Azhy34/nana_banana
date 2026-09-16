import React, { useState, useRef, useEffect } from 'react';
import { upload } from '@vercel/blob/client';
import { upscaleImage } from '../services/replicateService';
import { logGeminiEvent } from '../services/geminiService';
import { GeminiLogDetails, UpscaleSettings, UpscaleState } from '../types';
import { downloadImage } from '../services/downloadService';
import { generateTraceId } from '../utils/tracing';
import { TOPAZ_UPSCALE_MODEL_ID, TOPAZ_USD_PER_BILLING_UNIT, REAL_ESRGAN_MODEL_ID, REAL_ESRGAN_USD_PER_RUN } from '../constants';

interface UpscalerProps {
    replicateToken: string;
    initialImage?: string | null;
    onBack?: () => void;
}

// Available Upscale Models
const UPSCALE_MODEL_OPTIONS = [
    {
        id: 'real-esrgan' as const,
        name: '⚡ Real-ESRGAN (Рекомендуется)',
        badge: '~$0.002 (быстро 3 сек)',
        description: 'Идеально для обоев, акварели и иллюстраций. Резкие векторные контуры без мыла.',
    },
    {
        id: 'topaz' as const,
        name: '💎 Topaz Labs Gigapixel',
        badge: '~$0.82 (17 units)',
        description: 'Премиум для сложных фото, подавления шума и портретов.',
    },
];

// Replicate's upscale_factor enum is None | 2x | 4x | 6x — there is no 3x.
// Offering a "12K ×3" button would send 4x and silently bill a 16K upscale.
const SIZE_OPTIONS = [
    { value: '8K', label: '8K (~7680px)', factor: '2x' },
    { value: '16K', label: '16K (~15360px)', factor: '4x' },
    { value: '24K', label: '24K (~23040px)', factor: '6x' },
] as const;

// A/B runs against the live Replicate model showed enhance_model has no effect:
// 'High Fidelity V2', 'CGI' and 'Low Resolution V2' returned pixel-identical output
// at both 2x and 4x. It still has to be sent, so it is fixed here rather than
// offered as a choice the user cannot actually make.
const ENHANCE_MODEL = 'High Fidelity V2' as const;

// subject_detection, by contrast, does change the result (Foreground vs All
// differs measurably), and until now it was hardcoded and hidden.
const SUBJECT_OPTIONS = [
    { value: 'All', label: '🖼 Всё изображение', description: 'Равномерно по всей площади — для обоев по умолчанию' },
    { value: 'Foreground', label: '🎯 Передний план', description: 'Сильнее по объектам, мягче по фону' },
    { value: 'Background', label: '🌫 Фон', description: 'Сильнее по фону, бережнее к объектам' },
] as const;


export const Upscaler: React.FC<UpscalerProps> = ({
    replicateToken,
    initialImage,
    onBack,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [sourceImage, setSourceImage] = useState<string | null>(initialImage || null);

    useEffect(() => {
        if (initialImage) {
            setSourceImage(initialImage);
            setSourceFile(null);
        }
    }, [initialImage]);
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [sourceMimeType, setSourceMimeType] = useState<string>('image/png');
    // Natural size of the source, read when the preview loads — logged so the real
    // output resolution of each run is known.
    const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
    
    const [settings, setSettings] = useState<UpscaleSettings>({
        model: 'real-esrgan',
        targetSize: '16K',
        format: 'jpg',
        subjectDetection: 'All',
    });

    const [state, setState] = useState<UpscaleState>({
        isUpscaling: false,
        progress: 0,
        error: null,
        upscaledImage: null,
    });
    const [isDownloading, setIsDownloading] = useState(false);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSourceFile(file);
            setSourceMimeType(file.type);
            setSourceSize(null);
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target?.result as string;
                setSourceImage(dataUrl);
                setState({ isUpscaling: false, progress: 0, error: null, upscaledImage: null });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleUpscale = async () => {
        if (!sourceImage) {
            setState(prev => ({ ...prev, error: 'Загрузите изображение' }));
            return;
        }

        if (!replicateToken) {
            setState(prev => ({ ...prev, error: 'Введите Replicate API Token в шапке сайта' }));
            return;
        }

        setState({ isUpscaling: true, progress: 0, error: null, upscaledImage: null });

        const selectedOption = SIZE_OPTIONS.find(o => o.value === settings.targetSize);
        const upscaleFactor = selectedOption?.factor ?? '4x';
        const multiplier = Number.parseInt(upscaleFactor, 10);
        const traceId = generateTraceId();
        const startedAt = Date.now();
        const activeModelId = settings.model === 'real-esrgan' ? REAL_ESRGAN_MODEL_ID : TOPAZ_UPSCALE_MODEL_ID;
        const sourceName = sourceFile?.name ?? 'image from another tool';
        const outputSize = sourceSize && `${sourceSize.width * multiplier}×${sourceSize.height * multiplier}`;
        const description = `Upscale ${upscaleFactor}${outputSize ? ` → ${outputSize}` : ''} (${settings.format}, ${settings.subjectDetection}): ${sourceName}`;
        const logDetails: GeminiLogDetails = {
            upscaleModel: settings.model,
            upscaleFactor,
            enhanceModel: ENHANCE_MODEL,
            outputFormat: settings.format,
            subjectDetection: settings.subjectDetection,
            inputWidth: sourceSize?.width,
            inputHeight: sourceSize?.height,
            outputWidth: sourceSize ? sourceSize.width * multiplier : undefined,
            outputHeight: sourceSize ? sourceSize.height * multiplier : undefined,
        };
        let stage = 'upload';

        logGeminiEvent(activeModelId, `${description} [start]`, 0, 0, 'started', null, traceId, undefined, logDetails);

        try {
            let finalImageUrl = sourceImage;

            // Step 1: Upload to Vercel Blob if it's a local file or base64 to avoid 413 error
            // Replicate needs a publicly accessible URL for best results with large files
            if (sourceImage.startsWith('data:') || sourceFile) {
                setState(prev => ({ ...prev, progress: 5, error: null }));
                
                try {
                    const fileToUpload = sourceFile || await (await fetch(sourceImage)).blob();
                    const fileName = sourceFile?.name || `upscale-${Date.now()}.png`;
                    
                    const blob = await upload(fileName, fileToUpload, {
                        access: 'public',
                        handleUploadUrl: '/api/upload',
                    });
                    
                    finalImageUrl = blob.url;
                    
                } catch (blobError: any) {
                    console.error('Blob upload failed:', blobError);
                    // If Blob fails, we try to fall back to base64 if it's small enough,
                    // but usually it's better to fail here and explain why.
                    throw new Error(`Ошибка загрузки в облако: ${blobError.message}. Проверьте BLOB_READ_WRITE_TOKEN.`);
                }
            }

            // Step 2: Call Replicate Upscale via our API
            stage = 'upscale';
            setState(prev => ({ ...prev, progress: 20 }));

            const result = await upscaleImage(
                replicateToken,
                finalImageUrl,
                sourceMimeType,
                upscaleFactor,
                ENHANCE_MODEL,
                false,
                settings.format,
                settings.subjectDetection,
                settings.model,
                (status) => {
                    setState(prev => ({
                        ...prev,
                        progress: status === 'processing' ? 50 : (status === 'succeeded' ? 100 : prev.progress),
                    }));
                }
            );

            const cost = settings.model === 'real-esrgan' ? REAL_ESRGAN_USD_PER_RUN : (result.billingUnits !== undefined ? result.billingUnits * TOPAZ_USD_PER_BILLING_UNIT : 0);
            logGeminiEvent(activeModelId, description, cost, (Date.now() - startedAt) / 1000, 'success', null, traceId, undefined, {
                ...logDetails,
                predictionId: result.predictionId,
                predictTimeSeconds: result.predictTimeSeconds,
                billingUnits: result.billingUnits,
            });

            setState({
                isUpscaling: false,
                progress: 100,
                error: null,
                upscaledImage: result.url,
            });
        } catch (err: any) {
            logGeminiEvent(activeModelId, description, 0, (Date.now() - startedAt) / 1000, 'error', err.message || 'Unknown error', traceId, undefined, {
                ...logDetails,
                stage,
            });
            setState({
                isUpscaling: false,
                progress: 0,
                error: err.message || 'Ошибка апскейла',
                upscaledImage: null,
            });
        }
    };

    const handleDownload = async () => {
        if (!state.upscaledImage) return;

        setIsDownloading(true);
        try {
            await downloadImage(
                state.upscaledImage,
                `upscaled-${settings.targetSize}.${settings.format}`
            );
        } finally {
            setIsDownloading(false);
        }
    };

    // Upload Screen
    if (!sourceImage) {
        return (
            <div className="max-w-2xl mx-auto py-12">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">🔬 AI Upscaler</h2>
                    <p className="text-slate-400">Увеличьте разрешение до 24K для печати на фотообоях</p>
                </div>

                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-slate-700 rounded-3xl cursor-pointer bg-slate-800/30 hover:bg-slate-800/50 hover:border-indigo-500/50 transition-all group">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                        </div>
                        <p className="mb-2 text-lg font-semibold text-white">Кликните или перетащите файл</p>
                        <p className="text-sm text-slate-500">PNG, JPG или WebP (рекомендуется 4K исходник)</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleUpload}
                    />
                </label>

                {!replicateToken && (
                    <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                        <p className="text-yellow-200 text-sm">
                            ⚠️ Для работы апскейлера нужен Replicate API Token.
                            Получите его бесплатно на <a href="https://replicate.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-yellow-100">replicate.com</a>
                        </p>
                    </div>
                )}

                {onBack && (
                    <button
                        onClick={onBack}
                        className="mt-8 w-full py-4 bg-slate-800 text-slate-300 rounded-2xl hover:bg-slate-700 transition-all font-medium border border-slate-700"
                    >
                        ← Вернуться к генератору
                    </button>
                )}
            </div>
        );
    }

    // Main Interface
    return (
        <div className="max-w-4xl mx-auto py-8 space-y-6 animate-fadeIn">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-white">🔬 AI Upscaler</h2>
                    <p className="text-sm text-slate-400">Replicate · Real-ESRGAN & Topaz Labs · До 24K</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setSourceImage(null);
                            setSourceFile(null);
                        }}
                        className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        Заменить фото
                    </button>
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="px-4 py-2 bg-indigo-600/20 text-indigo-300 rounded-lg hover:bg-indigo-600/30 transition-colors"
                        >
                            Вернуться
                        </button>
                    )}
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Source Image Preview */}
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Исходник</h3>
                    <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
                        <img
                            src={sourceImage}
                            alt="Source"
                            className="max-w-full max-h-full object-contain"
                            onLoad={(e) => setSourceSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                        />
                    </div>
                </div>

                {/* Settings Panel */}
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 space-y-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Настройки</h3>

                    {/* AI Model Selection */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-white">Модель апскейла</label>
                        <div className="grid grid-cols-1 gap-2">
                            {UPSCALE_MODEL_OPTIONS.map((opt) => (
                                <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => setSettings(prev => ({ ...prev, model: opt.id }))}
                                    className={`p-3 rounded-xl border-2 transition-all text-left group ${settings.model === opt.id
                                        ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="font-bold text-white text-sm">{opt.name}</div>
                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                            opt.id === 'real-esrgan' 
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        }`}>
                                            {opt.badge}
                                        </span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-1">{opt.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Target Size */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-white">Целевое разрешение</label>
                        <div className="grid grid-cols-3 gap-2">
                            {SIZE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setSettings(prev => ({ ...prev, targetSize: option.value }))}
                                    className={`p-2 rounded-xl border-2 transition-all text-center ${settings.targetSize === option.value
                                        ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="font-bold text-white text-sm">{option.value}</div>
                                    <div className="text-[10px] text-slate-500">{option.factor}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Subject Detection — only for Topaz Labs */}
                    {settings.model === 'topaz' && (
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-white">Область обработки (Topaz)</label>
                        <div className="grid grid-cols-1 gap-2">
                            {SUBJECT_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setSettings(prev => ({ ...prev, subjectDetection: option.value }))}
                                    className={`p-3 rounded-xl border-2 transition-all text-left group ${settings.subjectDetection === option.value
                                        ? 'border-purple-500 bg-purple-500/10'
                                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="font-bold text-white text-sm">{option.label}</div>
                                    <div className="text-[10px] text-slate-500 leading-tight mt-1">{option.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Output Format */}
                    <div className="space-y-4">
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-white">Формат файла</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setSettings(prev => ({ ...prev, format: 'jpg' }))}
                                    className={`flex-1 p-3 rounded-xl border-2 transition-all ${settings.format === 'jpg'
                                        ? 'border-amber-500 bg-amber-500/10'
                                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="font-bold text-white text-sm">JPG</div>
                                    <div className="text-[10px] text-slate-500">~40MB (рекомендуется)</div>
                                </button>
                                <button
                                    onClick={() => setSettings(prev => ({ ...prev, format: 'png' }))}
                                    className={`flex-1 p-3 rounded-xl border-2 transition-all ${settings.format === 'png'
                                        ? 'border-emerald-500 bg-emerald-500/10'
                                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="font-bold text-white text-sm">PNG</div>
                                    <div className="text-[10px] text-slate-500">~150MB (без потерь)</div>
                                </button>
                            </div>
                        </div>

                    </div>

                    {/* Info Box */}
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                        <div className="flex items-start gap-3">
                            <span className="text-2xl">💎</span>
                            <div className="text-sm">
                                <p className="text-slate-300 font-medium">Профессиональный апскейл</p>
                                <p className="text-slate-500">Изображение будет загружено в Vercel Blob для стабильной обработки больших файлов.</p>
                            </div>
                        </div>
                    </div>

                    {/* Error Display */}
                    {state.error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <p className="text-red-300 text-sm">❌ {state.error}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            {state.isUpscaling && (
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-white">
                            {state.progress < 20 ? 'Загрузка в облако...' : 'Обработка Replicate...'}
                        </span>
                        <span className="text-sm text-indigo-400">{state.progress}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${state.progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        {settings.model === 'real-esrgan' ? 'Стоимость: ~$0.002 (~0.2 цента, в 400 раз дешевле Topaz)' : 'Стоимость: ~$0.82 (17 юнитов Topaz Labs)'}
                    </p>
                </div>
            )}

            {/* Result */}
            {state.upscaledImage && (
                <div className="bg-gradient-to-br from-emerald-500/10 to-indigo-500/10 rounded-2xl border border-emerald-500/30 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">✨</span>
                            <div>
                                <h3 className="text-lg font-bold text-white">Готово!</h3>
                                <p className="text-sm text-slate-400">Изображение увеличено до {settings.targetSize}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isDownloading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Скачивание...
                                </>
                            ) : (
                                <>📥 Скачать</>
                            )}
                        </button>
                    </div>

                    <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center">
                        <img
                            src={state.upscaledImage}
                            alt="Upscaled"
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>
                </div>
            )}

            {/* Action Button */}
            {!state.upscaledImage && (
                <button
                    onClick={handleUpscale}
                    disabled={state.isUpscaling || !replicateToken}
                    className="w-full py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg rounded-2xl shadow-2xl shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {state.isUpscaling ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Обработка...
                        </span>
                    ) : (
                        `🚀 Увеличить до ${settings.targetSize}`
                    )}
                </button>
            )}
        </div>
    );
};
