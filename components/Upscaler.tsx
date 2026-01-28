import React, { useState, useRef } from 'react';
import { upscaleImage } from '../services/replicateService';
import { UpscaleSettings, UpscaleState } from '../types';

interface UpscalerProps {
    replicateToken: string;
    initialImage?: string | null;
    onBack?: () => void;
}

const SIZE_OPTIONS = [
    { value: '8K', label: '8K (~7680px)', multiplier: 2 },
    { value: '12K', label: '12K (~11520px)', multiplier: 3 },
    { value: '16K', label: '16K (~15360px)', multiplier: 4 },
    { value: '24K', label: '24K (6x)', multiplier: 6 },
] as const;

const MODEL_OPTIONS = [
    { value: 'High Fidelity V2', label: '💎 High Fidelity', description: 'Идеально для пейзажей и животных (шерсть, детали)' },
    { value: 'Standard V2', label: '✨ Standard', description: 'Универсально, хорошо убирает шумы' },
    { value: 'Low Resolution V2', label: '🔍 Low Res', description: 'Для маленьких или мутных фото' },
    { value: 'CGI', label: '🎨 Art / CGI', description: 'Для иллюстраций и графики' },
] as const;


export const Upscaler: React.FC<UpscalerProps> = ({
    replicateToken,
    initialImage,
    onBack,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [sourceImage, setSourceImage] = useState<string | null>(initialImage || null);
    const [sourceMimeType, setSourceMimeType] = useState<string>('image/png');
    const [settings, setSettings] = useState<UpscaleSettings>({
        targetSize: '16K',
        format: 'jpg',
        model: 'High Fidelity V2',
        faceCorrection: false,
    });

    const [state, setState] = useState<UpscaleState>({
        isUpscaling: false,
        progress: 0,
        error: null,
        upscaledImage: null,
    });

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSourceMimeType(file.type);
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

        try {
            // Extract base64 from data URL
            const base64Data = sourceImage.includes(',')
                ? sourceImage.split(',')[1]
                : sourceImage;

            // Determine scale factor based on target size
            const selectedOption = SIZE_OPTIONS.find(o => o.value === settings.targetSize);
            const scaleFactor = selectedOption?.multiplier || 4;

            setState(prev => ({ ...prev, progress: 10 }));

            const result = await upscaleImage(
                replicateToken,
                base64Data,
                sourceMimeType,
                scaleFactor,
                settings.model,
                settings.faceCorrection,
                (status) => {
                    setState(prev => ({
                        ...prev,
                        progress: status === 'processing' ? 50 : (status === 'succeeded' ? 100 : prev.progress),
                    }));
                }
            );

            setState({
                isUpscaling: false,
                progress: 100,
                error: null,
                upscaledImage: result,
            });
        } catch (err: any) {
            setState({
                isUpscaling: false,
                progress: 0,
                error: err.message || 'Ошибка апскейла',
                upscaledImage: null,
            });
        }
    };

    const handleDownload = () => {
        if (!state.upscaledImage) return;

        const link = document.createElement('a');
        link.href = state.upscaledImage;
        link.download = `upscaled-${settings.targetSize}.${settings.format}`;
        link.target = '_blank';
        link.click();
    };

    // Upload Screen
    if (!sourceImage) {
        return (
            <div className="max-w-2xl mx-auto py-12">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-white mb-2">🔬 AI Upscaler</h2>
                    <p className="text-slate-400">Увеличьте разрешение до 16K для печати на фотообоях</p>
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
                    <p className="text-sm text-slate-400">Topaz Labs · Увеличение до 24K (6x)</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setSourceImage(null)}
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
                        />
                    </div>
                </div>

                {/* Settings Panel */}
                <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 space-y-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Настройки</h3>

                    {/* Target Size */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-white">Целевое разрешение</label>
                        <div className="grid grid-cols-4 gap-2">
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
                                    <div className="text-[10px] text-slate-500">×{option.multiplier}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Enhancement Model */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-white">Модель улучшения</label>
                        <div className="grid grid-cols-2 gap-2">
                            {MODEL_OPTIONS.map((model) => (
                                <button
                                    key={model.value}
                                    onClick={() => setSettings(prev => ({ ...prev, model: model.value }))}
                                    className={`p-3 rounded-xl border-2 transition-all text-left group ${settings.model === model.value
                                        ? 'border-purple-500 bg-purple-500/10'
                                        : 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                                        }`}
                                >
                                    <div className="font-bold text-white text-sm">{model.label}</div>
                                    <div className="text-[10px] text-slate-500 leading-tight mt-1">{model.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Output Format and Face Correction */}
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

                        <label className="flex items-center gap-3 p-4 bg-slate-900/40 border border-slate-700 rounded-xl cursor-pointer hover:bg-slate-800/60 transition-colors">
                            <input
                                type="checkbox"
                                checked={settings.faceCorrection}
                                onChange={(e) => setSettings(prev => ({ ...prev, faceCorrection: e.target.checked }))}
                                className="w-5 h-5 rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 bg-slate-800"
                            />
                            <div>
                                <div className="text-sm font-medium text-white">Улучшение лиц</div>
                                <div className="text-[10px] text-slate-500">Восстанавливает черты лица при апскейле</div>
                            </div>
                        </label>
                    </div>

                    {/* Info Box */}
                    <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700">
                        <div className="flex items-start gap-3">
                            <span className="text-2xl">💎</span>
                            <div className="text-sm">
                                <p className="text-slate-300 font-medium">Профессиональный апскейл</p>
                                <p className="text-slate-500">Технология Topaz Labs восстанавливает детали без "мыла" и артефактов склейки.</p>
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
                        <span className="text-sm font-medium text-white">Обработка...</span>
                        <span className="text-sm text-indigo-400">{state.progress}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
                            style={{ width: `${state.progress}%` }}
                        />
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                        Стоимость: ~$0.01-0.05 (оплата с вашего Replicate аккаунта)
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
                            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
                        >
                            📥 Скачать
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
