import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { WizardSteps } from './components/WizardSteps';
import { PromptStep } from './components/PromptStep';
import { ReferenceStep } from './components/ReferenceStep';
import { ResultStep } from './components/ResultStep';
import { Step, UploadedImage, GenerationSettings, ModelType, GenerationState, ViewMode, AIProvider } from './types';
import { MODEL_PRICING } from './constants';
import { EtsyCropper } from './components/EtsyCropper';
import { Upscaler } from './components/Upscaler';
import { BatchGenerator } from './components/BatchGenerator';
import { generateImageComposition, isQwenModel } from './services/generationRouter';

const readSecret = (storageKeys: string[], envValue = ''): string => {
  if (typeof window === 'undefined') return envValue;
  for (const key of storageKeys) {
    const stored = window.localStorage.getItem(key);
    if (stored && stored.trim()) return stored;
  }
  return envValue;
};

const writeSecret = (storageKey: string, value: string) => {
  if (typeof window === 'undefined') return;
  if (value.trim()) {
    window.localStorage.setItem(storageKey, value);
    return;
  }
  window.localStorage.removeItem(storageKey);
};

const readProvider = (): AIProvider => {
  if (typeof window === 'undefined') return 'openrouter';
  const raw = window.localStorage.getItem('ai_provider');
  return raw === 'gemini' ? 'gemini' : 'openrouter';
};

