import React from 'react';
import { ModelType, GenerationSettings, Step } from '../types';
import { MODEL_OPTIONS, ASPECT_RATIOS, IMAGE_SIZES, IMAGE_SIZES_FLASH31, QWEN_ASPECT_RATIOS } from '../constants';

interface PromptStepProps {
  settings: GenerationSettings;
  setSettings: (settings: GenerationSettings) => void;
  setStep: (step: Step) => void;
}

export const PromptStep: React.FC<PromptStepProps> = ({ settings, setSettings, setStep }) => {
  const getModelDescription = (model: ModelType) => {
    if (model === ModelType.Pro) {
      return 'Best for high fidelity, complex instructions, and 4K resolution. (Recommended)';
    }
    if (model === ModelType.Flash31) {
      return 'Gemini 3.1 Flash: fast generation with lower cost.';
    }
    if (model === ModelType.QwenImage2) {
      return 'Qwen Image 2 via Replicate: photorealistic generation and editing for $0.035 per image.';
    }
    return 'Optimized for quick experiments.';
  };

  const availableAspectRatios = settings.model === ModelType.QwenImage2 ? QWEN_ASPECT_RATIOS : ASPECT_RATIOS;
  const showResolutionSelector = settings.model === ModelType.Pro || settings.model === ModelType.Flash31;

  const handleModelChange = (model: ModelType) => {
    const nextAspectRatios = model === ModelType.QwenImage2 ? QWEN_ASPECT_RATIOS : ASPECT_RATIOS;
    const nextAspectRatio = nextAspectRatios.includes(settings.aspectRatio) ? settings.aspectRatio : nextAspectRatios[0];
    const nextImageSize = model === ModelType.Flash31 ? '1K' : settings.imageSize;

    setSettings({
      ...settings,
      model,
      aspectRatio: nextAspectRatio,
      imageSize: nextImageSize,
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-2xl mx-auto">
      <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
        <label className="block text-sm font-medium text-indigo-300 mb-2">Image Description (Prompt)</label>
        <p className="text-xs text-slate-400 mb-3">
          Describe the image you want to generate in detail.
          <br />
          <span className="text-indigo-400 font-medium">TIP:</span> Be specific about subject, style, colors, and lighting.
        </p>
        <textarea
          className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
          placeholder="e.g. A futuristic city with flying cars at sunset, cyberpunk style..."
          value={settings.prompt}
          onChange={(e) => setSettings({ ...settings, prompt: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
          <label className="block text-sm font-medium text-slate-300 mb-2">Model</label>
          <select
            value={settings.model}
            onChange={(e) => handleModelChange(e.target.value as ModelType)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            {getModelDescription(settings.model)}
          </p>
        </div>

        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
          <label className="block text-sm font-medium text-slate-300 mb-2">Aspect Ratio</label>
          <select
            value={settings.aspectRatio}
            onChange={(e) => setSettings({ ...settings, aspectRatio: e.target.value as any })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500"
          >
            {availableAspectRatios.map((ratio) => (
              <option key={ratio} value={ratio}>{ratio}</option>
            ))}
          </select>
        </div>

        {showResolutionSelector && (
          <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 md:col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-2">Resolution</label>
            <div className="flex gap-4">
              {(settings.model === ModelType.Flash31 ? IMAGE_SIZES_FLASH31 : IMAGE_SIZES).map((size) => (
                <label
                  key={size}
                  className={`
                    flex-1 cursor-pointer rounded-lg border p-3 text-center transition-all
                    ${settings.imageSize === size
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}
                  `}
                >
                  <input
                    type="radio"
                    name="imageSize"
                    value={size}
                    checked={settings.imageSize === size}
                    onChange={() => setSettings({ ...settings, imageSize: size as any })}
                    className="hidden"
                  />
                  <span className="font-bold">{size}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={() => setStep(Step.Reference)}
          disabled={!settings.prompt.trim()}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-all shadow-lg shadow-indigo-500/30 flex items-center"
        >
          Next Step: Add Reference (Optional) <span className="ml-2">→</span>
        </button>
      </div>
    </div>
  );
};
