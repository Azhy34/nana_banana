import { useState, useEffect } from 'react';
import { AudienceKey, BatchCard, BatchAspectRatio, BatchPromptTags, AgeGroupKey, UploadedImage, ModelType, AIProvider, PromptMode } from '../types';
import {
  generateRandomTags,
  generateBatchDeck,
  buildGeminiPrompt,
  muralSafeKeyObjects,
  getColorsForStyle,
  accessoriesOfAge,
} from '../services/promptGenerator';
import { generateBatchImage, isQwenModel, isKieModel } from '../services/generationRouter';
import { downloadImage } from '../services/downloadService';
import { compressImageFile } from '../services/imageCompressor';
import { CRAFT_LAMBDA_TEXTURE_IMAGE } from '../services/craftLambdaAsset';
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
  const [formatDist, setFormatDist] = useState<Record<BatchAspectRatio, number>>({ '9:16': 6, '4:5': 0, '3:4': 0, '2:3': 4, '4:3': 2 });
  const [audience, setAudience] = useState<AudienceKey>('neutral');
  const [includeHero, setIncludeHero] = useState<boolean>(false);
  const [promptMode, setPromptMode] = useState<PromptMode>('full');
  const [useTextureReference, setUseTextureReference] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_use_texture');
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
      localStorage.setItem('nana_banana_batch_use_texture', JSON.stringify(useTextureReference));
    } catch (e) {
      console.warn('Failed to save useTextureReference to localStorage:', e);
    }
  }, [useTextureReference]);

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
      setFormatDist({ '9:16': Math.round(n * 0.5), '4:5': 0, '3:4': 0, '2:3': Math.round(n * 0.33), '4:3': n - Math.round(n * 0.5) - Math.round(n * 0.33) });
      return;
    }
    const p9 = Math.round((formatDist['9:16'] / total) * n);
    const p45 = Math.round((formatDist['4:5'] / total) * n);
    const p34 = Math.round((formatDist['3:4'] / total) * n);
    const p23 = Math.round((formatDist['2:3'] / total) * n);
    const p43 = Math.max(0, n - p9 - p45 - p34 - p23);
    setFormatDist({ '9:16': p9, '4:5': p45, '3:4': p34, '2:3': p23, '4:3': p43 });
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

    const dealtTags = generateBatchDeck(formats, { audience, includeHero, promptMode });

    setCards(dealtTags.map((tags, idx) => {
      const ar = tags.aspectRatio;
      const cardModel = model === ModelType.ABTest
        ? (idx < formats.length / 2 ? ModelType.Pro : ModelType.Flash31)
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
      if (key === 'ageGroup') {
        const ageOptions = muralSafeKeyObjects(value as AgeGroupKey);
        newTags.keyObject = ageOptions[Math.floor(Math.random() * ageOptions.length)];
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
      const tags = generateRandomTags(c.tags.aspectRatio, undefined, { audience, promptMode });
      return { ...c, tags, promptText: buildGeminiPrompt(tags) };
    }));
  };

  const rerandomizeAccessories = (cardId: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const pool = accessoriesOfAge(c.tags.ageGroup);
      const acc = [...pool].sort(() => Math.random() - 0.5).slice(0, 2);
      const newTags = { ...c.tags, accessories: acc };
      return { ...c, tags: newTags, promptText: buildGeminiPrompt(newTags) };
    }));
  };

  const deleteCard = (cardId: string) => setCards(prev => prev.filter(c => c.id !== cardId));

  const addCard = () => {
    const tags = generateRandomTags('9:16', undefined, { audience, promptMode });
    const cardModel = model === ModelType.ABTest ? ModelType.Pro : model;
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
    const texture = useTextureReference ? CRAFT_LAMBDA_TEXTURE_IMAGE : null;
    
    for (let i = 0; i < selectedCards.length; i += concurrencyLimit) {
      const chunk = selectedCards.slice(i, i + concurrencyLimit);
      await Promise.allSettled(chunk.map(async (card) => {
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
            { promptMode: card.tags.promptMode || 'full', style: card.tags.style, audience: card.tags.audience || 'neutral' }
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
    const texture = useTextureReference ? CRAFT_LAMBDA_TEXTURE_IMAGE : null;
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
        { promptMode: card.tags.promptMode || 'full', style: card.tags.style, audience: card.tags.audience || 'neutral' }
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

    const texture = useTextureReference ? CRAFT_LAMBDA_TEXTURE_IMAGE : null;
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

  const downloadSelected = async () => {
    const toDownload = cards.filter(c => c.selected && c.resultImage);
    for (let i = 0; i < toDownload.length; i++) {
      await downloadImage(toDownload[i].resultImage!, `wallpaper-${i + 1}-${toDownload[i].tags.aspectRatio.replace(':', 'x')}.png`);
      await new Promise(r => setTimeout(r, 200));
    }
  };

  return {
    state: { batchStep, wallpaper, count, model, formatDist, cards, expandedCard, isGenerating, formatTotal, useTextureReference, audience, includeHero, promptMode },
    actions: {
      setBatchStep, setWallpaper, setModel, setExpandedCard, setUseTextureReference,
      setAudience, setIncludeHero, setPromptMode,
      handleWallpaperUpload, updateFormat, selectCount, generateCards,
      updateTag, rerandomize, rerandomizeAccessories, deleteCard, addCard,
      updatePromptText, handleGenerateAll, regenerate, refineInPro, toggleSelected, downloadSelected
    }
  };
}
