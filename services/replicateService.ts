/**
 * Replicate Service - Handles image upscaling via Topaz Labs
 * Uses Vercel API routes (no CORS proxy needed)
 */

const API_BASE_URL = '/api';

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
}

/**
 * Start an upscale prediction via our API route
 */
export async function startUpscale(
  apiToken: string,
  imageUrl: string,
  upscaleFactor: '2x' | '4x' | '6x' = '4x',
  enhanceModel: TopazEnhanceModel = 'High Fidelity V2',
  faceEnhance: boolean = false
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
    faceEnhance
  );

  if (onProgress) {
    onProgress('processing');
  }

  return await pollPrediction(apiToken, id, onProgress);
}
