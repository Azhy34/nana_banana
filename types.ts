export enum Step {
  Prompt = 1,
  Reference = 2,
  Result = 3,
  Crop = 4,
}

export type ViewMode = 'generator' | 'cropper' | 'upscaler';

export enum ModelType {
  Flash = 'gemini-2.5-flash-image',
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

