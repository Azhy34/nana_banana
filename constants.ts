import { AspectRatio, ImageSize, ModelType } from './types';

export const ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];
export const IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K', '8K', '12K', '16K'];

export const MODEL_OPTIONS = [
  { value: ModelType.Pro, label: 'Gemini 3 Pro (High Quality, 4K)' },
  { value: ModelType.Flash, label: 'Gemini 2.5 Flash (Fast, Editing)' },
];
