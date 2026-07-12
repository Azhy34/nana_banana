export enum Step {
  Prompt = 1,
  Reference = 2,
  Result = 3,
  Crop = 4,
}

export type ViewMode = 'generator' | 'cropper' | 'upscaler' | 'batch' | 'video';
export type AIProvider = 'openrouter' | 'gemini';
export type AgeGroupKey = 'baby' | 'vorschul' | 'schulkind' | 'teenager';
export type BatchAspectRatio = '9:16' | '2:3' | '4:3';

export interface BatchPromptTags {
  color: string;
  style: string;
  brand: string;
  ageGroup: AgeGroupKey;
  keyObject: string;
  roomZone: string;
  lighting: string;
  cameraAngle: string;
  cameraDistance: string;
  depthOfField: string;
  accessories: string[];
  aspectRatio: BatchAspectRatio;
  compositionStrategy: 'unobstructed' | 'natural';
  cinematicDetail: string;
  overlayText?: string;
  overlayPosition?: 'bottom left' | 'bottom right';
}

export type BatchCardStatus = 'idle' | 'loading' | 'done' | 'error';

export interface BatchCard {
  id: string;
  tags: BatchPromptTags;
  promptText: string;
  status: BatchCardStatus;
  resultImage: string | null;
  error: string | null;
  selected: boolean;
  model: ModelType;
}

export enum ModelType {
  Flash31 = 'google/gemini-3.1-flash-image',
  Pro = 'google/gemini-3-pro-image',
  QwenImage2 = 'qwen/qwen-image-2',
  ABTest = 'ab-test',
}

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
export type ImageSize = '512' | '1K' | '2K' | '4K' | '8K' | '12K' | '16K' | '24K';

export type TopazModel = 'Standard V2' | 'High Fidelity V2' | 'Low Resolution V2' | 'CGI' | 'Text Refine';

export interface UploadedImage {
  id: string;
  data: string; // Base64
  mimeType: string;
  previewUrl: string;
}

export interface GenerationSettings {
  prompt: string;
  model: ModelType;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
}

export interface GenerationUsage {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
}

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  resultImage: string | null;
  usage?: GenerationUsage;
  estimatedCostUsd?: number;
  predictTimeSeconds?: number;
}

export interface UpscaleSettings {
  targetSize: '8K' | '12K' | '16K' | '24K';
  format: 'jpg' | 'png';
  model: TopazModel;
  faceCorrection: boolean;
}

export interface UpscaleState {
  isUpscaling: boolean;
  progress: number;
  error: string | null;
  upscaledImage: string | null;
}

export type VeoModel = 'veo-3.1-fast-generate-001';
export type VeoAspectRatio = '9:16';
export type VeoDuration = 6;

export interface VideoJobSettings {
  promptPreset: 'dolly_in' | 'ambient' | 'dolly_out';
  customPrompt: string;
  seed: number;
}

export interface VideoToolPayload {
  image: string; // Base64 or URL
}

export interface VideoGenerationState {
  isLoading: boolean;
  progress: number; // 0 to 100
  error: string | null;
  resultVideoUrl: string | null;
}

