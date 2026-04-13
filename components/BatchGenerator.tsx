import React, { useState } from 'react';
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
  const [batchStep, setBatchStep] = useState<BatchStep>('setup');

  // Setup
  const [wallpaper, setWallpaper] = useState<UploadedImage | null>(null);
  const [count, setCount] = useState(12);
  const [model, setModel] = useState<ModelType>(ModelType.Flash31);
  const [formatDist, setFormatDist] = useState<Record<BatchAspectRatio, number>>({ '9:16': 6, '16:9': 4, '1:1': 2 });

  // Cards
  const [cards, setCards] = useState<BatchCard[]>([]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const formatTotal = formatDist['9:16'] + formatDist['16:9'] + formatDist['1:1'];

  // ── Setup handlers ──────────────────────────────────────────────────────────

  const handleWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setWallpaper({ id: Math.random().toString(36).substring(7), data: dataUrl.split(',')[1], mimeType: file.type, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const updateFormat = (key: BatchAspectRatio, delta: number) => {
    setFormatDist(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const selectCount = (n: number) => {
    setCount(n);
    // Rescale distribution proportionally to new count
    const total = formatDist['9:16'] + formatDist['16:9'] + formatDist['1:1'];
    if (total === 0) {
      setFormatDist({ '9:16': Math.round(n * 0.5), '16:9': Math.round(n * 0.33), '1:1': n - Math.round(n * 0.5) - Math.round(n * 0.33) });
      return;
    }
    const p9 = Math.round((formatDist['9:16'] / total) * n);
    const p16 = Math.round((formatDist['16:9'] / total) * n);
    const p1 = n - p9 - p16;
    setFormatDist({ '9:16': p9, '16:9': p16, '1:1': Math.max(0, p1) });
  };

  const generateCards = () => {
    if (!wallpaper || formatTotal === 0) return;
    const formats: BatchAspectRatio[] = [
      ...Array(formatDist['9:16']).fill('9:16'),
      ...Array(formatDist['16:9']).fill('16:9'),
      ...Array(formatDist['1:1']).fill('1:1'),
    ].sort(() => Math.random() - 0.5);

    const ageGroupCycle: AgeGroupKey[] = ['baby', 'vorschul', 'schulkind', 'teenager'];
    setCards(formats.map((ar, idx) => {
      const ageGroup = ageGroupCycle[idx % ageGroupCycle.length];
      const tags = generateRandomTags(ar, ageGroup);
      return { id: Math.random().toString(36).substring(7), tags, promptText: buildGeminiPrompt(tags), status: 'idle', resultImage: null, error: null, selected: true };
    }));
    setBatchStep('cards');
  };

  // ── Card handlers ───────────────────────────────────────────────────────────

  const updateTag = (cardId: string, key: keyof BatchPromptTags, value: string | string[]) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const newTags = { ...c.tags, [key]: value };
      if (key === 'ageGroup') {
        const ageOptions = getKeyObjectsForAge(value as AgeGroupKey);
        newTags.keyObject = ageOptions[Math.floor(Math.random() * ageOptions.length)];
      }
      return { ...c, tags: newTags, promptText: buildGeminiPrompt(newTags) };
    }));
  };

  const rerandomize = (cardId: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const tags = generateRandomTags(c.tags.aspectRatio);
      return { ...c, tags, promptText: buildGeminiPrompt(tags) };
    }));
  };

  const rerandomizeAccessories = (cardId: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const acc = [...TAG_OPTIONS.accessories].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2));
      const newTags = { ...c.tags, accessories: acc };
      return { ...c, tags: newTags, promptText: buildGeminiPrompt(newTags) };
    }));
  };

  const deleteCard = (cardId: string) => setCards(prev => prev.filter(c => c.id !== cardId));

  const addCard = () => {
    const tags = generateRandomTags('9:16');
    setCards(prev => [...prev, { id: Math.random().toString(36).substring(7), tags, promptText: buildGeminiPrompt(tags), status: 'idle', resultImage: null, error: null, selected: true }]);
  };

  const updatePromptText = (cardId: string, text: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, promptText: text } : c));
  };

  // ── Generation ──────────────────────────────────────────────────────────────

  const handleGenerateAll = async () => {
    if (isQwenModel(model) && !replicateToken) {
      alert('Please enter your Replicate Token first.');
      return;
    }
    if (!isQwenModel(model) && !apiKey) {
      const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
      alert(`Please enter your ${providerLabel} API Key first.`);
      return;
    }
    if (!wallpaper) return;
    setIsGenerating(true);
    setCards(prev => prev.map(c => ({ ...c, status: 'loading', resultImage: null, error: null })));
    setBatchStep('results');

    await Promise.allSettled(cards.map(async (card) => {
      try {
        const img = await generateBatchImage(apiKey, replicateToken, wallpaper, card.promptText, card.tags.aspectRatio, model, provider);
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'done', resultImage: img } : c));
      } catch (err: any) {
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error', error: err.message ?? 'Failed' } : c));
      }
    }));

    setIsGenerating(false);
  };

  const regenerate = async (cardId: string) => {
    if ((!apiKey && !isQwenModel(model)) || !wallpaper || (isQwenModel(model) && !replicateToken)) return;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'loading', error: null } : c));
    try {
      const img = await generateBatchImage(apiKey, replicateToken, wallpaper, card.promptText, card.tags.aspectRatio, model, provider);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'done', resultImage: img } : c));
    } catch (err: any) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'error', error: err.message } : c));
    }
  };

  const toggleSelected = (cardId: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, selected: !c.selected } : c));
  };

  const downloadSelected = async () => {
    const toDownload = cards.filter(c => c.selected && c.resultImage);
    for (let i = 0; i < toDownload.length; i++) {
      await downloadImage(toDownload[i].resultImage!, `wallpaper-${i + 1}-${toDownload[i].tags.aspectRatio.replace(':', 'x')}.png`);
      await new Promise(r => setTimeout(r, 200));
    }
  };

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
          {(['9:16', '16:9', '1:1'] as BatchAspectRatio[]).map(ar => (
            <div key={ar} className="flex items-center gap-3 mb-3 last:mb-0">
              <span className="text-slate-300 text-sm font-mono w-10 shrink-0">{ar}</span>
              <span className="text-slate-500 text-xs flex-1 truncate">
                {ar === '9:16' ? 'Portrait — mobile, vertical shots' : ar === '16:9' ? 'Landscape — wide room views' : 'Square — Etsy main thumbnail'}
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
          <div className="flex gap-3">
            {([
              { value: ModelType.Flash31, label: '3.1 Flash', sub: 'Fast & cheap' },
              { value: ModelType.Pro, label: 'Pro', sub: 'High quality' },
              { value: ModelType.QwenImage2, label: 'Qwen 2', sub: 'Replicate' },
            ] as const).map(({ value, label, sub }) => (
              <button key={value} onClick={() => setModel(value)}
                className={`flex-1 py-3 px-2 rounded-xl transition-all text-center ${model === value ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
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
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 text-sm font-medium">#{idx + 1}</span>
                  <span className="bg-indigo-500/20 text-indigo-300 text-xs font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">{card.tags.aspectRatio}</span>
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
            <div className={`relative bg-slate-900 ${card.tags.aspectRatio === '9:16' ? 'aspect-[9/16]' : card.tags.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-square'}`}>
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
            <div className="p-2.5 flex items-center justify-between gap-1.5">
              <span className="text-slate-500 text-xs font-mono shrink-0">{card.tags.aspectRatio}</span>
              <div className="flex gap-1">
                {card.status === 'done' && card.resultImage && (
                  <>
                    <button onClick={() => downloadImage(card.resultImage!, `wallpaper-${idx + 1}-${card.tags.aspectRatio.replace(':', 'x')}.png`)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Download">⬇</button>
                    <button onClick={() => onSendToTool('upscaler', card.resultImage!)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Send to Upscaler">↑ Scale</button>
                    <button onClick={() => onSendToTool('cropper', card.resultImage!)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Send to Cropper">✂</button>
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
