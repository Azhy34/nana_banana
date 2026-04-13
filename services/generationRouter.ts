import { AIProvider, GenerationSettings, GenerationUsage, ModelType, UploadedImage } from '../types';
import { generateImageComposition as generateGeminiFamilyImage, generateBatchImage as generateGeminiFamilyBatch } from './geminiService';
import { generateQwenImage } from './replicateService';

export interface RoutedGenerationResult {
  image: string;
  usage: GenerationUsage;
  predictTimeSeconds?: number;
}

const buildDataUrl = (image: UploadedImage): string =>
  `data:${image.mimeType || 'image/png'};base64,${image.data}`;

export const isQwenModel = (model: ModelType): boolean =>
  model === ModelType.QwenImage2;

export async function generateImageComposition(
  providerApiKey: string,
  replicateToken: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings,
  provider: AIProvider = 'openrouter'
): Promise<RoutedGenerationResult> {
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

  return generateGeminiFamilyImage(providerApiKey, referenceImages, settings, provider);
}

export async function generateBatchImage(
  providerApiKey: string,
  replicateToken: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  model: ModelType,
  provider: AIProvider = 'openrouter'
): Promise<string> {
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

  return generateGeminiFamilyBatch(providerApiKey, wallpaper, prompt, aspectRatio, model, provider);
}
