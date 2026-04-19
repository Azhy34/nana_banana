import { AspectRatio, ImageSize, ModelType } from './types';

// Pricing from Google AI Studio (ai.google.dev/pricing)
// inputPer1M — price per 1M input tokens when generating images
// outputPerImage — flat price per output image
export const MODEL_PRICING: Record<ModelType, { inputPer1M: number; outputPerImage: number }> = {
  [ModelType.Pro]:     { inputPer1M: 2.00, outputPerImage: 0.134  },
  [ModelType.Flash31]: { inputPer1M: 0.50, outputPerImage: 0.0672 },
  [ModelType.QwenImage2]: { inputPer1M: 0, outputPerImage: 0.035 },
};

export const ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const QWEN_ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'];
export const IMAGE_SIZES_FLASH31: ImageSize[] = ['1K', '2K', '4K'];
export const IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K', '8K', '12K', '16K'];

export const MODEL_OPTIONS = [
  { value: ModelType.Flash31, label: 'Gemini 3.1 Flash (New, Fast)' },
  { value: ModelType.Pro, label: 'Gemini 3 Pro (High Quality, 4K)' },
  { value: ModelType.QwenImage2, label: 'Qwen Image 2 (Replicate)' },
];
