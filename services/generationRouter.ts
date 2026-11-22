import { AIProvider, GenerationSettings, GenerationUsage, ModelType, UploadedImage } from '../types';
import { isKieModelId } from '../shared/modelContracts';
import { generateImageComposition as generateGeminiFamilyImage, generateBatchImage as generateGeminiFamilyBatch } from './geminiService';
import { generateQwenImage } from './replicateService';
import { generateKieImage, generateKieBatchImage } from './kieService';

export interface RoutedGenerationResult {
  image: string;
  usage: GenerationUsage;
  predictTimeSeconds?: number;
}

const buildDataUrl = (image: UploadedImage): string =>
  `data:${image.mimeType || 'image/png'};base64,${image.data}`;

export const isQwenModel = (model: ModelType): boolean =>
  model === ModelType.QwenImage2;

export const isKieModel = (model: ModelType): boolean =>
  isKieModelId(model);

export async function generateImageComposition(
  providerApiKey: string,
  replicateToken: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings,
  provider: AIProvider = 'openrouter',
  traceId?: string,
  kieApiKey: string = ''
): Promise<RoutedGenerationResult> {
  if (isKieModel(settings.model)) {
    return generateKieImage(kieApiKey, referenceImages, settings, traceId);
  }
  if (isQwenModel(settings.model)) {
    if (!replicateToken) {
      throw new Error('Replicate Token is required for Qwen Image 2.');
    }

    const { url, predictTimeSeconds } = await generateQwenImage(replicateToken, {
      prompt: settings.prompt,
      aspectRatio: settings.aspectRatio,
      referenceImageDataUrl: referenceImages[0] ? buildDataUrl(referenceImages[0]) : undefined,
      matchInputImage: Boolean(referenceImages[0]),
    });

    return {
      image: url,
      predictTimeSeconds,
      usage: {
        promptTokens: 0,
        candidateTokens: 0,
        totalTokens: 0,
      },
    };
  }

  return generateGeminiFamilyImage(providerApiKey, referenceImages, settings, provider, traceId);
}

export async function generateBatchImage(
  providerApiKey: string,
  replicateToken: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  model: ModelType,
  provider: AIProvider = 'gemini',
  draftImage?: string,
  traceId?: string,
  textureImage?: UploadedImage | null,
  cardId?: string,
  kieApiKey: string = '',
  analytics?: { promptMode?: string; style?: string; audience?: string }
): Promise<string> {
  if (isKieModel(model)) {
    return generateKieBatchImage(kieApiKey, wallpaper, prompt, aspectRatio, model, traceId, textureImage, analytics);
  }
  if (isQwenModel(model)) {
    if (!replicateToken) {
      throw new Error('Replicate Token is required for Qwen Image 2.');
    }

    const { url } = await generateQwenImage(replicateToken, {
      prompt,
      aspectRatio,
      referenceImageDataUrl: buildDataUrl(wallpaper),
      matchInputImage: false,
    });
    return url;
  }

  return generateGeminiFamilyBatch(providerApiKey, wallpaper, prompt, aspectRatio, model, provider, draftImage, traceId, textureImage, cardId, analytics);
}
