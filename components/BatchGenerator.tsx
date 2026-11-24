import React from 'react';
import { useBatch } from '../hooks/useBatch';
import { AudienceKey, BatchCard, BatchAspectRatio, BatchPersonMode, BatchPromptTags, AgeGroupKey, ViewMode, ModelType, AIProvider, PromptMode } from '../types';
import { TAG_OPTIONS, AGE_GROUP_LABELS, getColorsForStyle, muralSafeKeyObjects, TargetAgeFilter, resolveAgePool, PEOPLE_SCENE_OPTIONS } from '../services/promptGenerator';
import { getKieImageModels, getModelCapability, validateModelInput } from '../shared/modelContracts';
import { EXPORT_PRESET_OPTIONS, ExportPresetId } from '../services/exportCrop';
import { BATCH_COUNT_OPTIONS } from '../constants';

const ASPECT_CLASS_MAP: Record<BatchAspectRatio, string> = {
  '9:16': 'aspect-[9/16]',
  '2:3': 'aspect-[2/3]',
  '4:5': 'aspect-[4/5]',
  '3:4': 'aspect-[3/4]',
  '4:3': 'aspect-[4/3]',
};

type BatchStep = 'setup' | 'cards' | 'results';

interface Props {
  provider: AIProvider;
  apiKey: string;
  replicateToken: string;
  kieApiKey?: string;
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
    case 'color': return getColorsForStyle(card.tags.style, card.tags.audience);
    case 'style': return TAG_OPTIONS.styles;
    case 'brand': return TAG_OPTIONS.brands;
    case 'ageGroup': return TAG_OPTIONS.ageGroups;
    case 'keyObject': return muralSafeKeyObjects(card.tags.ageGroup);
    case 'roomZone': return TAG_OPTIONS.roomZones;
    case 'lighting': return TAG_OPTIONS.lighting;
    case 'cameraAngle': return TAG_OPTIONS.cameraAngles;
    case 'cameraDistance': return TAG_OPTIONS.cameraDistances;
    case 'depthOfField': return TAG_OPTIONS.depthOfField;
    default: return [];
  }
}

const selectClass = "bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500 w-full truncate";