function App() {
  const envOpenRouterApiKey =
    (((import.meta as any).env?.VITE_OPENROUTER_API_KEY as string | undefined) ||
      (process.env.OPENROUTER_API_KEY as string | undefined) ||
      '');
  const envGeminiApiKey =
    (((import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined) ||
      (process.env.GEMINI_API_KEY as string | undefined) ||
      '');
  const envReplicateToken =
    (((import.meta as any).env?.VITE_REPLICATE_API_TOKEN as string | undefined) ||
      (process.env.REPLICATE_API_TOKEN as string | undefined) ||
      '');

  const [viewMode, setViewMode] = useState<ViewMode>('generator');
  const [step, setStep] = useState<Step>(Step.Prompt);

  // Router / Keys
  const [provider, setProvider] = useState<AIProvider>(() => readProvider());
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>(() => readSecret(['openrouter_api_key'], envOpenRouterApiKey));
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => readSecret(['gemini_api_key'], envGeminiApiKey));
  const [replicateToken, setReplicateToken] = useState<string>(() => readSecret(['replicate_token'], envReplicateToken));

  const activeApiKey = provider === 'openrouter' ? openRouterApiKey : geminiApiKey;
  const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';

  // Data State
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>({
    prompt: "",
    model: ModelType.Pro,
    aspectRatio: '1:1',
    imageSize: '1K',
  });
  const generationCredential = isQwenModel(settings.model) ? replicateToken : activeApiKey;
  const generationCredentialLabel = isQwenModel(settings.model) ? 'Replicate Token' : `${providerLabel} API Key`;

  const [generationState, setGenerationState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    resultImage: null,
  });

  // Image sent from Batch to Upscaler/Cropper
  const [batchToolImage, setBatchToolImage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ai_provider', provider);
    }
  }, [provider]);

  useEffect(() => {
    writeSecret('openrouter_api_key', openRouterApiKey);
  }, [openRouterApiKey]);

  useEffect(() => {
    writeSecret('gemini_api_key', geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    writeSecret('replicate_token', replicateToken);
  }, [replicateToken]);

  const handleSendToTool = (mode: ViewMode, image: string) => {
    setBatchToolImage(image);
    setViewMode(mode);
  };

  const handleUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64Data = dataUrl.split(',')[1];

      const newImage: UploadedImage = {
        id: Math.random().toString(36).substring(7),
        data: base64Data,
        mimeType: file.type,
        previewUrl: dataUrl,
      };

      setReferenceImages(prev => prev.length < 5 ? [...prev, newImage] : prev);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
  };

  const handleGenerate = async () => {
    if (isQwenModel(settings.model) && !replicateToken) {
      setGenerationState({
        isLoading: false,
        error: 'Please enter your Replicate Token in the top right corner.',
        resultImage: null
      });
      return;
    }

    if (!isQwenModel(settings.model) && !activeApiKey) {
      setGenerationState({
        isLoading: false,
        error: `Please enter your ${providerLabel} API Key in the top right corner.`,
        resultImage: null
      });
      return;
    }

    setStep(Step.Result);
    setGenerationState({ isLoading: true, error: null, resultImage: null });

    try {
      const { image, usage, predictTimeSeconds } = await generateImageComposition(
        activeApiKey,
        replicateToken,
        referenceImages,
        settings,
        provider
      );
      const pricing = MODEL_PRICING[settings.model];
      const estimatedCostUsd =
        (usage.promptTokens / 1_000_000) * pricing.inputPer1M + pricing.outputPerImage;
      setGenerationState({ isLoading: false, error: null, resultImage: image, usage, estimatedCostUsd, predictTimeSeconds });
    } catch (err: any) {
      setGenerationState({
        isLoading: false,
        error: err.message || "Something went wrong",
        resultImage: null
      });
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case Step.Prompt:
        return (
          <PromptStep
            settings={settings}
            setSettings={setSettings}
            setStep={setStep}
          />
        );

      case Step.Reference:
        return (
            <ReferenceStep
              referenceImages={referenceImages}
              handleUpload={handleUpload}
              removeImage={removeImage}
              setStep={setStep}
              handleGenerate={handleGenerate}
              apiKey={generationCredential}
            />
          );

      case Step.Result:
        return (
          <ResultStep
            generationState={generationState}
            referenceImages={referenceImages}
            setStep={setStep}
            onViewModeChange={setViewMode}
          />
        );
    }
  };

  const switchTab = (mode: ViewMode) => {
    if (mode === 'generator' || mode === 'batch') {
      setBatchToolImage(null);
    }
    setViewMode(mode);
  };

  const tabClass = (mode: ViewMode) =>
    `px-6 py-3 rounded-xl font-bold transition-all duration-300 ${viewMode === mode
      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
      : 'text-slate-400 hover:text-slate-200'
    }`;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-indigo-500/30">
      <Header
        provider={provider}
        setProvider={setProvider}
        openRouterApiKey={openRouterApiKey}
        setOpenRouterApiKey={setOpenRouterApiKey}
        geminiApiKey={geminiApiKey}
        setGeminiApiKey={setGeminiApiKey}
        replicateToken={replicateToken}
        setReplicateToken={setReplicateToken}
      />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-slate-800/50 p-1.5 rounded-2xl border border-slate-700 shadow-xl">
            <button onClick={() => switchTab('generator')} className={tabClass('generator')}>Generator</button>
            <button onClick={() => switchTab('batch')} className={tabClass('batch')}>Batch</button>
            <button onClick={() => switchTab('cropper')} className={tabClass('cropper')}>Cropper</button>
            <button onClick={() => switchTab('upscaler')} className={tabClass('upscaler')}>Upscale</button>
          </div>
        </div>

        {viewMode === 'generator' && (
          <>
            <div className="mb-12 text-center animate-fadeIn">
              <h2 className="text-4xl font-bold text-white mb-4 tracking-tight">
                AI Image Generation
              </h2>
              <p className="text-slate-400 max-w-2xl mx-auto text-lg">
                Generate high-quality images from text prompts and optional reference photos.
              </p>
              {!generationCredential && (
                <div className="mt-4 inline-block bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2">
                  <p className="text-yellow-200 text-sm">
                    Please enter your {generationCredentialLabel} in the header to start generating.
                  </p>
                </div>
              )}
            </div>

            <WizardSteps currentStep={step} setStep={setStep} />

            <div className="max-w-4xl mx-auto transition-all duration-500">
              {renderStepContent()}
            </div>
          </>
        )}

        {viewMode === 'batch' && (
          <div className="animate-fadeIn">
            <BatchGenerator
              provider={provider}
              apiKey={activeApiKey}
              replicateToken={replicateToken}
              onViewModeChange={setViewMode}
              onSendToTool={handleSendToTool}
            />
          </div>
        )}

        {viewMode === 'cropper' && (
          <div className="animate-fadeIn">
            <EtsyCropper
              provider={provider}
              apiKey={activeApiKey}
              initialImage={batchToolImage || generationState.resultImage}
              onBack={() => setViewMode('generator')}
            />
          </div>
        )}

        {viewMode === 'upscaler' && (
          <div className="animate-fadeIn">
            <Upscaler
              replicateToken={replicateToken}
              initialImage={batchToolImage || generationState.resultImage}
              onBack={() => setViewMode('generator')}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
