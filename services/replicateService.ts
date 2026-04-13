/**
 * Replicate Service - Handles image upscaling via Topaz Labs
 * Uses Vercel API routes (no CORS proxy needed)
 */

const API_BASE_URL = '/api';
const MAX_INLINE_IMAGE_BYTES = 1024 * 1024 * 4;

export type TopazEnhanceModel =
  | 'Standard V2'
  | 'High Fidelity V2'
  | 'Low Resolution V2'
  | 'CGI'
  | 'Text Refine';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  metrics?: { predict_time?: number };
}

export interface QwenGenerationResult {
  url: string;
  predictTimeSeconds?: number;
}

interface QwenGenerateOptions {
  prompt: string;
  aspectRatio?: string;
  referenceImageDataUrl?: string;
  matchInputImage?: boolean;
  negativePrompt?: string;
  seed?: number;
}

const estimateDataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  return Math.floor((base64.length * 3) / 4);
};

const getPredictionOutputUrl = (prediction: ReplicatePrediction): string => {
  const output = prediction.output;
  if (Array.isArray(output)) {
    if (!output.length) throw new Error('Replicate returned no output files.');
    return output[0];
  }
  if (!output) throw new Error('Replicate returned no output.');
  return output;
};


const buildQwenInput = ({
  prompt,
  aspectRatio,
  referenceImageDataUrl,
  matchInputImage = false,
  negativePrompt = '',
  seed,
}: QwenGenerateOptions): Record<string, unknown> => {
  const input: Record<string, unknown> = {
    prompt,
    enable_prompt_expansion: true,
  };

  if (negativePrompt.trim()) {
    input.negative_prompt = negativePrompt;
  }

  if (typeof seed === 'number') {
    input.seed = seed;
  }

  if (referenceImageDataUrl) {
    const bytes = estimateDataUrlBytes(referenceImageDataUrl);
    if (bytes > MAX_INLINE_IMAGE_BYTES) {
      throw new Error('Reference image is too large. Please use a smaller image (max 4MB).');
    }
    input.image = referenceImageDataUrl;
    input.match_input_image = matchInputImage;
  } else if (aspectRatio) {
    input.aspect_ratio = aspectRatio;
  }

  return input;
};

async function pollQwenPrediction(
  predictionId: string,
  intervalMs = 2000,
  maxAttempts = 60
): Promise<ReplicatePrediction> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const response = await fetch(`${API_BASE_URL}/qwen/poll?id=${predictionId}`);
    const current: ReplicatePrediction = await response.json();

    if (!response.ok) throw new Error((current as any).error || 'Failed to poll Qwen prediction.');
    if (current.status === 'succeeded') return current;
    if (current.status === 'failed' || current.status === 'canceled') {
      throw new Error(current.error || 'Qwen prediction failed.');
    }
  }
  throw new Error('Qwen prediction timed out.');
}

export async function generateQwenImage(
  _apiToken: string,
  options: QwenGenerateOptions
): Promise<QwenGenerationResult> {
  const response = await fetch(`${API_BASE_URL}/qwen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: buildQwenInput(options) }),
  });

  const predictionRaw = await response.json();
  if (!response.ok) {
    throw new Error(predictionRaw?.error || 'Failed to create Qwen prediction.');
  }

  let prediction = predictionRaw as ReplicatePrediction;

  if (prediction.status !== 'succeeded') {
    prediction = await pollQwenPrediction(prediction.id);
  }

  return {
    url: getPredictionOutputUrl(prediction),
    predictTimeSeconds: prediction.metrics?.predict_time,
  };
}

/**
 * Start an upscale prediction via our API route
 */
export async function startUpscale(
  apiToken: string,
  imageUrl: string,
  upscaleFactor: '2x' | '4x' | '6x' = '4x',
  enhanceModel: TopazEnhanceModel = 'High Fidelity V2',
  faceEnhance: boolean = false,
  outputFormat: 'jpg' | 'png' = 'png'
): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE_URL}/upscale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      image: imageUrl,
      upscaleFactor,
      enhanceModel,
      faceEnhance,
      outputFormat,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start upscale');
  }

  const prediction: ReplicatePrediction = await response.json();

  return {
    id: prediction.id,
  };
}

/**
 * Poll for prediction result via our API route
 */
export async function pollPrediction(
  apiToken: string,
  predictionId: string,
  onProgress?: (status: string) => void,
  maxAttempts: number = 100,
  intervalMs: number = 3000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `${API_BASE_URL}/upscale/poll?id=${predictionId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to check prediction status');
    }

    const prediction: ReplicatePrediction = await response.json();

    if (onProgress) {
      onProgress(prediction.status);
    }

    if (prediction.status === 'succeeded') {
      const output = prediction.output;
      if (Array.isArray(output)) {
        return output[0];
      }
      return output as string;
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error || 'Upscale failed');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Upscale timed out');
}

/**
 * Full upscale workflow using our API routes
 */
export async function upscaleImage(
  apiToken: string,
  imageData: string,
  mimeType: string,
  scaleFactorValue: number = 4,
  enhanceModel: TopazEnhanceModel = 'High Fidelity V2',
  faceEnhance: boolean = false,
  outputFormat: 'jpg' | 'png' = 'png',
  onProgress?: (status: string) => void
): Promise<string> {
  // Replicate accepts data URLs or plain URLs
  const imageUrl = imageData.startsWith('http')
    ? imageData
    : `data:${mimeType};base64,${imageData}`;

  // Map numeric scale to Topaz string factor
  let upscaleFactor: '2x' | '4x' | '6x' = '4x';
  if (scaleFactorValue <= 2) upscaleFactor = '2x';
  else if (scaleFactorValue <= 4) upscaleFactor = '4x';
  else upscaleFactor = '6x';

  const { id } = await startUpscale(
    apiToken,
    imageUrl,
    upscaleFactor,
    enhanceModel,
    faceEnhance,
    outputFormat
  );

  if (onProgress) {
    onProgress('processing');
  }

  return await pollPrediction(apiToken, id, onProgress);
}
