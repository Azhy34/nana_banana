import React from 'react';
import { AIProvider } from '../types';

interface HeaderProps {
  provider: AIProvider;
  setProvider: (provider: AIProvider) => void;
  openRouterApiKey: string;
  setOpenRouterApiKey: (key: string) => void;
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  replicateToken: string;
  setReplicateToken: (token: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  provider,
  setProvider,
  openRouterApiKey,
  setOpenRouterApiKey,
  geminiApiKey,
  setGeminiApiKey,
  replicateToken,
  setReplicateToken
}) => {
  const activeLabel = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
  const activeApiKey = provider === 'openrouter' ? openRouterApiKey : geminiApiKey;

  const setActiveApiKey = (value: string) => {
    if (provider === 'openrouter') {
      setOpenRouterApiKey(value);
      return;
    }
    setGeminiApiKey(value);
  };

  return (
    <header className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">AI <span className="text-indigo-400">Composer</span></h1>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative group">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AIProvider)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-32 transition-all"
            >
              <option value="openrouter">OpenRouter</option>
              <option value="gemini">Gemini</option>
            </select>
            <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-slate-800 text-xs text-slate-400 rounded border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              API router selector. Default: OpenRouter.
            </div>
          </div>

          <div className="relative group">
            <input
              type="password"
              placeholder={`${activeLabel} Key`}
              value={activeApiKey}
              onChange={(e) => setActiveApiKey(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none w-36 transition-all"
            />
            <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-slate-800 text-xs text-slate-400 rounded border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Active provider key for image generation.
            </div>
          </div>

          <div className="relative group">
            <input
              type="password"
              placeholder="Replicate Token"
              value={replicateToken}
              onChange={(e) => setReplicateToken(e.target.value)}
              className="bg-slate-800 border border-purple-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none w-36 transition-all"
            />
            <div className="absolute right-0 top-full mt-2 w-56 p-2 bg-slate-800 text-xs text-slate-400 rounded border border-slate-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Replicate token for upscaling and Qwen Image 2 generation.
            </div>
          </div>

          <div className="text-xs font-medium text-slate-500 bg-slate-800/50 px-2 py-1 rounded-full border border-slate-700">
            v1.1
          </div>
        </div>
      </div>
    </header>
  );
};
