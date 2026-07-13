import React, { useState } from 'react';
import { useBatch } from '../hooks/useBatch';
import { BatchCard, BatchAspectRatio, BatchPromptTags, AgeGroupKey, UploadedImage, ViewMode, ModelType, AIProvider } from '../types';
import { generateRandomTags, buildGeminiPrompt, TAG_OPTIONS, AGE_GROUP_LABELS, getKeyObjectsForAge } from '../services/promptGenerator';
import { generateBatchImage, isQwenModel } from '../services/generationRouter';
import { downloadImage } from '../services/downloadService';

type BatchStep = 'setup' | 'cards' | 'results';

interface Props {
  provider: AIProvider;
  apiKey: string;
  replicateToken: string;
  onViewModeChange: (mode: ViewMode) => void;
  onSendToTool: (mode: ViewMode, image: string) => void;
}

const TAG_KEYS: Array<{ key: keyof Omit<BatchPromptTags, 'accessories' | 'aspectRatio'>; label: string }> = [
  { key: 'color', label: 'Color' },
  { key: 'style', label: 'Style' },
  { key: 'brand', label: 'Brand' },
  { key: 'ageGroup', label: 'Age Group' },
  { key: 'keyObject', label: 'Key Object' },
  { key: 'roomZone', label: 'Zone' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'cameraAngle', label: 'Angle' },
  { key: 'cameraDistance', label: 'Distance' },
  { key: 'depthOfField', label: 'DoF' },
];

function getOptionsForKey(key: keyof Omit<BatchPromptTags, 'accessories' | 'aspectRatio'>, card: BatchCard): string[] {
  switch (key) {
    case 'color': return TAG_OPTIONS.colors;
    case 'style': return TAG_OPTIONS.styles;
    case 'brand': return TAG_OPTIONS.brands;
    case 'ageGroup': return TAG_OPTIONS.ageGroups;
    case 'keyObject': return getKeyObjectsForAge(card.tags.ageGroup);
    case 'roomZone': return TAG_OPTIONS.roomZones;
    case 'lighting': return TAG_OPTIONS.lighting;
    case 'cameraAngle': return TAG_OPTIONS.cameraAngles;
    case 'cameraDistance': return TAG_OPTIONS.cameraDistances;
    case 'depthOfField': return TAG_OPTIONS.depthOfField;
  }
}

const selectClass = "bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500 w-full truncate";