export const BatchGenerator: React.FC<Props> = ({ provider, apiKey, replicateToken, kieApiKey = '', onViewModeChange, onSendToTool }) => {
  const { state, actions } = useBatch(provider, apiKey, replicateToken, kieApiKey);
  const { batchStep, wallpaper, count, selectedModels, formatDist, cards, expandedCard, isGenerating, formatTotal, includeMacro, audience, targetAge, includeHero, promptMode, exportPreset, isExporting } = state;
  const {
    setBatchStep, setWallpaper, setSelectedModels, setExpandedCard, setIncludeMacro,
    setAudience, setTargetAge, setIncludeHero, setPromptMode, setExportPreset,
    handleWallpaperUpload, updateFormat, selectCount, generateCards,
    updateTag, rerandomize, rerandomizeAccessories, deleteCard, addCard,
    updatePromptText, handleGenerateAll, regenerate, refineInPro, toggleSelected, downloadCard, downloadSelected
  } = actions;

  // ── Render: SETUP ───────────────────────────────────────────────────────────

  if (batchStep === 'setup') {
    return (
      <div className="max-w-lg mx-auto animate-fadeIn">
        <div className="mb-10 text-center">
          <h2 className="text-4xl font-bold text-white mb-3 tracking-tight">Batch Generator</h2>
          <p className="text-slate-400 text-lg">Generate 3–15 listing photos from one wallpaper</p>
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

        {/* Macro Texture in Interior (Craft Lambda) */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/textures/craft_lambda.jpg"
                className="w-14 h-14 object-cover rounded-lg border border-slate-600 shadow-md shrink-0"
                alt="Craft Lambda sand texture"
              />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-semibold text-sm">Макро-кадр фактуры в интерьере</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Craft Lambda · Песок
                  </span>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Добавляет в батч 1 крупный план стены в интерьере с чистым референсом фактуры. Обычные комнаты идут строго с 1 референсом обоев (1:1).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIncludeMacro(!includeMacro)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                includeMacro ? 'bg-indigo-600' : 'bg-slate-700'
              }`}
              title="Добавить 1 макро-кадр фактуры в батч"
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  includeMacro ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Count */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-4">
          <h3 className="text-white font-semibold mb-3">Number of Photos</h3>
          <div className="flex gap-3">
            {BATCH_COUNT_OPTIONS.map(n => (
              <button key={n} onClick={() => selectCount(n)}
                className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${count === n ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Format Distribution */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-4">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-white font-semibold">Format Distribution</h3>
            <span className="text-[11px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded">
              2:3 фото-мастер → Сайт/Meta 4:5 + Pinterest 2:3
            </span>
          </div>
          {(['2:3', '9:16'] as BatchAspectRatio[]).map(ar => (
            <div key={ar} className="flex items-center gap-3 mb-3">
              <span className="text-slate-200 text-sm font-mono font-semibold w-10 shrink-0">{ar}</span>
              <span className="text-slate-400 text-xs flex-1 truncate">
                {ar === '2:3'
                  ? 'Photo Master — авто-кроп в 4:5 (Сайт, Google Shopping, Meta Feed/Carousel) + 2:3 (Pinterest)'
                  : 'Video Master — Reels, Stories, Shorts и Video Animator (9:16)'}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => updateFormat(ar, -1)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-colors">−</button>
                <span className="w-6 text-center text-white font-bold tabular-nums">{formatDist[ar]}</span>
                <button onClick={() => updateFormat(ar, +1)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-colors">+</button>
              </div>
            </div>
          ))}
          {(() => {
            const extraTotal = formatDist['4:5'] + formatDist['3:4'] + formatDist['4:3'];
            return (
              <details className="mt-2 pt-2 border-t border-slate-700/60">
                <summary className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer select-none flex items-center justify-between">
                  <span>Доп. форматы вручную (4:5, 3:4, 4:3)</span>
                  {extraTotal > 0 && <span className="text-amber-300 font-semibold">{extraTotal} выбрано</span>}
                </summary>
                <div className="mt-3 space-y-2.5">
                  {(['4:5', '3:4', '4:3'] as BatchAspectRatio[]).map(ar => (
                    <div key={ar} className="flex items-center gap-3">
                      <span className="text-slate-300 text-sm font-mono w-10 shrink-0">{ar}</span>
                      <span className="text-slate-500 text-xs flex-1 truncate">
                        {ar === '4:5'
                          ? 'Portrait — прямой 4:5 без кропа (без GPT Image 2K / Grok)'
                          : ar === '3:4'
                          ? 'Portrait — Etsy Vertical'
                          : 'Landscape — Etsy horizontal thumbnail'}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => updateFormat(ar, -1)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-colors">−</button>
                        <span className="w-6 text-center text-white font-bold tabular-nums">{formatDist[ar]}</span>
                        <button onClick={() => updateFormat(ar, +1)} className="w-7 h-7 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold transition-colors">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })()}
          <div className={`mt-4 pt-3 border-t border-slate-700 text-sm flex justify-between font-medium ${formatTotal === count ? 'text-green-400' : 'text-yellow-400'}`}>
            <span>Total: {formatTotal} photos</span>
            {formatTotal !== count && <span>⚠ Set to {count}</span>}
          </div>
        </div>

        {/* Audience & Hero */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-4 space-y-4">
          <div>
            <h3 className="text-white font-semibold mb-2 text-sm">Wallpaper Audience</h3>
            <div className="flex gap-2">
              {([
                { value: 'neutral', label: 'Neutral' },
                { value: 'boy', label: 'Boy (no pink/lilac)' },
                { value: 'girl', label: 'Girl' },
              ] as const).map(opt => (
                <button key={opt.value} type="button" onClick={() => setAudience(opt.value as AudienceKey)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${audience === opt.value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-white font-semibold text-sm">Room Age Group</h3>
              <span className="text-[11px] text-slate-400">Можно выбрать несколько</span>
            </div>
            {(() => {
              const selectedAges = resolveAgePool(targetAge);
              const isAllKids = selectedAges.length === 3 && ['baby', 'vorschul', 'schulkind'].every(a => selectedAges.includes(a as AgeGroupKey));
              const toggleAge = (age: AgeGroupKey) => {
                if (selectedAges.includes(age)) {
                  if (selectedAges.length === 1) return; // keep at least 1 active
                  setTargetAge(selectedAges.filter(a => a !== age));
                } else {
                  setTargetAge([...selectedAges, age]);
                }
              };
              return (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetAge(['baby', 'vorschul', 'schulkind'])}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${isAllKids ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                  >
                    All Kids (0–9 mix)
                  </button>
                  {([
                    { value: 'baby', label: 'Baby (0–3)' },
                    { value: 'vorschul', label: 'Preschool (3–6)' },
                    { value: 'schulkind', label: 'School (6–9)' },
                    { value: 'teenager', label: 'Teen (10–16)' },
                  ] as const).map(opt => {
                    const active = selectedAges.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleAge(opt.value)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${active ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                      >
                        {active ? '✓ ' : ''}{opt.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-700">
            <div>
              <h3 className="text-white font-semibold text-sm">Include 1 Hero Shot (no bed)</h3>
              <p className="text-slate-400 text-xs">Минимализм: только ковёр + растение в кашпо, 100% открытые обои без мебели</p>
            </div>
            <button type="button" onClick={() => setIncludeHero(!includeHero)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${includeHero ? 'bg-indigo-600' : 'bg-slate-700'}`}>
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${includeHero ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>

        {/* Model (KIE-only multi-select mix, driven by shared/modelContracts.ts) */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          {(() => {
            const kieModels = getKieImageModels();
            const activePool = selectedModels.length > 0 ? selectedModels : [ModelType.NanoBanana21];
            const avgCredits = activePool.reduce((sum, id) => sum + (getModelCapability(id)?.kieCredits2K ?? 6), 0) / activePool.length;
            const avgUsd = activePool.reduce((sum, id) => sum + (getModelCapability(id)?.costUsd2K ?? 0.03), 0) / activePool.length;
            const totalCredits = Math.round(avgCredits * formatTotal);
            const totalUsd = (avgUsd * formatTotal).toFixed(2);
            const isExactMix = (ids: ModelType[]) =>
              activePool.length === ids.length && ids.every(id => activePool.includes(id));
            const splitPresets: { label: string; models: ModelType[] }[] = [
              { label: 'Gemini (Flash + Pro)', models: [ModelType.NanoBanana21, ModelType.NanoBananaPro] },
              { label: 'Flash + GPT', models: [ModelType.NanoBanana21, ModelType.GptImage2] },
              { label: 'Grok + GPT', models: [ModelType.GrokImagine, ModelType.GptImage2] },
              { label: 'Микс всех 4', models: kieModels.map(m => m.id as ModelType) },
            ];
            const toggleModel = (id: ModelType) => {
              if (activePool.includes(id)) {
                if (activePool.length === 1) return;
                setSelectedModels(activePool.filter(m => m !== id));
              } else {
                setSelectedModels([...activePool, id]);
              }
            };
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold">Models (KIE API)</h3>
                    <span className="text-[11px] text-slate-400">Все через KIE · можно миксовать</span>
                  </div>
                  <span className="text-xs font-mono text-emerald-300">
                    ~{totalCredits} KIE cr (${totalUsd})
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {kieModels.map((m) => {
                    const active = activePool.includes(m.id as ModelType);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleModel(m.id as ModelType)}
                        className={`py-3 px-3 rounded-xl transition-all text-center border ${
                          active
                            ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/30'
                            : 'bg-slate-700/70 border-slate-600/60 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="font-bold text-xs leading-tight">
                          {active ? '✓ ' : ''}{m.label}
                        </div>
                        <div className="text-[11px] opacity-80 mt-1 font-mono">
                          {m.kieCredits2K} cr · ${m.costUsd2K.toFixed(2)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-700/70">
                  <span className="text-[11px] text-slate-400 mr-1">Сплит:</span>
                  {splitPresets.map((preset) => {
                    const active = isExactMix(preset.models);
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setSelectedModels(preset.models)}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                          active
                            ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200'
                            : 'bg-slate-700/60 border-slate-600 text-slate-300 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
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
                    {getModelCapability(card.model)?.label || card.model}
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

              {/* People & Hero + Schema Check */}
              <div className="px-4 pb-3 flex flex-wrap items-center gap-3">
                <div className="min-w-[220px]">
                  <label className="text-slate-500 text-xs block mb-1">People (Storytelling & Reels)</label>
                  <select
                    value={card.tags.personMode === 'child_gaze' ? 'child_pointing' : (card.tags.personMode || 'none')}
                    onChange={e => updateTag(card.id, 'personMode', e.target.value as BatchPersonMode)}
                    className={selectClass}
                  >
                    <option value="none">No people (room only)</option>
                    {PEOPLE_SCENE_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={Boolean(card.tags.cleanFloor)}
                    onChange={e => updateTag(card.id, 'cleanFloor', e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-indigo-500 focus:ring-indigo-500"
                  />
                  Clean floor (no toys)
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={Boolean(card.tags.heroRoom)}
                    onChange={e => updateTag(card.id, 'heroRoom', e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-indigo-500"
                  />
                  Hero room (no bed)
                </label>
                <label className="flex items-center gap-2 text-xs text-amber-300 cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={Boolean(card.tags.macroTexture)}
                    onChange={e => updateTag(card.id, 'macroTexture', e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-amber-500"
                  />
                  🔍 Macro texture
                </label>
                {(() => {
                  const v = validateModelInput({
                    modelId: card.model,
                    prompt: card.promptText,
                    aspectRatio: card.tags.aspectRatio,
                    resolution: '2K',
                    refCount: card.tags.macroTexture ? 2 : 1,
                  });
                  return (
                    <span className={`mt-4 ml-auto text-[11px] px-2 py-0.5 rounded border ${v.ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-red-500/10 text-red-300 border-red-500/30'}`}>
                      {v.ok ? `✓ ${card.promptText.length} chars · ${card.tags.macroTexture ? '2 refs' : '1 ref'}` : `⚠ ${v.errors[0]}`}
                    </span>
                  );
                })()}
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
  const activePreset = EXPORT_PRESET_OPTIONS.find(p => p.id === exportPreset) ?? EXPORT_PRESET_OPTIONS[0];

  return (
    <div className="max-w-5xl mx-auto animate-fadeIn">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Results</h2>
          <p className="text-slate-400 text-sm mt-1">
            {isGenerating ? `Generating... ${doneCount} / ${cards.length} done` : `${doneCount} of ${cards.length} generated`}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button onClick={() => setBatchStep('cards')} className="text-slate-400 hover:text-slate-200 text-sm transition-colors">← Back to Prompts</button>
          <select
            aria-label="Формат выгрузки"
            title={activePreset.hint}
            value={exportPreset}
            onChange={(e) => setExportPreset(e.target.value as ExportPresetId)}
            className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            {EXPORT_PRESET_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          {selectedCount > 0 && (
            <button onClick={downloadSelected}
              disabled={isExporting}
              title={activePreset.hint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold rounded-lg transition-all text-sm shadow shadow-indigo-500/20">
              {isExporting ? '⏳ Сборка ZIP...' : `⬇ Скачать ZIP (${selectedCount} · ${activePreset.shortLabel})`}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((card, idx) => {
          const isVideoMaster = card.tags.aspectRatio === '9:16';
          const previewAspectClass =
            exportPreset === 'site_meta_4x5' && !isVideoMaster
              ? 'aspect-[4/5]'
              : exportPreset === 'meta_square_1x1' && !isVideoMaster
              ? 'aspect-square'
              : exportPreset === 'pinterest_2x3' && !isVideoMaster
              ? 'aspect-[2/3]'
              : ASPECT_CLASS_MAP[card.tags.aspectRatio] ?? 'aspect-[2/3]';
          const show4x5Guides = (exportPreset === 'pack_4x5_2x3' || exportPreset === 'pack_all') && card.tags.aspectRatio === '2:3';
          return (
          <div key={card.id}
            className={`bg-slate-800 rounded-xl border overflow-hidden transition-all ${card.selected && card.resultImage ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/10' : 'border-slate-700'}`}>
            {/* Image Area */}
            <div className={`relative bg-slate-900 transition-all ${previewAspectClass}`}>
              {card.status === 'loading' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-slate-400 text-xs">Generating...</span>
                </div>
              )}
              {card.status === 'done' && card.resultImage && (
                <>
                  <img src={card.resultImage} alt={`Result ${idx + 1}`} className="w-full h-full object-cover" />
                  {show4x5Guides && (
                    <div className="pointer-events-none absolute inset-x-0 inset-y-[8.33%] border-y border-dashed border-amber-300/75 flex items-start justify-start p-1.5">
                      <span className="bg-slate-950/75 text-amber-300 text-[10px] font-mono px-1.5 py-0.5 rounded">4:5 кроп</span>
                    </div>
                  )}
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
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${card.model === ModelType.NanoBananaPro || card.model === ModelType.Pro ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-teal-500/20 text-teal-400 border-teal-500/30'}`}>
                  {(() => {
                    const cap = getModelCapability(card.model);
                    if (!cap) return card.model;
                    return cap.kieCredits2K ? `${cap.label} (${cap.kieCredits2K} cr)` : `${cap.label} ($${cap.costUsd2K.toFixed(2)})`;
                  })()}
                </span>
              </div>
              <div className="flex gap-1">
                {card.status === 'done' && card.resultImage && (
                  <>
                    {(card.model === ModelType.NanoBanana21 || card.model === ModelType.Flash31) && (
                      <button onClick={() => refineInPro(card.id)}
                        className="px-2 py-1 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 text-xs rounded border border-amber-500/20 transition-colors font-medium" 
                        title="Перегенерировать карточку в Nano Banana Pro (KIE, 18 cr · $0.09)">✨ Refine (2K)</button>
                    )}
                    <button onClick={() => downloadCard(card, idx)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
                      title={`Скачать (${activePreset.shortLabel})`}>⬇</button>
                    <button onClick={() => onSendToTool('upscaler', card.resultImage!)}
                      className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Send to Upscaler">↑ Scale</button>
                    {(() => {
                      const canAnimate = ['9:16', '4:5', '3:4'].includes(card.tags.aspectRatio);
                      return (
                        <button
                          onClick={() => canAnimate ? onSendToTool('video', card.resultImage!) : null}
                          disabled={!canAnimate}
                          className={`px-2 py-1 text-xs rounded transition-colors font-medium ${
                            canAnimate
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                          }`}
                          title={
                            canAnimate
                              ? 'Анимировать кадр (Video Animator)'
                              : 'Анимация доступна для вертикальных форматов (9:16, 4:5, 3:4)'
                          }
                        >
                          🎬 Animate
                        </button>
                      );
                    })()}
                  </>
                )}
                {(card.status === 'done' || card.status === 'error') && (
                  <button onClick={() => regenerate(card.id)}
                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors" title="Regenerate">🔄</button>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
