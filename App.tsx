import React, { useState } from 'react';
import { Header } from './components/Header';
import { WizardSteps } from './components/WizardSteps';
import { PromptStep } from './components/PromptStep';
import { ReferenceStep } from './components/ReferenceStep';
import { ResultStep } from './components/ResultStep';
import { Step, UploadedImage, GenerationSettings, ModelType, GenerationState, ViewMode } from './types';
import { generateImageComposition } from './services/geminiService';
import { EtsyCropper } from './components/EtsyCropper';
import { Upscaler } from './components/Upscaler';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('generator');
  const [step, setStep] = useState<Step>(Step.Prompt);

  // Data State
  const [apiKey, setApiKey] = useState<string>('');
  const [replicateToken, setReplicateToken] = useState<string>('');
  const [referenceImages, setReferenceImages] = useState<UploadedImage[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>({
    prompt: "",
    model: ModelType.Pro,
    aspectRatio: '1:1',
    imageSize: '1K',
  });

  const [generationState, setGenerationState] = useState<GenerationState>({
    isLoading: false,
    error: null,
    resultImage: null,
  });

  // Handlers
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

      // Limit to 1 reference image
      setReferenceImages([newImage]);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setReferenceImages([]);
  };

  const handleGenerate = async () => {
    if (!apiKey) {
      setGenerationState({
        isLoading: false,
        error: "Please enter your Gemini API Key in the top right corner.",
        resultImage: null
      });
      return;
    }

    setStep(Step.Result);
    setGenerationState({ isLoading: true, error: null, resultImage: null });

    try {
      const result = await generateImageComposition(
        apiKey,
        referenceImages[0] || null,
        settings
      );
      setGenerationState({ isLoading: false, error: null, resultImage: result });
    } catch (err: any) {
      setGenerationState({
        isLoading: false,
        error: err.message || "Something went wrong",
        resultImage: null
      });
    }
  };

  // Render Steps
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
            apiKey={apiKey}
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

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-indigo-500/30">
      <Header apiKey={apiKey} setApiKey={setApiKey} replicateToken={replicateToken} setReplicateToken={setReplicateToken} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* View Mode Switcher */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-slate-800/50 p-1.5 rounded-2xl border border-slate-700 shadow-xl">
            <button
              onClick={() => setViewMode('generator')}
              className={`px-6 py-3 rounded-xl font-bold transition-all duration-300 ${viewMode === 'generator'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              🎨 Generator
            </button>
            <button
              onClick={() => setViewMode('cropper')}
              className={`px-6 py-3 rounded-xl font-bold transition-all duration-300 ${viewMode === 'cropper'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              ✂️ Cropper
            </button>
            <button
              onClick={() => setViewMode('upscaler')}
              className={`px-6 py-3 rounded-xl font-bold transition-all duration-300 ${viewMode === 'upscaler'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              🔬 Upscale
            </button>
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
              {!apiKey && (
                <div className="mt-4 inline-block bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2">
                  <p className="text-yellow-200 text-sm">
                    ⚠️ Please enter your API Key in the top right to start generating.
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

        {viewMode === 'cropper' && (
          <div className="animate-fadeIn">
            <EtsyCropper
              initialImage={generationState.resultImage}
              onBack={() => setViewMode('generator')}
            />
          </div>
        )}

        {viewMode === 'upscaler' && (
          <div className="animate-fadeIn">
            <Upscaler
              replicateToken={replicateToken}
              initialImage={generationState.resultImage}
              onBack={() => setViewMode('generator')}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
