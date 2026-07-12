import React, { useState, useEffect, useRef } from 'react';
import { ensurePublicUrl, startVeoAnimation, pollVeoOperation } from '../services/veoService';
import { VEO_PRESETS, VEO_NEGATIVE_PROMPT, VEO_PRICING_PER_SECOND_USD } from '../constants';
import { VideoJobSettings, VideoGenerationState } from '../types';
import { downloadImage } from '../services/downloadService';

interface VideoToolProps {
  initialImage?: string | null;
  onBack?: () => void;
}

export const VideoTool: React.FC<VideoToolProps> = ({ initialImage, onBack }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Settings
  const [sourceImage, setSourceImage] = useState<string | null>(initialImage || null);
  const [settings, setSettings] = useState<VideoJobSettings>({
    promptPreset: 'dolly_in',
    customPrompt: VEO_PRESETS.dolly_in.prompt,
    seed: 133466,
  });

  // State
  const [state, setState] = useState<VideoGenerationState>({
    isLoading: false,
    progress: 0,
    error: null,
    resultVideoUrl: null,
  });

  const [estimatedCost] = useState(6 * VEO_PRICING_PER_SECOND_USD);
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync preset choice with prompt text
  const handlePresetChange = (presetKey: keyof typeof VEO_PRESETS) => {
    setSettings(prev => ({
      ...prev,
      promptPreset: presetKey,
      customPrompt: VEO_PRESETS[presetKey].prompt
    }));
  };

  // Upload custom file if needed
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setSourceImage(e.target?.result as string);
        setState({ isLoading: false, progress: 0, error: null, resultVideoUrl: null });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!sourceImage) {
      setState(prev => ({ ...prev, error: 'Загрузите или выберите изображение для анимации' }));
      return;
    }

    if (settings.seed < 0 || settings.seed > 4294967295) {
      setState(prev => ({ ...prev, error: 'Сид (seed) должен быть числом от 0 до 4294967295' }));
      return;
    }

    setState({ isLoading: true, progress: 0, error: null, resultVideoUrl: null });

    // Progress bar fake animation
    const progressInterval = setInterval(() => {
      setState(prev => {
        if (!prev.isLoading) return prev;
        if (prev.progress < 95) {
          // Slows down as it approaches 95%
          const increment = prev.progress < 50 ? 3 : (prev.progress < 80 ? 1.5 : 0.5);
          return { ...prev, progress: Math.min(prev.progress + increment, 95) };
        }
        return prev;
      });
    }, 1000);

    try {
      // Step 1: Ensure image is public JPEG (compress if base64)
      setState(prev => ({ ...prev, progress: 5 }));
      const publicImageUrl = await ensurePublicUrl(sourceImage);

      // Step 2: Trigger operation in backend
      setState(prev => ({ ...prev, progress: 15 }));
      const { operationId, traceId } = await startVeoAnimation(publicImageUrl, settings, VEO_NEGATIVE_PROMPT);

      // Step 3: Polling loop until finished
      let isDone = false;
      let checkCount = 0;

      while (!isDone) {
        // Wait 4 seconds between checks
        await new Promise(resolve => setTimeout(resolve, 4000));
        checkCount++;

        // Safety break after 4 minutes (60 poll loops)
        if (checkCount > 60) {
          throw new Error('Превышено время ожидания рендеринга видео (Timeout). Пожалуйста, проверьте статус операции позже.');
        }

        const pollResult = await pollVeoOperation(operationId, traceId);

        if (pollResult.status === 'done') {
          isDone = true;
          clearInterval(progressInterval);

          if (pollResult.videoUrl) {
            setState({
              isLoading: false,
              progress: 100,
              error: null,
              resultVideoUrl: pollResult.videoUrl
            });
          } else {
            throw new Error(pollResult.error || 'Видео завершено, но ссылка на файл пуста.');
          }
        }
      }

    } catch (err: any) {
      clearInterval(progressInterval);
      setState({
        isLoading: false,
        progress: 0,
        error: err.message || 'Ошибка генерации видео',
        resultVideoUrl: null
      });
    }
  };

  const handleDownload = async () => {
    if (!state.resultVideoUrl) return;
    setIsDownloading(true);
    try {
      await downloadImage(state.resultVideoUrl, `veo-flight-${settings.promptPreset}-${settings.seed}.mp4`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">🎬 Video Animator</h2>
          <p className="text-slate-400 text-sm mt-1">Оживите ваши обои плавным 6-секундным пролетом камеры (Veo 3.1)</p>
        </div>
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 text-sm">
            ← Назад
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Setup & Settings */}
        <div className="space-y-6">
          {/* Preset Selector */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <span>🎥 Режим анимации</span>
            </h3>
            <div className="space-y-3">
              {(Object.keys(VEO_PRESETS) as Array<keyof typeof VEO_PRESETS>).map(key => (
                <button
                  key={key}
                  onClick={() => handlePresetChange(key)}
                  className={`w-full text-left p-4 rounded-xl transition-all border flex flex-col ${
                    settings.promptPreset === key
                      ? 'bg-indigo-600/10 border-indigo-500/50 shadow shadow-indigo-500/10'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className={`font-bold text-sm ${settings.promptPreset === key ? 'text-indigo-400' : 'text-slate-300'}`}>
                    {VEO_PRESETS[key].label}
                  </span>
                  <span className="text-xs opacity-75 mt-1 leading-relaxed">
                    {key === 'dolly_in' ? 'Плавный наезд камеры на кроватку.' : key === 'ambient' ? 'Легкие микро-движения в кадре (идеально для людей).' : 'Камера плавно отдаляется назад.'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Seed Input */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-white font-semibold text-sm">Seed (зерно генерации)</label>
              <button 
                onClick={() => setSettings(prev => ({ ...prev, seed: Math.floor(Math.random() * 1000000) }))}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                🎲 Случайный
              </button>
            </div>
            <input 
              type="number"
              value={settings.seed}
              onChange={e => setSettings(prev => ({ ...prev, seed: Math.max(0, Math.min(4294967295, Number(e.target.value))) }))}
              className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 text-slate-200 text-sm rounded-xl px-4 py-3 focus:outline-none transition-colors"
              placeholder="Введите число от 0 до 4294967295"
            />
            <span className="text-[10px] text-slate-500 mt-2 block">
              Фиксированный seed позволяет получать предсказуемое движение камеры на одном и том же макете.
            </span>
          </div>

          {/* Generate Action Button */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6 flex flex-col justify-between h-fit gap-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Формат:</span>
              <span className="text-white font-bold font-mono">9:16 (Pinterest)</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Длительность:</span>
              <span className="text-white font-bold font-mono">6 секунд</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-slate-700/50">
              <span className="text-slate-400">Расчетная стоимость:</span>
              <span className="text-green-400 font-bold font-mono">${estimatedCost.toFixed(2)}</span>
            </div>
            <button
              onClick={handleGenerate}
              disabled={state.isLoading || !sourceImage}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-md mt-2 flex items-center justify-center gap-2"
            >
              {state.isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Рендеринг видео... {Math.round(state.progress)}%
                </>
              ) : (
                '🚀 Запустить анимацию обоев'
              )}
            </button>

            {state.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-300 text-xs mt-2 leading-relaxed">
                ⚠ {state.error}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Media Preview & Results */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6 flex flex-col items-center justify-center min-h-[500px] relative overflow-hidden">
            {state.isLoading && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-6 text-center gap-4">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <div>
                  <h4 className="text-white font-bold text-lg">Нейросеть оживляет кадр</h4>
                  <p className="text-slate-400 text-xs max-w-xs mt-2 leading-relaxed">
                    Этот процесс обычно занимает около 45–60 секунд. Мы сжимаем кадр, заливаем его в облако и опрашиваем сервера Google.
                  </p>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-850 rounded-full h-2.5 max-w-xs mt-2 overflow-hidden border border-slate-700">
                  <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${state.progress}%` }} />
                </div>
              </div>
            )}

            {state.resultVideoUrl ? (
              <div className="w-full flex flex-col items-center gap-4">
                <div className="relative aspect-[9/16] w-full max-w-[280px] rounded-xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-950">
                  <video 
                    src={state.resultVideoUrl} 
                    className="w-full h-full object-cover"
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    controls
                  />
                </div>
                <button
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-green-500/20 text-sm flex items-center gap-2"
                >
                  {isDownloading ? 'Загрузка...' : '⬇ Скачать готовый видео-пин'}
                </button>
              </div>
            ) : sourceImage ? (
              <div className="w-full flex flex-col items-center gap-4">
                <span className="text-slate-400 text-xs">Исходный кадр (референс):</span>
                <div className="relative aspect-[9/16] w-full max-w-[280px] rounded-xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-950">
                  <img src={sourceImage} alt="Reference Frame" className="w-full h-full object-cover" />
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                >
                  Изменить картинку
                </button>
                <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleUpload} />
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full aspect-[9/16] max-w-[280px] border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors group p-6 text-center">
                <svg className="w-10 h-10 text-slate-500 group-hover:text-indigo-400 mb-2 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-slate-400 text-sm font-semibold">Upload 9:16 mockup</span>
                <span className="text-slate-500 text-xs mt-1 leading-relaxed">Перетащите картинку или кликните для выбора</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
              </label>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
