import { useState, useEffect } from 'react';
import { AudienceKey, BatchCard, BatchAspectRatio, BatchPromptTags, AgeGroupKey, UploadedImage, ModelType, AIProvider, PromptMode } from '../types';
import {
  generateRandomTags,
  generateBatchDeck,
  buildGeminiPrompt,
  muralSafeKeyObjects,
  getColorsForStyle,
  accessoriesOfAge,
  pickAccessoriesForAge,
  TargetAgeFilter,
  resolveAgePool,
} from '../services/promptGenerator';
import { generateBatchImage, isQwenModel, isKieModel } from '../services/generationRouter';
import { compressImageFile } from '../services/imageCompressor';
import { resolveCardTexture } from '../services/macroTexture';
import { exportCardImage, exportCardsAsZip, ExportPresetId } from '../services/exportCrop';
import { saveCardImage, loadAllCardImages, clearCardImages } from '../services/batchImageStore';
import { generateTraceId } from '../utils/tracing';

export type BatchStep = 'setup' | 'cards' | 'results';

/**
 * Custom hook to manage the state and business logic for the Batch Generator.
 * Handles the wizard flow (setup -> cards -> results), format distribution math,
 * prompt randomization, and concurrent image generation via Gemini API.
 *
 * @param provider - The selected AI provider ('gemini' | 'openrouter')
 * @param apiKey - API key for the primary provider
 * @param replicateToken - Token for Replicate (used if Qwen model is selected)
 * @returns An object containing the current state and action handlers for the UI.
 */
