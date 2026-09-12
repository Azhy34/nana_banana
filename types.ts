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

// Mirrors the live Replicate schema — defined once in shared/upscaleContract.ts.
import type { SubjectDetection, UpscaleFactor } from './shared/upscaleContract';
export type { UpscaleFactor, SubjectDetection };

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
  // Only sizes Replicate can actually deliver: 2x, 4x and 6x. There is no 3x,
  // so a "12K" option would silently resolve to 4x/16K.
  targetSize: '8K' | '16K' | '24K';
  format: 'jpg' | 'png';
  // enhance_model and face_enhancement were dropped from the UI: A/B runs against
  // the live model returned pixel-identical output for every value of both, so the
  // controls could not affect the result. subject_detection measurably does.
  subjectDetection: SubjectDetection;
}

export interface UpscaleState {
  isUpscaling: boolean;
  progress: number;
  error: string | null;
  upscaledImage: string | null;
}

export type VideoEngine = 'veo' | 'omni';
export type OmniResolution = '360p' | '720p';

export interface VideoJobSettings {
  engine?: VideoEngine;
  promptPreset: 'dolly_in' | 'ambient' | 'dolly_out' | 'omni_wall_dolly' | 'omni_texture_macro' | 'omni_montessori' | 'omni_sunlight_loop';
  customPrompt: string;
  seed: number;
  resolution?: OmniResolution;
}

export interface VideoToolPayload {
  image: string; // Base64 or URL
}

export interface VideoGenerationState {
  isLoading: boolean;
  progress: number; // 0 to 100
  error: string | null;
  resultVideoUrl: string | null;
  lastRunCostUsd?: number;
}

export interface GeminiLogDetails {
  aspectRatio?: string;
  durationSeconds?: number;
  personGeneration?: string;
  seed?: number;
  resolution?: string;
  interactionId?: string;
  operationName?: string;
  raiMediaFilteredCount?: number;
  raiMediaFilteredReasons?: string[];
  errorCode?: string | number;
  errorStatus?: string;
}