export const BatchGenerator: React.FC<Props> = ({ provider, apiKey, replicateToken, onViewModeChange, onSendToTool }) => {
  const { state, actions } = useBatch(provider, apiKey, replicateToken);
  const { batchStep, wallpaper, count, model, formatDist, cards, expandedCard, isGenerating, formatTotal } = state;
  const {
    setBatchStep, setWallpaper, setModel, setExpandedCard,
    handleWallpaperUpload, updateFormat, selectCount, generateCards,
    updateTag, rerandomize, rerandomizeAccessories, deleteCard, addCard,
    updatePromptText, handleGenerateAll, regenerate, refineInPro, toggleSelected, downloadSelected
  } = actions;

  // ── Render: SETUP ───────────────────────────────────────────────────────────

  if (batchStep === 'setup') {
    return (
      <div className="max-w-lg mx-auto animate-fadeIn">
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-bold text-white mb-3 tracking-tight">Batch Generator</h2>
          <p className="text-slate-400 text-lg">Generate 10–15 listing photos from one wallpaper</p>
        </div>

        {/* Wallpaper Upload */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-4">
          <h3 className="text-white font-semibold mb-3">Wallpaper Reference</h3>
          {wallpaper ? (
            <div className="flex items-center gap-4">
              <img src={wallpaper.previewUrl} className="w-20 h-20 object-cover rounded-lg border border-slate-600" alt="wallpaper preview" />
              <div>
                <p className="text-green-400 text-sm font-medium mb-1">✓ Wallpaper loaded</p>
                <button onClick={() => setWallpaper(null)} className="text-slate-500 hover:text-red-400 text-xs transition-colors">Remove</button>
              </div>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-slate-600 rounded-xl cursor-pointer hover:border-indigo-500 transition-colors group">
              <svg className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 mb-2 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-slate-400 text-sm">Upload wallpaper photo</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleWallpaperUpload} />
            </label>
          )}
        </div>

        {/* Count */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-4">
          <h3 className="text-white font-semibold mb-3">Number of Photos</h3>
          <div className="flex gap-3">
            {[6, 9, 12, 15].map(n => (
              <button key={n} onClick={() => selectCount(n)}
                className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${count === n ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Format Distribution */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <h3 className="text-white font-semibold mb-4">Format Distribution</h3>
          {(['9:16', '2:3', '4:3'] as BatchAspectRatio[]).map(ar => (
            <div key={ar} className="flex items-center gap-3 mb-3 last:mb-0">
              <span className="text-slate-300 text-sm font-mono w-10 shrink-0">{ar}</span>
              <span className="text-slate-500 text-xs flex-1 truncate">
                {ar === '9:16' ? 'Portrait — mobile, vertical shots' : ar === '2:3' ? 'Portrait — vertical room views' : 'Landscape — Etsy main thumbnail'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => updateFormat(ar, -1)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-colors">−</button>
                <span className="w-6 text-center text-white font-bold tabular-nums">{formatDist[ar]}</span>
                <button onClick={() => updateFormat(ar, +1)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-colors">+</button>
              </div>
            </div>
          ))}
          <div className={`mt-4 pt-3 border-t border-slate-700 text-sm flex justify-between font-medium ${formatTotal === count ? 'text-green-400' : 'text-yellow-400'}`}>
            <span>Total: {formatTotal} photos</span>
            {formatTotal !== count && <span>⚠ Set to {count}</span>}
          </div>
        </div>

        {/* Model */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <h3 className="text-white font-semibold mb-3">Model</h3>
          <div className="flex gap-3 flex-wrap">
            {([
              { value: ModelType.Flash31, label: '3.1 Flash', sub: 'Fast & cheap' },
              { value: ModelType.Pro, label: 'Pro', sub: 'High quality' },
              { value: ModelType.ABTest, label: '50/50 Split', sub: 'Pro & Flash A/B' },
              { value: ModelType.QwenImage2, label: 'Qwen 2', sub: 'Replicate' },
            ] as const).map(({ value, label, sub }) => (
              <button key={value} onClick={() => setModel(value)}
                className={`flex-1 min-w-[100px] py-3 px-2 rounded-xl transition-all text-center ${model === value ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                <div className="font-bold text-sm">{label}</div>
                <div className="text-xs opacity-70 mt-0.5">{sub}</div>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generateCards} disabled={!wallpaper || formatTotal === 0}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-lg">
          🎲 Generate Prompts ({formatTotal})
        </button>
      </div>
    );
  }

  // ── Render: CARDS ───────────────────────────────────────────────────────────

  if (batchStep === 'cards') {
    return (
      <div className="max-w-4xl mx-auto animate-fadeIn">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Review Prompts</h2>
            <p className="text-slate-400 text-sm mt-1">{cards.length} photos — edit tags or prompt text before generating</p>
          </div>
          <button onClick={() => setBatchStep('setup')} className="text-slate-400 hover:text-slate-200 text-sm transition-colors">← Back to Setup</button>
        </div>

        <div className="space-y-4 mb-6">
          {cards.map((card, idx) => (
            <div key={card.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-slate-400 text-sm font-medium">#{idx + 1}</span>
                  <span className="bg-indigo-500/20 text-indigo-300 text-xs font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">{card.tags.aspectRatio}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${card.model === ModelType.Pro ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-teal-500/20 text-teal-300 border-teal-500/30'}`}>
                    {card.model === ModelType.Pro ? 'Pro' : 'Flash'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => rerandomize(card.id)}
                    className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors">
                    🔄 Randomize
                  </button>
                  <button onClick={() => deleteCard(card.id)}
                    className="px-3 py-1.5 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors">
                    🗑
                  </button>
                </div>
              </div>

              {/* Tags Grid */}
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {TAG_KEYS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-slate-500 text-xs block mb-1">{label}</label>
                    <select value={card.tags[key] as string} onChange={e => updateTag(card.id, key, e.target.value)} className={selectClass}>
                      {getOptionsForKey(key, card).map(opt => (
                        <option key={opt} value={opt}>
                          {key === 'ageGroup' ? AGE_GROUP_LABELS[opt as AgeGroupKey] : opt}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Accessories */}
              <div className="px-4 pb-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-slate-500 text-xs block mb-1">Accessories</span>
                  <p className="text-slate-300 text-xs leading-relaxed">{card.tags.accessories.join(' · ')}</p>
                </div>
                <button onClick={() => rerandomizeAccessories(card.id)}
                  title="Re-randomize accessories"
                  className="shrink-0 mt-4 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 rounded transition-colors">
                  🔄
                </button>
              </div>

              {/* Expand Prompt */}
              <div className="px-4 pb-4">
                <button onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                  {expandedCard === card.id ? '▲ Hide prompt' : '▼ Edit full prompt'}
                </button>
                {expandedCard === card.id && (
                  <textarea value={card.promptText} onChange={e => updatePromptText(card.id, e.target.value)} rows={10}
                    className="mt-2 w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-slate-300 text-xs font-mono resize-none focus:outline-none focus:border-indigo-500" />
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={addCard}
            className="px-4 py-3 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-colors font-medium">
            + Add Card
          </button>
          <button onClick={handleGenerateAll} disabled={cards.length === 0}
            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20">
            ▶ Generate All {cards.length} Photos
          </button>
        </div>
      </div>
    );
  }

  // ── Render: RESULTS ─────────────────────────────────────────────────────────

  const doneCount = cards.filter(c => c.status === 'done').length;
  const selectedCount = cards.filter(c => c.selected && c.resultImage).length;

  return (
    <div className="max-w-5xl mx-auto animate-fadeIn">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Results</h2>
          <p className="text-slate-400 text-sm mt-1">
            {isGenerating ? `Generating... ${doneCount} / ${cards.length} done` : `${doneCount} of ${cards.length} generated`}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button onClick={() => setBatchStep('cards')} className="text-slate-400 hover:text-slate-200 text-sm transition-colors">← Back to Prompts</button>
          {selectedCount > 0 && (
            <button onClick={downloadSelected}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-all text-sm shadow shadow-indigo-500/20">
              ⬇ Download Selected ({selectedCount})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card, idx) => (
          <div key={card.id}
            className={`bg-slate-800 rounded-xl border overflow-hidden transition-all ${card.selected && card.resultImage ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10' : 'border-slate-700'}`}>
            {/* Image Area */}
            <div className={`relative bg-slate-900 ${card.tags.aspectRatio === '9:16' ? 'aspect-[9/16]' : card.tags.aspectRatio === '2:3' ? 'aspect-[2/3]' : 'aspect-[4/3]'}`}>
              {card.status === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-slate-400 text-xs">Generating...</span>
                </div>
              )}
              {card.status === 'done' && card.resultImage && (
                <>
                  <img src={card.resultImage} alt={`Result ${idx + 1}`} className="w-full h-full object-cover" />
                  <button onClick={() => toggleSelected(card.id)}
                    className={`absolute top-2 right-2 w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${card.selected ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-slate-900/70 border-slate-500 text-transparent hover:border-slate-300'}`}>
                    ✓
                  </button>
                </>
              )}
              {card.status === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                  <span className="text-red-400 text-3xl mb-2">⚠</span>
                  <span className="text-red-300 text-xs leading-relaxed">{card.error}</span>
                </div>
              )}
              {card.status === 'idle' && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs">Waiting...</div>
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 flex items-center justify-between gap-1.5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs font-mono shrink-0">{card.tags.aspectRatio}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${card.model === ModelType.Pro ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-teal-500/20 text-teal-400 border-teal-500/30'}`}>
                  {card.model === ModelType.Pro ? 'Pro ($0.13)' : 'Flash ($0.05)'}
                </span>
              </div>
              <div className="flex gap-1">
                {card.status === 'done' && card.resultImage && (
                  <>
                    {card.model === ModelType.Flash31 && (
                      <button onClick={() => refineInPro(card.id)}
                        className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 text-xs rounded border border-amber-500/20 transition-colors font-medium" 
                        title="Generate high-detail 2K version in Pro model (ideal for Etsy)">✨ Refine (2K)</button>
                    )}
                    <button onClick={() => downloadImage(card.resultImage!, `wallpaper-${idx + 1}-${card.tags.aspectRatio.replace(':', 'x')}.png`)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Download">⬇</button>
                    <button onClick={() => onSendToTool('upscaler', card.resultImage!)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Send to Upscaler">↑ Scale</button>
                    <button onClick={() => onSendToTool('cropper', card.resultImage!)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Send to Cropper">✂</button>
                    <button 
                      onClick={() => onSendToTool('video', card.resultImage!)}
                      className="px-2 py-1 text-xs rounded transition-colors font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
                      title="Анимировать пролет камеры (Veo 3.1)"
                    >
                      🎬 Animate
                    </button>
                  </>
                )}
                {(card.status === 'done' || card.status === 'error') && (
                  <button onClick={() => regenerate(card.id)}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Regenerate">🔄</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
