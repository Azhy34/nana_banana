import React from 'react';
import { Step } from '../types';

interface WizardStepsProps {
  currentStep: Step;
  setStep: (step: Step) => void;
}

const steps = [
  { id: Step.Reference, label: '1. Reference' },
  { id: Step.People, label: '2. People' },
  { id: Step.Prompt, label: '3. Settings' },
  { id: Step.Result, label: '4. Result' },
];

export const WizardSteps: React.FC<WizardStepsProps> = ({ currentStep, setStep }) => {
  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <div className="flex items-center justify-between relative">
        {/* Progress Bar Background */}
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-slate-700 -z-10 rounded-full" />
        
        {/* Active Progress Bar */}
        <div 
            className="absolute left-0 top-1/2 transform -translate-y-1/2 h-1 bg-indigo-500 -z-10 transition-all duration-500 rounded-full"
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <button
              key={step.id}
              onClick={() => {
                // Only allow clicking completed steps or the immediate next one if data exists (simplified to always allow back nav)
                if (step.id < currentStep) setStep(step.id);
              }}
              disabled={step.id > currentStep}
              className={`flex flex-col items-center group focus:outline-none ${step.id > currentStep ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold text-sm transition-all duration-300
                  ${isActive 
                    ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_15px_rgba(99,102,241,0.5)]' 
                    : isCompleted 
                      ? 'bg-slate-800 border-indigo-500 text-indigo-400' 
                      : 'bg-slate-800 border-slate-600 text-slate-500'
                  }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                ) : (
                  step.id
                )}
              </div>
              <span className={`mt-2 text-xs font-medium transition-colors duration-300 ${isActive || isCompleted ? 'text-indigo-300' : 'text-slate-500'}`}>
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