export function useBatch(provider: AIProvider, apiKey: string, replicateToken: string, kieApiKey: string = '') {
  const [batchStep, setBatchStep] = useState<BatchStep>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_step');
      return (saved as BatchStep) || 'setup';
    } catch {
      return 'setup';
    }
  });

  // Setup
  const [wallpaper, setWallpaper] = useState<UploadedImage | null>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_wallpaper');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [count, setCount] = useState(12);
  const [model, setModel] = useState<ModelType>(ModelType.Flash31);
  // Master strategy: 2:3 photo master (cropped free in browser to 4:5 Site/Meta + 2:3 Pinterest) + 9:16 video master
  const [formatDist, setFormatDist] = useState<Record<BatchAspectRatio, number>>({ '2:3': 8, '9:16': 4, '4:5': 0, '3:4': 0, '4:3': 0 });
  const [exportPreset, setExportPreset] = useState<ExportPresetId>('pack_4x5_2x3');
  const [isExporting, setIsExporting] = useState(false);
  const [audience, setAudience] = useState<AudienceKey>('neutral');
  const [targetAge, setTargetAge] = useState<TargetAgeFilter>(['baby', 'vorschul', 'schulkind']);
  const [includeHero, setIncludeHero] = useState<boolean>(true);
  const [promptMode, setPromptMode] = useState<PromptMode>('full');
  const [includeMacro, setIncludeMacro] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_include_macro');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Cards (metadata in localStorage; multi-MB resultImage data URLs in IndexedDB)
  const [cards, setCards] = useState<BatchCard[]>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_cards');
      if (!saved) return [];
      const parsed = JSON.parse(saved) as BatchCard[];
      return parsed.map(c => (c.status === 'loading' ? { ...c, status: 'idle' } : c));
    } catch {
      return [];
    }
  });
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Hydrate saved card images from IndexedDB on mount
  useEffect(() => {
    let active = true;
    loadAllCardImages().then(images => {
      if (!active || Object.keys(images).length === 0) return;
      setCards(prev =>
        prev.map(c => (images[c.id] ? { ...c, resultImage: images[c.id], status: 'done' } : c))
      );
    });
    return () => { active = false; };
  }, []);

  // Sync state to localStorage on changes
  useEffect(() => {
    try {
      localStorage.setItem('nana_banana_batch_step', batchStep);
    } catch (e) {
      console.warn('Failed to save batchStep to localStorage:', e);
    }
  }, [batchStep]);

  useEffect(() => {
    try {
      if (wallpaper) {
        localStorage.setItem('nana_banana_batch_wallpaper', JSON.stringify(wallpaper));
      } else {
        localStorage.removeItem('nana_banana_batch_wallpaper');
      }
    } catch (e) {
      console.warn('Failed to save wallpaper to localStorage:', e);
    }
  }, [wallpaper]);

  useEffect(() => {
    try {
      // Strip inline data: URLs before writing to localStorage to stay well below the 5 MB quota.
      const compact = cards.map(c =>
        c.resultImage && c.resultImage.startsWith('data:') ? { ...c, resultImage: null } : c
      );
      localStorage.setItem('nana_banana_batch_cards', JSON.stringify(compact));
    } catch (e) {
      console.warn('Failed to save cards to localStorage:', e);
    }
  }, [cards]);

  useEffect(() => {
    try {
      localStorage.setItem('nana_banana_batch_include_macro', JSON.stringify(includeMacro));
    } catch (e) {
      console.warn('Failed to save includeMacro to localStorage:', e);
    }
  }, [includeMacro]);

  const formatTotal = formatDist['9:16'] + formatDist['4:5'] + formatDist['3:4'] + formatDist['2:3'] + formatDist['4:3'];

  // ── Setup handlers ──────────────────────────────────────────────────────────

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, base64 } = await compressImageFile(file);
      setWallpaper({ 
        id: Math.random().toString(36).substring(7), 
        data: base64, 
        mimeType: 'image/jpeg', // Canvas compresses to JPEG
        previewUrl: dataUrl 
      });
    } catch (error) {
      console.error('Failed to compress uploaded wallpaper:', error);
    }
  };

  const updateFormat = (key: BatchAspectRatio, delta: number) => {
    setFormatDist(prev => ({ ...prev, [key]: Math.max(0, prev[key] + delta) }));
  };

  const selectCount = (n: number) => {
    setCount(n);
    const total = formatTotal;
    if (total === 0) {
      const videoCount = Math.max(1, Math.round(n / 3));
      setFormatDist({ '2:3': n - videoCount, '9:16': videoCount, '4:5': 0, '3:4': 0, '4:3': 0 });
      return;
    }
    const p23 = Math.round((formatDist['2:3'] / total) * n);
    const p9 = Math.round((formatDist['9:16'] / total) * n);
    const p45 = Math.round((formatDist['4:5'] / total) * n);
    const p34 = Math.round((formatDist['3:4'] / total) * n);
    const p43 = Math.round((formatDist['4:3'] / total) * n);
    const diff = n - (p23 + p9 + p45 + p34 + p43);
    setFormatDist({
      '2:3': Math.max(0, p23 + diff),
      '9:16': p9,
      '4:5': p45,
      '3:4': p34,
      '4:3': p43,
    });
  };

  const generateCards = () => {
    if (!wallpaper || formatTotal === 0) return;
    const formats: BatchAspectRatio[] = [
      ...Array(formatDist['9:16']).fill('9:16'),
      ...Array(formatDist['4:5']).fill('4:5'),
      ...Array(formatDist['3:4']).fill('3:4'),
      ...Array(formatDist['2:3']).fill('2:3'),
      ...Array(formatDist['4:3']).fill('4:3'),
    ].sort(() => Math.random() - 0.5);

    clearCardImages();

    const dealtTags = generateBatchDeck(formats, { audience, targetAge, includeHero, includeMacro, promptMode });

    setCards(dealtTags.map((tags, idx) => {
      const ar = tags.aspectRatio;
      const cardModel = model === ModelType.ABTest
        ? (idx < formats.length / 2 ? ModelType.Pro : ModelType.Flash31)
        : model === ModelType.ABTestFlashGrok
        ? (idx < formats.length / 2 || !['2:3', '9:16'].includes(ar) ? ModelType.Flash31 : ModelType.GrokImagine)
        : model;

      const cardId = `card_${String(idx + 1).padStart(2, '0')}_${ar.replace(':', 'x')}_${Math.random().toString(36).substring(2, 7)}`;
      return { id: cardId, tags, promptText: buildGeminiPrompt(tags), status: 'idle', resultImage: null, error: null, selected: true, model: cardModel };
    }));
    setBatchStep('cards');
  };

  // ── Card handlers ───────────────────────────────────────────────────────────

  const updateTag = (cardId: string, key: keyof BatchPromptTags, value: string | string[] | boolean) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const newTags = { ...c.tags, [key]: value };
      if (key === 'macroTexture' && value) newTags.heroRoom = false;
      if (key === 'heroRoom' && value) newTags.macroTexture = false;
      if (key === 'ageGroup') {
        const nextAge = value as AgeGroupKey;
        const ageOptions = muralSafeKeyObjects(nextAge);
        newTags.keyObject = ageOptions[Math.floor(Math.random() * ageOptions.length)];
        newTags.accessories = pickAccessoriesForAge(nextAge);
      }
      if (key === 'style') {
        const allowedColors = getColorsForStyle(value as string, c.tags.audience);
        if (!allowedColors.includes(newTags.color)) {
          newTags.color = allowedColors[0];
        }
      }
      return { ...c, tags: newTags, promptText: buildGeminiPrompt(newTags) };
    }));
  };

  const rerandomize = (cardId: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const pool = resolveAgePool(targetAge);
      const lockedAge = pool.includes(c.tags.ageGroup) ? c.tags.ageGroup : pool[0];
      const tags = generateRandomTags(c.tags.aspectRatio, lockedAge, { audience, promptMode });
      return { ...c, tags, promptText: buildGeminiPrompt(tags) };
    }));
  };

  const rerandomizeAccessories = (cardId: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const acc = pickAccessoriesForAge(c.tags.ageGroup);
      const newTags = { ...c.tags, accessories: acc };
      return { ...c, tags: newTags, promptText: buildGeminiPrompt(newTags) };
    }));
  };

  const deleteCard = (cardId: string) => setCards(prev => prev.filter(c => c.id !== cardId));

  const addCard = () => {
    const pool = resolveAgePool(targetAge);
    const lockedAge = pool[cards.length % pool.length];
    const tags = generateRandomTags('9:16', lockedAge, { audience, promptMode });
    const cardModel = model === ModelType.ABTest ? ModelType.Pro : model === ModelType.ABTestFlashGrok ? ModelType.GrokImagine : model;
    const cardId = `card_${String(cards.length + 1).padStart(2, '0')}_9x16_${Math.random().toString(36).substring(2, 7)}`;
    setCards(prev => [...prev, { id: cardId, tags, promptText: buildGeminiPrompt(tags), status: 'idle', resultImage: null, error: null, selected: true, model: cardModel }]);
  };

  const updatePromptText = (cardId: string, text: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, promptText: text } : c));
  };

  // ── Generation ──────────────────────────────────────────────────────────────

  const handleGenerateAll = async () => {
    const selectedCards = cards.filter(c => c.selected);
    const needsKie = selectedCards.some(c => isKieModel(c.model));
    const needsQwen = selectedCards.some(c => isQwenModel(c.model));
    const needsPrimary = selectedCards.some(c => !isKieModel(c.model) && !isQwenModel(c.model));

    if (needsKie && !kieApiKey) {
      alert('Please enter your KIE API Key in the header first.');
      return;
    }
    if (needsQwen && !replicateToken) {
      alert('Please enter your Replicate Token first.');
      return;
    }
    if (needsPrimary && !apiKey) {
      const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
      alert(`Please enter your ${providerLabel} API Key first.`);
      return;
    }
    if (!wallpaper) return;
    setIsGenerating(true);
    clearCardImages();
    setCards(prev => prev.map(c => ({ ...c, status: 'loading', resultImage: null, error: null })));
    setBatchStep('results');

    const concurrencyLimit = 2;
    
    for (let i = 0; i < selectedCards.length; i += concurrencyLimit) {
      const chunk = selectedCards.slice(i, i + concurrencyLimit);
      await Promise.allSettled(chunk.map(async (card) => {
        try {
          const cardTraceId = generateTraceId();
          const texture = resolveCardTexture(card.tags);
          const img = await generateBatchImage(
            apiKey,
            replicateToken,
            wallpaper,
            card.promptText,
            card.tags.aspectRatio,
            card.model,
            provider,
            undefined,
            cardTraceId,
            texture,
            card.id,
            kieApiKey,
            { promptMode: card.tags.promptMode || 'full', style: card.tags.style, audience: card.tags.audience || 'neutral', macroTexture: Boolean(card.tags.macroTexture) }
          );
          if (img.startsWith('data:')) void saveCardImage(card.id, img);
          setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'done', resultImage: img } : c));
        } catch (err: any) {
          setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error', error: err.message ?? 'Failed' } : c));
        }
      }));
    }

    setIsGenerating(false);
  };

  const regenerate = async (cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card || !wallpaper) return;
    if (isKieModel(card.model) && !kieApiKey) return;
    if (isQwenModel(card.model) && !replicateToken) return;
    if (!isKieModel(card.model) && !isQwenModel(card.model) && !apiKey) return;
    const texture = resolveCardTexture(card.tags);
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'loading', error: null } : c));
    try {
      const cardTraceId = generateTraceId();
      const img = await generateBatchImage(
        apiKey,
        replicateToken,
        wallpaper,
        card.promptText,
        card.tags.aspectRatio,
        card.model,
        provider,
        undefined,
        cardTraceId,
        texture,
        card.id,
        kieApiKey,
        { promptMode: card.tags.promptMode || 'full', style: card.tags.style, audience: card.tags.audience || 'neutral', macroTexture: Boolean(card.tags.macroTexture) }
      );
      if (img.startsWith('data:')) void saveCardImage(cardId, img);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'done', resultImage: img } : c));
    } catch (err: any) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'error', error: err.message } : c));
    }
  };

  const refineInPro = async (cardId: string) => {
    if (!apiKey || !wallpaper) return;
    const card = cards.find(c => c.id === cardId);
    if (!card || !card.resultImage) return;

    const texture = resolveCardTexture(card.tags);
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'loading', error: null } : c));
    try {
      const cardTraceId = generateTraceId();
      const img = await generateBatchImage(
        apiKey,
        replicateToken,
        wallpaper,
        card.promptText,
        card.tags.aspectRatio,
        ModelType.Pro,
        provider,
        card.resultImage,
        cardTraceId,
        texture,
        card.id
      );
      if (img.startsWith('data:')) void saveCardImage(cardId, img);
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'done', resultImage: img, model: ModelType.Pro } : c));
    } catch (err: any) {
      setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'error', error: err.message || 'Refinement failed' } : c));
    }
  };

  const toggleSelected = (cardId: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, selected: !c.selected } : c));
  };

  const downloadCard = async (card: BatchCard, idx: number) => {
    if (!card.resultImage) return;
    await exportCardImage(card.resultImage, idx + 1, card.tags.aspectRatio, exportPreset, card.model);
  };

  const downloadSelected = async () => {
    const toDownload = cards
      .map((c, idx) => ({ card: c, cardIndex: idx + 1 }))
      .filter(({ card }) => card.selected && card.resultImage);
    if (toDownload.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      await exportCardsAsZip(
        toDownload.map(({ card, cardIndex }) => ({
          sourceUrl: card.resultImage!,
          cardIndex,
          cardRatio: card.tags.aspectRatio,
          model: card.model,
        })),
        exportPreset,
      );
    } finally {
      setIsExporting(false);
    }
  };

  return {
    state: { batchStep, wallpaper, count, model, formatDist, cards, expandedCard, isGenerating, formatTotal, includeMacro, audience, targetAge, includeHero, promptMode, exportPreset, isExporting },
    actions: {
      setBatchStep, setWallpaper, setModel, setExpandedCard, setIncludeMacro,
      setAudience, setTargetAge, setIncludeHero, setPromptMode, setExportPreset,
      handleWallpaperUpload, updateFormat, selectCount, generateCards,
      updateTag, rerandomize, rerandomizeAccessories, deleteCard, addCard,
      updatePromptText, handleGenerateAll, regenerate, refineInPro, toggleSelected, downloadCard, downloadSelected
    }
  };
}
