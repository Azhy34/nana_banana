import React, { useState, useEffect, useRef } from 'react';
import { generateVeoVideoOnClient } from '../services/veoService';
import { generateOmniVideoOnClient } from '../services/omniService';
import {
  VEO_PRESETS,
  OMNI_PRESETS,
  VEO_NEGATIVE_PROMPT,
  VEO_FIXED_DURATION_SECONDS,
  OMNI_FIXED_DURATION_SECONDS,
  getVeoCostUsd,
  getOmniCostUsd
} from '../constants';
import { VideoJobSettings, VideoGenerationState, VideoEngine, OmniResolution } from '../types';
import { downloadImage } from '../services/downloadService';
import { generateTraceId } from '../utils/tracing';

interface VideoToolProps {
  initialImage?: string | null;
  onBack?: () => void;
  geminiApiKey?: string;
}

export const VideoTool: React.FC<VideoToolProps> = ({ initialImage, onBack, geminiApiKey }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Model engine selector: 'omni' by default for cheaper & more stable nursery videos
  const [engine, setEngine] = useState<VideoEngine>('omni');
  const [resolution, setResolution] = useState<OmniResolution>('360p');

  // Settings
  const [sourceImage, setSourceImage] = useState<string | null>(initialImage || null);
  const [settings, setSettings] = useState<VideoJobSettings>({
    engine: 'omni',
    promptPreset: 'omni_wall_dolly',
    customPrompt: OMNI_PRESETS.omni_wall_dolly.prompt,
    seed: 133466,
    resolution: '360p'
  });

  // State
  const [state, setState] = useState<VideoGenerationState>({
    isLoading: false,
    progress: 0,
    error: null,
    resultVideoUrl: null,
  });

  // Sync prop initialImage to sourceImage state when it changes
  useEffect(() => {
    if (initialImage) {
      setSourceImage(initialImage);
      // Reset previous animation results so they don't show on a new card
      setState({
        isLoading: false,
        progress: 0,
        error: null,
        resultVideoUrl: null
      });
    }
  }, [initialImage]);

  const estimatedCost = engine === 'omni'
    ? getOmniCostUsd(resolution)
    : getVeoCostUsd(VEO_FIXED_DURATION_SECONDS);

  const [isDownloading, setIsDownloading] = useState(false);

  // Handle engine switch
  const handleEngineChange = (newEngine: VideoEngine) => {
    setEngine(newEngine);
    if (newEngine === 'omni') {
      setSettings(prev => ({
        ...prev,
        engine: 'omni',
        promptPreset: 'omni_wall_dolly',
        customPrompt: OMNI_PRESETS.omni_wall_dolly.prompt,
        resolution
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        engine: 'veo',
        promptPreset: 'dolly_in',
        customPrompt: VEO_PRESETS.dolly_in.prompt
      }));
    }
  };

  // Sync preset choice with prompt text
  const handlePresetChange = (presetKey: string) => {
    if (engine === 'omni' && presetKey in OMNI_PRESETS) {
      const key = presetKey as keyof typeof OMNI_PRESETS;
      setSettings(prev => ({
        ...prev,
        promptPreset: key,
        customPrompt: OMNI_PRESETS[key].prompt
      }));
    } else if (presetKey in VEO_PRESETS) {
      const key = presetKey as keyof typeof VEO_PRESETS;
      setSettings(prev => ({
        ...prev,
        promptPreset: key,
        customPrompt: VEO_PRESETS[key].prompt
      }));
    }
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
      setState(prev => ({ ...prev, error: 'Загрузите или выберите изображение обоев/интерьера для анимации' }));
      return;
    }

    if (settings.seed < 0 || settings.seed > 4294967295) {
      setState(prev => ({ ...prev, error: 'Сид (seed) должен быть числом от 0 до 4294967295' }));
      return;
    }

    if (!geminiApiKey) {
      setState({
        isLoading: false,
        progress: 0,
        error: 'Пожалуйста, введите ваш API-ключ Gemini в шапке сайта для запуска генерации видео.',
        resultVideoUrl: null
      });
      return;
    }

    if (geminiApiKey.startsWith('sk-or-')) {
      setState({
        isLoading: false,
        progress: 0,
        error: 'Ключ не подходит! Похоже, вы используете API-ключ OpenRouter для Gemini. Пожалуйста, переключите провайдера на Gemini или введите ключ AIzaSy... в шапке.',
        resultVideoUrl: null
      });
      return;
    }

    setState({
      isLoading: true,
      progress: 0,
      error: null,
      resultVideoUrl: null,
    });

    try {
      const traceId = generateTraceId();
      let videoUrl: string;

      if (engine === 'omni') {
        videoUrl = await generateOmniVideoOnClient(
          sourceImage,
          { ...settings, resolution },
          geminiApiKey,
          (progress) => setState(prev => ({ ...prev, progress })),
          traceId
        );
      } else {
        videoUrl = await generateVeoVideoOnClient(
          sourceImage,
          settings,
          VEO_NEGATIVE_PROMPT,
          geminiApiKey,
          (progress) => setState(prev => ({ ...prev, progress })),
          traceId
        );
      }

      setState({
        isLoading: false,
        progress: 100,
        error: null,
        resultVideoUrl: videoUrl,
        lastRunCostUsd: estimatedCost,
      });

    } catch (err: any) {
      setState({
        isLoading: false,
        progress: 0,
        error: err.message || 'Ошибка генерации видео',
        resultVideoUrl: null,
      });
    }
  };

  const handleDownload = async () => {
    if (!state.resultVideoUrl) return;
    setIsDownloading(true);
    try {
      const prefix = engine === 'omni' ? `omni-${resolution}` : 'veo';
      await downloadImage(state.resultVideoUrl, `${prefix}-${settings.promptPreset}-${settings.seed}.mp4`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>🎬 Video Animator</span>
            <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-normal">
              Omni 1.1 Flash & Veo 3.1
            </span>
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Оживите текстуру обоев и интерьер детской комнаты плавным движением камеры
          </p>
        </div>
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 text-sm">
            ← Назад
          </button>
        )}
      </div>

      {/* Model Engine Selector */}
      <div className="bg-slate-800/60 backdrop-blur rounded-2xl border border-slate-700 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-300">Модель:</span>
          <div className="inline-flex bg-slate-900/60 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => handleEngineChange('omni')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                engine === 'omni'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ✨ Gemini Omni 1.1 Flash (Быстро & Дёшево)
            </button>
            <button
              onClick={() => handleEngineChange('veo')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                engine === 'veo'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Veo 3.1 Fast
            </button>
          </div>
        </div>

        {engine === 'omni' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Качество:</span>
            <div className="inline-flex bg-slate-900/60 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setResolution('360p')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  resolution === '360p'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                360p Черновик (~$0.15)
              </button>
              <button
                onClick={() => setResolution('720p')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  resolution === '720p'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                720p Финал Etsy (~$0.45)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Side: Setup & Settings */}
        <div className="space-y-6">
          {/* Preset Selector */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6">
            <h3 className="text-white font-semibold mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">🎥 Режим анимации интерьера</span>
              {engine === 'omni' && (
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                  Обои зафиксированы 1:1
                </span>
              )}
            </h3>

            <div className="space-y-3">
              {engine === 'omni' ? (
                (Object.keys(OMNI_PRESETS) as Array<keyof typeof OMNI_PRESETS>).map(key => (
                  <button
                    key={key}
                    onClick={() => handlePresetChange(key)}
                    className={`w-full text-left p-4 rounded-xl transition-all border flex flex-col ${
                      settings.promptPreset === key
                        ? 'bg-indigo-600/15 border-indigo-500/60 shadow shadow-indigo-500/15'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-sm ${settings.promptPreset === key ? 'text-indigo-300' : 'text-slate-300'}`}>
                        {OMNI_PRESETS[key].label}
                      </span>
                    </div>
                    <span className="text-xs opacity-75 mt-1 leading-relaxed text-slate-400">
                      {OMNI_PRESETS[key].description}
                    </span>
                  </button>
                ))
              ) : (
                (Object.keys(VEO_PRESETS) as Array<keyof typeof VEO_PRESETS>).map(key => (
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
                      {key === 'dolly_in' ? 'Плавный наезд камеры на кроватку.' : key === 'ambient' ? 'Лёгкое изменение света и тени, без движения объектов.' : 'Камера плавно отдаляется назад.'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Prompt Text Editor */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-white font-semibold text-sm">Промпт движения камеры (Инструкция)</label>
              <button 
                onClick={() => handlePresetChange(settings.promptPreset)}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                ↺ Сбросить к пресету
              </button>
            </div>
            <textarea
              rows={3}
              value={settings.customPrompt}
              onChange={e => setSettings(prev => ({ ...prev, customPrompt: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 text-slate-200 text-xs rounded-xl p-3 focus:outline-none transition-colors leading-relaxed resize-none"
              placeholder="Введите или скорректируйте промпт анимации..."
            />
            <span className="text-[10px] text-slate-500 mt-1.5 block">
              {engine === 'omni' 
                ? '✨ Omni 1.1 Flash: зашиты жесткие директивы сохранения обоев 1:1 без дорисовывания лишних деталей.' 
                : 'Veo 3.1: использует автоматический негативный промпт для предотвращения сворачивания обоев.'}
            </span>
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
              Используется для повторяемости и маркировки имени выходного MP4 файла.
            </span>
          </div>

          {/* Generate Action Button */}
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700 p-6 flex flex-col justify-between h-fit gap-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Движок:</span>
              <span className="text-white font-bold font-mono">
                {engine === 'omni' ? `Gemini Omni 1.1 (${resolution})` : 'Veo 3.1 Fast'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Длительность:</span>
              <span className="text-white font-bold font-mono">
                {engine === 'omni' ? OMNI_FIXED_DURATION_SECONDS : VEO_FIXED_DURATION_SECONDS} секунд
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-slate-700/50">
              <span className="text-slate-400">Расчетная стоимость:</span>
              <span className="text-green-400 font-bold font-mono text-base">${estimatedCost.toFixed(2)}</span>
            </div>
            <button
              onClick={handleGenerate}
              disabled={state.isLoading || !sourceImage}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-md mt-2 flex items-center justify-center gap-2"
            >
              {state.isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Рендеринг видео... {Math.round(state.progress)}%
                </>
              ) : (
                engine === 'omni' ? '✨ Запустить анимацию обоев (Omni Flash)' : '🚀 Запустить анимацию обоев (Veo)'
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
                <div className="text-center bg-slate-800/80 border border-slate-700 px-4 py-2 rounded-xl">
                  <p className="text-slate-400 text-xs mb-0.5">Итоговая стоимость генерации:</p>
                  <p className="text-green-400 font-bold font-mono text-base">${(state.lastRunCostUsd ?? estimatedCost).toFixed(2)}</p>
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
