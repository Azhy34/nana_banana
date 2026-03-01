export enum Step {
  Prompt = 1,
  Reference = 2,
  Result = 3,
  Crop = 4,
}

export type ViewMode = 'generator' | 'cropper' | 'upscaler' | 'batch';
export type AgeGroupKey = 'baby' | 'vorschul' | 'schulkind';
export type BatchAspectRatio = '9:16' | '16:9' | '1:1';

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
}

export enum ModelType {
  Flash = 'gemini-2.5-flash-image',
  Flash31 = 'gemini-3.1-flash-image-preview',
  Pro = 'gemini-3-pro-image-preview',
}

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
export type ImageSize = '1K' | '2K' | '4K' | '8K' | '12K' | '16K' | '24K';

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

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  resultImage: string | null;
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

