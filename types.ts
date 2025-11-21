export enum Step {
  Reference = 1,
  People = 2,
  Prompt = 3,
  Result = 4,
}

export enum ModelType {
  Flash = 'gemini-2.5-flash-image',
  Pro = 'gemini-3-pro-image-preview',
}

export type AspectRatio = '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
export type ImageSize = '1K' | '2K' | '4K';

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
