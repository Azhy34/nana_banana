import { upload } from '@vercel/blob/client';
import { VideoJobSettings } from '../types';

/**
 * Helper to compress base64/dataUrl image to JPEG (Quality 90%) using HTML5 Canvas.
 * Keeps the original resolution for wallpaper details but drastically reduces size.
 */
function compressToJpegBlob(dataUrl: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get 2D canvas context');
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob returned null'));
            }
          },
          'image/jpeg',
          0.90 // 90% quality compression
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = dataUrl;
  });
}

/**
 * Ensures the image payload is a publicly accessible Vercel Blob URL.
 * Converts local Base64/data URLs to JPEG (90% quality) and uploads them.
 */
export async function ensurePublicUrl(imagePayload: string): Promise<string> {
  if (imagePayload.startsWith('http://') || imagePayload.startsWith('https://')) {
    return imagePayload;
  }

  try {
    // Compress base64/dataUrl to high quality JPEG
    const compressedBlob = await compressToJpegBlob(imagePayload);
    const filename = `veo-input-${Date.now()}.jpg`;

    // Upload to Vercel Blob using client token generator
    const blob = await upload(filename, compressedBlob, {
      access: 'public',
      handleUploadUrl: '/api/upload',
    });

    return blob.url;
  } catch (err: any) {
    console.error('[veoService] ensurePublicUrl failed:', err);
    throw new Error(`Failed to upload wallpaper frame to cloud storage: ${err.message}`);
  }
}

/**
 * Starts Veo long-running operation via backend endpoint.
 */
export async function startVeoAnimation(
  imageUrl: string,
  settings: VideoJobSettings,
  negativePrompt: string,
  geminiApiKey?: string
): Promise<{ operationId: string; traceId: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (geminiApiKey) {
    headers['Authorization'] = `Bearer ${geminiApiKey}`;
  }

  const response = await fetch('/api/animate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      imageUrl,
      prompt: settings.customPrompt,
      negativePrompt,
      seed: settings.seed,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to initiate video generation');
  }

  return response.json(); // returns { operationId, traceId }
}

/**
 * Polls the backend operation status.
 * Returns { status: 'processing' } or { status: 'done', videoUrl: '...' }
 */
export async function pollVeoOperation(
  operationId: string, 
  traceId: string,
  geminiApiKey?: string
): Promise<{
  status: 'processing' | 'done';
  videoUrl?: string;
  error?: string;
}> {
  const headers: Record<string, string> = {};
  if (geminiApiKey) {
    headers['Authorization'] = `Bearer ${geminiApiKey}`;
  }

  const response = await fetch(
    `/api/animate/poll?operationId=${encodeURIComponent(operationId)}&traceId=${encodeURIComponent(traceId)}`,
    { headers }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to check video status');
  }

  return response.json();
}
