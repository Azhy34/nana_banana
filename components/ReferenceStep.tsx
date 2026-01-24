import React from 'react';
import { ImageUploader } from './ImageUploader';
import { Step, UploadedImage } from '../types';

interface ReferenceStepProps {
  referenceImages: UploadedImage[];
  handleUpload: (file: File) => Promise<void>;
  removeImage: () => void;
  setStep: (step: Step) => void;
  handleGenerate: () => Promise<void>;
  apiKey: string;
}

export const ReferenceStep: React.FC<ReferenceStepProps> = ({
  referenceImages,
  handleUpload,
  removeImage,
  setStep,
  handleGenerate,
  apiKey
}) => {
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
};
