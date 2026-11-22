import { AIProvider, GenerationSettings, GenerationUsage, ModelType, UploadedImage } from '../types';
import { isKieModelId, getModelCapability } from '../shared/modelContracts';
import { generateImageComposition as generateGeminiFamilyImage, generateBatchImage as generateGeminiFamilyBatch, logGeminiEvent } from './geminiService';
import { generateQwenImage } from './replicateService';
import { generateKieImage, generateKieBatchImage } from './kieService';
import { generateSpanId, generateTraceId } from '../utils/tracing';

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

    const tid = traceId || generateTraceId();
    const spanId = generateSpanId();
    const startedAt = Date.now();
    const estimatedCost = getModelCapability(settings.model)?.costUsd2K ?? 0.035;
    const baseDetails = {
      aspectRatio: settings.aspectRatio,
      resolution: settings.imageSize,
      referenceCount: referenceImages[0] ? 1 : 0,
      provider: 'replicate',
      spanId,
    };

    try {
      const { url, predictionId, predictTimeSeconds, billingUnits } = await generateQwenImage(replicateToken, {
        prompt: settings.prompt,
        aspectRatio: settings.aspectRatio,
        referenceImageDataUrl: referenceImages[0] ? buildDataUrl(referenceImages[0]) : undefined,
        matchInputImage: Boolean(referenceImages[0]),
      });

      const duration = (Date.now() - startedAt) / 1000;
      logGeminiEvent(settings.model, settings.prompt, estimatedCost, duration, 'success', null, tid, undefined, {
        ...baseDetails,
        predictionId,
        predictTimeSeconds,
        serverTimeSeconds: predictTimeSeconds,
        billingUnits,
        costSource: 'estimate',
      });

      return {
        image: url,
        predictTimeSeconds,
        usage: {
          promptTokens: 0,
          candidateTokens: 0,
          totalTokens: 0,
          costUsd: estimatedCost,
          responseId: predictionId,
        },
      };
    } catch (err: any) {
      const duration = (Date.now() - startedAt) / 1000;
      logGeminiEvent(settings.model, settings.prompt, 0, duration, 'error', err?.message || 'Qwen error', tid, undefined, baseDetails);
      throw err;
    }
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
  analytics?: { promptMode?: string; style?: string; audience?: string; macroTexture?: boolean }
): Promise<string> {
  if (isKieModel(model)) {
    return generateKieBatchImage(kieApiKey, wallpaper, prompt, aspectRatio, model, traceId, textureImage, analytics);
  }
  if (isQwenModel(model)) {
    if (!replicateToken) {
      throw new Error('Replicate Token is required for Qwen Image 2.');
    }

    const tid = traceId || generateTraceId();
    const spanId = generateSpanId();
    const startedAt = Date.now();
    const estimatedCost = getModelCapability(model)?.costUsd2K ?? 0.035;
    const baseDetails = {
      aspectRatio,
      resolution: '2K',
      referenceCount: 1,
      stage: 'batch_generate',
      interactionId: cardId,
      provider: 'replicate',
      spanId,
      ...analytics,
    };

    logGeminiEvent(model, prompt, 0, 0, 'started', null, tid, undefined, baseDetails);
    try {
      const { url, predictionId, predictTimeSeconds, billingUnits } = await generateQwenImage(replicateToken, {
        prompt,
        aspectRatio,
        referenceImageDataUrl: buildDataUrl(wallpaper),
        matchInputImage: false,
      });
      const duration = (Date.now() - startedAt) / 1000;
      logGeminiEvent(model, prompt, estimatedCost, duration, 'success', null, tid, undefined, {
        ...baseDetails,
        predictionId,
        predictTimeSeconds,
        serverTimeSeconds: predictTimeSeconds,
        billingUnits,
        costSource: 'estimate',
      });
      return url;
    } catch (err: any) {
      const duration = (Date.now() - startedAt) / 1000;
      logGeminiEvent(model, prompt, 0, duration, 'error', err?.message || 'Qwen error', tid, undefined, baseDetails);
      throw err;
    }
  }

  return generateGeminiFamilyBatch(providerApiKey, wallpaper, prompt, aspectRatio, model, provider, draftImage, traceId, textureImage, cardId, analytics);
}
