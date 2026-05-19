import { useState } from 'react';
import { BatchCard, BatchAspectRatio, BatchPromptTags, AgeGroupKey, UploadedImage, ModelType, AIProvider } from '../types';
import { generateRandomTags, buildGeminiPrompt, TAG_OPTIONS, getKeyObjectsForAge } from '../services/promptGenerator';
import { generateBatchImage, isQwenModel } from '../services/generationRouter';
import { downloadImage } from '../services/downloadService';

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
  const [batchStep, setBatchStep] = useState<BatchStep>('setup');

  // Setup
  const [wallpaper, setWallpaper] = useState<UploadedImage | null>(null);
  const [count, setCount] = useState(12);
  const [model, setModel] = useState<ModelType>(ModelType.Flash31);
  const [formatDist, setFormatDist] = useState<Record<BatchAspectRatio, number>>({ '9:16': 6, '2:3': 4, '4:3': 2 });

  // Cards
  const [cards, setCards] = useState<BatchCard[]>([]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const formatTotal = formatDist['9:16'] + formatDist['2:3'] + formatDist['4:3'];

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

  return {
    state: { batchStep, wallpaper, count, model, formatDist, cards, expandedCard, isGenerating, formatTotal },
    actions: {
      setBatchStep, setWallpaper, setModel, setExpandedCard,
      handleWallpaperUpload, updateFormat, selectCount, generateCards,
      updateTag, rerandomize, rerandomizeAccessories, deleteCard, addCard,
      updatePromptText, handleGenerateAll, regenerate, toggleSelected, downloadSelected
    }
  };
}
