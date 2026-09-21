import { useState, useEffect } from 'react';
import { BatchCard, BatchAspectRatio, BatchPromptTags, AgeGroupKey, UploadedImage, ModelType, AIProvider, OverlayPosition } from '../types';
import { generateRandomTags, buildGeminiPrompt, TAG_OPTIONS, getKeyObjectsForAge } from '../services/promptGenerator';
import { generateBatchImage, isQwenModel } from '../services/generationRouter';
import { downloadImage } from '../services/downloadService';
import { compressImageFile } from '../services/imageCompressor';
import { CRAFT_LAMBDA_TEXTURE_IMAGE } from '../services/craftLambdaAsset';

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
export function useBatch(provider: AIProvider, apiKey: string, replicateToken: string) {
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
  const [formatDist, setFormatDist] = useState<Record<BatchAspectRatio, number>>({ '9:16': 6, '2:3': 4, '4:3': 2 });
  const [useTextureReference, setUseTextureReference] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_use_texture');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Cards
  const [cards, setCards] = useState<BatchCard[]>(() => {
    try {
      const saved = localStorage.getItem('nana_banana_batch_cards');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
      localStorage.setItem('nana_banana_batch_cards', JSON.stringify(cards));
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

  const formatTotal = formatDist['9:16'] + formatDist['2:3'] + formatDist['4:3'];

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
    // Rescale distribution proportionally to new count
    const total = formatDist['9:16'] + formatDist['2:3'] + formatDist['4:3'];
    if (total === 0) {
      setFormatDist({ '9:16': Math.round(n * 0.5), '2:3': Math.round(n * 0.33), '4:3': n - Math.round(n * 0.5) - Math.round(n * 0.33) });
      return;
    }
    const p9 = Math.round((formatDist['9:16'] / total) * n);
    const p23 = Math.round((formatDist['2:3'] / total) * n);
    const p43 = n - p9 - p23;
    setFormatDist({ '9:16': p9, '2:3': p23, '4:3': Math.max(0, p43) });
  };

  const generateCards = () => {
    if (!wallpaper || formatTotal === 0) return;
    const formats: BatchAspectRatio[] = [
      ...Array(formatDist['9:16']).fill('9:16'),
      ...Array(formatDist['2:3']).fill('2:3'),
      ...Array(formatDist['4:3']).fill('4:3'),
    ].sort(() => Math.random() - 0.5);

    const USP_OPTIONS = [
      'Custom Sizes Available',
      '100% Toxin-Free & Odorless',
      'Washable & Easy Clean',
      'Easy Paste-the-Wall',
      'Premium Tactile Texture',
      'Certified EU Quality',
    ];

    const ageGroupCycle: AgeGroupKey[] = ['baby', 'vorschul', 'schulkind', 'teenager'];
    
    // Select non-video formats (4:3 and 2:3) for Etsy listing USP overlays.
    // 9:16 formats are always kept 100% clean for video animation.
    const nonVideoIndices = formats
      .map((ar, idx) => (ar !== '9:16' ? idx : -1))
      .filter((idx) => idx !== -1);

    // Give USP overlay to ~35% of listing photo cards (at least 1 if non-video cards exist)
    const textCardsCount = Math.min(
      nonVideoIndices.length,
      Math.max(1, Math.round(nonVideoIndices.length * 0.35))
    );

    const shuffledNonVideo = [...nonVideoIndices].sort(() => Math.random() - 0.5);
    const textIndices = new Set<number>(shuffledNonVideo.slice(0, textCardsCount));

    setCards(formats.map((ar, idx) => {
      const ageGroup = ageGroupCycle[idx % ageGroupCycle.length];
      const tags = generateRandomTags(ar, ageGroup);
      
      // USP overlay text only for 4:3 and 2:3 formats; 9:16 is strictly clean for video
      if (textIndices.has(idx) && ar !== '9:16') {
        tags.overlayText = USP_OPTIONS[Math.floor(Math.random() * USP_OPTIONS.length)];
        tags.overlayPosition = Math.random() < 0.5 ? 'bottom left' : 'bottom right';
      } else {
        tags.overlayText = undefined;
        tags.overlayPosition = undefined;
      }

      // Разделение 50/50 для моделей при A/B-тесте
      const cardModel = model === ModelType.ABTest
        ? (idx < formats.length / 2 ? ModelType.Pro : ModelType.Flash31)
        : model;

      return { id: Math.random().toString(36).substring(7), tags, promptText: buildGeminiPrompt(tags), status: 'idle', resultImage: null, error: null, selected: true, model: cardModel };
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
    const cardModel = model === ModelType.ABTest ? ModelType.Pro : model;
    setCards(prev => [...prev, { id: Math.random().toString(36).substring(7), tags, promptText: buildGeminiPrompt(tags), status: 'idle', resultImage: null, error: null, selected: true, model: cardModel }]);
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

    const concurrencyLimit = 2;
    const selectedCards = cards.filter(c => c.selected);
    const texture = useTextureReference ? CRAFT_LAMBDA_TEXTURE_IMAGE : null;
    
    for (let i = 0; i < selectedCards.length; i += concurrencyLimit) {
      const chunk = selectedCards.slice(i, i + concurrencyLimit);
      await Promise.allSettled(chunk.map(async (card) => {
        try {
          const img = await generateBatchImage(
            apiKey,
            replicateToken,
            wallpaper,
            card.promptText,
            card.tags.aspectRatio,
            card.model,
            provider,
            undefined,
            undefined,
            texture
          );
          setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'done', resultImage: img } : c));
        } catch (err: any) {
          setCards(prev => prev.map(c => c.id === card.id ? { ...c, status: 'error', error: err.message ?? 'Failed' } : c));
        }
      }));
    }

    setIsGenerating(false);
  };

  const regenerate = async (cardId: string) => {
    if ((!apiKey && !isQwenModel(model)) || !wallpaper || (isQwenModel(model) && !replicateToken)) return;
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    const texture = useTextureReference ? CRAFT_LAMBDA_TEXTURE_IMAGE : null;
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: 'loading', error: null } : c));
    try {
      const img = await generateBatchImage(
        apiKey,
        replicateToken,
        wallpaper,
        card.promptText,
        card.tags.aspectRatio,
        card.model,
        provider,
        undefined,
        undefined,
        texture
      );
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
      const img = await generateBatchImage(
        apiKey,
        replicateToken,
        wallpaper,
        card.promptText,
        card.tags.aspectRatio,
        ModelType.Pro,
        provider,
        card.resultImage,
        undefined,
        texture
      );
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
    state: { batchStep, wallpaper, count, model, formatDist, cards, expandedCard, isGenerating, formatTotal, useTextureReference },
    actions: {
      setBatchStep, setWallpaper, setModel, setExpandedCard, setUseTextureReference,
      handleWallpaperUpload, updateFormat, selectCount, generateCards,
      updateTag, rerandomize, rerandomizeAccessories, deleteCard, addCard,
      updatePromptText, handleGenerateAll, regenerate, refineInPro, toggleSelected, downloadSelected
    }
  };
}
