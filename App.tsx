import React, { useState } from 'react';
import { WizardSteps } from './components/WizardSteps';
import { ImageUploader } from './components/ImageUploader';
import { Step, UploadedImage, GenerationSettings, ModelType, GenerationState } from './types';
import { ASPECT_RATIOS, IMAGE_SIZES, MODEL_OPTIONS } from './constants';
import { generateImageComposition } from './services/geminiService';

function App() {
  const [step, setStep] = useState<Step>(Step.Prompt);
  
  // Data State
  const [apiKey, setApiKey] = useState<string>('');
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

  const getModelDescription = (model: ModelType) => {
    if (model === ModelType.Pro) {
        return "✨ Best for high fidelity, complex instructions, and 4K resolution. (Recommended)";
    }
    return "⚡️ Optimized for speed. Good for quick experiments.";
  };

  // Render Steps
  const renderStepContent = () => {
    switch (step) {
      case Step.Prompt:
        return (
          <div className="space-y-6 animate-fadeIn max-w-2xl mx-auto">
            
            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                <label className="block text-sm font-medium text-indigo-300 mb-2">Image Description (Prompt)</label>
                <p className="text-xs text-slate-400 mb-3">
                  Describe the image you want to generate in detail.<br/>
                  <span className="text-indigo-400 font-medium">TIP:</span> Be specific about subject, style, colors, and lighting.
                </p>
                <textarea
                    className="w-full h-32 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="e.g. A futuristic city with flying cars at sunset, cyberpunk style..."
                    value={settings.prompt}
                    onChange={(e) => setSettings({...settings, prompt: e.target.value})}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Model</label>
                    <select 
                        value={settings.model}
                        onChange={(e) => setSettings({...settings, model: e.target.value as ModelType})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500"
                    >
                        {MODEL_OPTIONS.map(opt => (
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
                        onChange={(e) => setSettings({...settings, aspectRatio: e.target.value as any})}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-indigo-500"
                    >
                        {ASPECT_RATIOS.map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>

                {settings.model === ModelType.Pro && (
                    <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-2">Resolution</label>
                        <div className="flex gap-4">
                            {IMAGE_SIZES.map(size => (
                                <label key={size} className={`
                                    flex-1 cursor-pointer rounded-lg border p-3 text-center transition-all
                                    ${settings.imageSize === size 
                                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' 
                                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}
                                `}>
                                    <input 
                                        type="radio" 
                                        name="imageSize" 
                                        value={size} 
                                        checked={settings.imageSize === size}
                                        onChange={() => setSettings({...settings, imageSize: size as any})}
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

      case Step.Reference:
        return (
          <div className="space-y-6 animate-fadeIn">
            <ImageUploader
              title="Step 2: Reference Image (Optional)"
              description="Upload an image to guide the style, composition, or atmosphere. If skipped, the image will be generated based on the prompt only."
              uploadedImages={referenceImages}
              onUpload={handleUpload}
              onRemove={removeImage}
              maxImages={1}
              multiple={false}
            />
            <div className="flex justify-between">
               <button onClick={() => setStep(Step.Prompt)} className="px-6 py-3 text-slate-400 hover:text-white font-medium transition-colors">
                Back
              </button>
              <button
                onClick={handleGenerate}
                disabled={!apiKey}
                title={!apiKey ? "Please enter API Key above" : ""}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/30 transform hover:scale-105 flex items-center"
              >
                 Generate <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
              </button>
            </div>
          </div>
        );

      case Step.Result:
        return (
          <div className="space-y-6 animate-fadeIn text-center">
             {generationState.isLoading ? (
                 <div className="py-20 flex flex-col items-center">
                     <div className="relative w-24 h-24 mb-8">
                         <div className="absolute inset-0 border-4 border-indigo-500/30 rounded-full"></div>
                         <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                         <div className="absolute inset-0 flex items-center justify-center">
                             <svg className="w-8 h-8 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                         </div>
                     </div>
                     <h3 className="text-2xl font-bold text-white mb-2">Generating Image...</h3>
                     <p className="text-slate-400 max-w-md mx-auto">
                        Creating your vision based on the prompt {referenceImages.length > 0 && "and reference"}...
                     </p>
                 </div>
             ) : generationState.error ? (
                 <div className="py-10 bg-red-900/20 border border-red-700/50 rounded-xl p-6 max-w-2xl mx-auto">
                     <div className="text-red-400 text-5xl mb-4">⚠️</div>
                     <h3 className="text-xl font-bold text-red-200 mb-2">Generation Failed</h3>
                     <p className="text-red-300 mb-6">{generationState.error}</p>
                     <button 
                        onClick={() => setStep(Step.Prompt)}
                        className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
                     >
                         Adjust Settings & Retry
                     </button>
                 </div>
             ) : (
                 <div className="max-w-3xl mx-auto">
                     <div className="bg-slate-800 p-2 rounded-xl border border-slate-700 shadow-2xl mb-6">
                         <img 
                            src={generationState.resultImage!} 
                            alt="Generated Result" 
                            className="w-full h-auto rounded-lg"
                         />
                     </div>
                     <div className="flex justify-center gap-4">
                         <button 
                             onClick={() => setStep(Step.Prompt)}
                             className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium rounded-lg transition-colors"
                         >
                             Make Adjustments
                         </button>
                         <a 
                             href={generationState.resultImage!} 
                             download={`gemini-gen-${Date.now()}.png`}
                             className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/30 flex items-center"
                         >
                             Download Image <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                         </a>
                     </div>
                 </div>
             )}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-indigo-500/30">
        {/* Header */}
        <header className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                         <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-tight">Gemini <span className="text-indigo-400">Composer</span></h1>
                </div>
                
                {/* API Key Input */}
                <div className="flex items-center space-x-3">
                    <div className="relative group">
                        <input
                            type="password"
                            placeholder="Enter Gemini API Key"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-64 transition-all"
                        />
                         <div className="absolute right-0 top-full mt-2 w-64 p-2 bg-slate-800 text-xs text-slate-400 rounded border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                            Your API key is used only in your browser for this session and is never stored on our servers.
                        </div>
                    </div>
                    <div className="text-xs font-medium text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700">
                         v1.0
                    </div>
                </div>
            </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
            <div className="mb-12 text-center">
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
        </main>
    </div>
  );
}

export default App;
