import React, { useState } from 'react';
import { GenerationState, Step, UploadedImage, ViewMode } from '../types';
import { downloadImage } from '../services/downloadService';

interface ResultStepProps {
  generationState: GenerationState;
  referenceImages: UploadedImage[];
  setStep: (step: Step) => void;
  onViewModeChange?: (mode: ViewMode) => void;
}

export const ResultStep: React.FC<ResultStepProps> = ({
  generationState,
  referenceImages,
  setStep,
  onViewModeChange
}) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!generationState.resultImage) return;
    
    setIsDownloading(true);
    try {
      await downloadImage(
        generationState.resultImage,
        `gemini-gen-${Date.now()}.png`
      );
    } finally {
      setIsDownloading(false);
    }
  };

  if (generationState.isLoading) {
    return (
      <div className="py-20 flex flex-col items-center animate-fadeIn">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-indigo-500/30 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">Generating Image...</h3>
        <p className="text-slate-400 max-w-md mx-auto text-center">
          Creating your vision based on the prompt {referenceImages.length > 0 && "and reference"}...
        </p>
      </div>
    );
  }

  if (generationState.error) {
    return (
      <div className="py-10 bg-red-900/20 border border-red-700/50 rounded-xl p-6 max-w-2xl mx-auto animate-fadeIn text-center">
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
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fadeIn">
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
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-indigo-500/30 flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isDownloading ? (
            <>Downloading... <svg className="animate-spin h-5 w-5 ml-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg></>
          ) : (
            <>Download Image <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg></>
          )}
        </button>
        <button
          onClick={() => onViewModeChange?.('cropper')}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-purple-500/30 flex items-center"
        >
          ✂️ Etsy Cropper <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>
    </div>
  );
};
