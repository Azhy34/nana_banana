import { VideoJobSettings, GeminiLogDetails } from '../types';
import { logGeminiEvent } from './geminiService';
import {
  OMNI_MODEL_ID,
  OMNI_DEFAULT_DURATION_SECONDS,
  OMNI_USD_PER_M_VIDEO_TOKENS,
  composeOmniPrompt,
  getOmniCostUsd,
  omniNeedsUriDelivery,
} from '../constants';

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';
const FILE_POLL_INTERVAL_MS = 3000;
const FILE_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SEED = 2147483647; // the API takes an integer seed; the form allows up to 2^32-1, so it is folded into this range

/** Image types the Interactions API accepts as input (API reference): png, jpeg, webp, heic, heif, gif, bmp, tiff. We allow the three a browser can produce. */
const OMNI_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type OmniImageMime = (typeof OMNI_IMAGE_MIME_TYPES)[number];
export interface OmniImage { data: string; mimeType: OmniImageMime }

/**
 * Splits an uploaded picture (a data URL from the file input) into raw base64 + its REAL mime type.
 * The type used to be hard-coded as image/jpeg although the uploader accepts any image/*, so a PNG mockup was mislabelled.
 * A bare base64 string without a prefix keeps the old default (jpeg).
 */
export function parseOmniImage(imageBase64: string): OmniImage {
  const prefix = /^data:(image\/[\w.+-]+);base64,/i.exec(imageBase64);
  const declared = (prefix?.[1] ?? 'image/jpeg').toLowerCase();
  const mimeType = (declared === 'image/jpg' ? 'image/jpeg' : declared) as OmniImageMime;
  if (!OMNI_IMAGE_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Omni принимает кадр в PNG, JPG или WebP, а загружен ${declared}. Сохраните кадр как PNG или JPG и загрузите снова.`);
  }
  return { data: prefix ? imageBase64.slice(prefix[0].length) : imageBase64, mimeType };
}

export interface OmniResult {
  videoUrl: string;
  /** What the clip cost: the real bill when Google reported it, otherwise the price-list calculation. */
  costUsd: number;
  /** true = read from Google's `usage` (video output tokens x $12 / 1M); false = calculated from the price list. */
  costFromUsage: boolean;
}

/**
 * The real bill of an interaction: video output tokens x $12 per 1M. Google reports them in
 * `usage.output_tokens_by_modality` (Interactions API reference); null when the answer carries no video tokens.
 */
export function billedCostFromUsage(usage: any): number | null {
  const entries: any[] = Array.isArray(usage?.output_tokens_by_modality) ? usage.output_tokens_by_modality : [];
  const tokens = entries
    .filter((m) => m?.modality === 'video')
    .reduce((sum, m) => sum + (Number(m?.tokens) || 0), 0);
  return tokens > 0 ? (tokens * OMNI_USD_PER_M_VIDEO_TOKENS) / 1_000_000 : null;
}

/**
 * Builds the request of the Google Interactions API for Gemini Omni 1.2 Flash (image-to-video).
 * Exported so a test can check the contract without calling the network.
 *
 * Contract (aistudio.google.com/docs/omni):
 *  - `response_format.duration` is a string of whole seconds, "3s".."15s". NOT SENT = the model makes 10 s;
 *  - `delivery: "uri"` for 1080p / long clips (larger than 4 MB), otherwise the video comes inline as base64;
 *  - `stream`, `background` = false and `store` = false: Google's advice for a plain synchronous generation
 *    (the video then cannot be edited by a later turn, which this tool never does);
 *  - EXCEPTION: `delivery: "uri"` makes Google answer 400 "store=true is required when response format has video delivery set to URI",
 *    so a request that asks for a link (1080p, clips over 10 s) is sent with `store: true`;
 *  - there is no negative-prompt parameter: the wallpaper freeze is a sentence of the text, added to EVERY request (composeOmniPrompt).
 */
export function buildOmniPayload(image: OmniImage, settings: VideoJobSettings) {
  const resolution = settings.resolution || '720p';
  const seconds = settings.durationSeconds ?? OMNI_DEFAULT_DURATION_SECONDS;
  if (!Number.isInteger(seconds) || seconds < 3 || seconds > 15) {
    throw new Error(`Omni clip length must be a whole number of seconds from 3 to 15, got ${seconds}.`);
  }
  const viaUri = omniNeedsUriDelivery(resolution, seconds);
  const seed = Number.isInteger(settings.seed) ? settings.seed % MAX_SEED : undefined;

  return {
    seconds,
    viaUri,
    seed,
    payload: {
      model: OMNI_MODEL_ID,
      input: [
        { type: 'image', data: image.data, mime_type: image.mimeType },
        // the form holds the MOTION only: the first-frame sentence, the wallpaper freeze and the sound are always added here
        { type: 'text', text: composeOmniPrompt(settings.customPrompt) },
      ],
      response_format: {
        type: 'video',
        resolution,
        aspect_ratio: '9:16',
        duration: `${seconds}s`,
        ...(viaUri ? { delivery: 'uri' } : {}),
      },
      ...(seed !== undefined ? { generation_config: { seed } } : {}),
      store: viaUri, // Google: delivery "uri" requires store=true; an inline answer is faster with store=false
      stream: false,
      background: false,
    },
  };
}

/** Finds the video in an Interaction: the SDK-only `output_video` field first, then steps[].content[] (the raw REST shape). */
function findVideo(interaction: any): { data?: string; uri?: string } | null {
  const direct = interaction?.output_video;
  if (direct?.data || direct?.uri) return { data: direct.data, uri: direct.uri };
  for (const step of Array.isArray(interaction?.steps) ? interaction.steps : []) {
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const item of step.content) {
      if (item.type === 'video' && (item.data || item.uri)) return { data: item.data, uri: item.uri };
    }
  }
  return null;
}

/** URI delivery: wait until the Files API reports the file ACTIVE, then download it (Google: poll `files/{id}`, then `files/{id}:download?alt=media`). */
async function fetchVideoFromUri(uri: string, apiKey: string, onProgress?: (progress: number) => void): Promise<Blob> {
  const fileId = /files\/([^/:?]+)/.exec(uri)?.[1];
  if (!fileId) throw new Error(`Omni returned a video URI without a file id: ${uri.split('?')[0]}`);

  const started = Date.now();
  let progress = 92;
  while (true) {
    const res = await fetch(`${API_ROOT}/files/${fileId}?key=${apiKey}`);
    if (!res.ok) throw new Error(`Omni file status check failed with HTTP ${res.status}`);
    const state = (await res.json())?.state;
    if (state === 'ACTIVE') break;
    if (state === 'FAILED') throw new Error('Omni video processing failed on the Google side.');
    if (Date.now() - started > FILE_POLL_TIMEOUT_MS) throw new Error('Omni video was not ready in 5 minutes.');
    progress = Math.min(97, progress + 1);
    if (onProgress) onProgress(progress);
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
  }

  const download = await fetch(`${API_ROOT}/files/${fileId}:download?alt=media&key=${apiKey}`);
  if (!download.ok) throw new Error(`Omni video download failed with HTTP ${download.status}`);
  return download.blob();
}

/**
 * Generates Gemini Omni 1.2 Flash video completely on the client side (browser)
 * using the official Google Interactions API.
 *
 * Supports:
 * - 720p Final (default, 720x1280, the minimum Etsy accepts)
 * - 1080p (upscaled by Google, Etsy's recommended quality; delivered through the Files API)
 * - 3 to 15 seconds (default 5); the price is per second, see getOmniCostUsd
 * - Image-to-Video with locked wallpaper pattern & nursery physics
 */
export async function generateOmniVideoOnClient(
  imageBase64: string,
  settings: VideoJobSettings,
  apiKey: string,
  onProgress?: (progress: number) => void,
  traceId?: string
): Promise<OmniResult> {
  if (!apiKey) {
    throw new Error("Gemini API key is required. Please set it in the header settings.");
  }

  const image = parseOmniImage(imageBase64);
  const resolution = settings.resolution || '720p';
  const { payload, seconds, viaUri, seed } = buildOmniPayload(image, settings);
  const cost = getOmniCostUsd(resolution, seconds);

  const requestDetails: GeminiLogDetails = {
    // Must mirror what the payload below actually sends, otherwise trace analysis lies
    aspectRatio: '9:16',
    durationSeconds: seconds,
    seed,
  };

  if (onProgress) onProgress(15);

  logGeminiEvent(
    OMNI_MODEL_ID,
    `Omni Video Start [${resolution}, ${seconds}s]: ${settings.customPrompt}`,
    0,
    0,
    'started',
    null,
    traceId,
    undefined,
    { ...requestDetails, resolution }
  );

  const endpoint = `${API_ROOT}/interactions?key=${apiKey}`;

  try {
    if (onProgress) onProgress(30);

    // Progress simulation while waiting for network processing
    let currentProgress = 30;
    const progressInterval = setInterval(() => {
      if (currentProgress < 90) {
        currentProgress += 2;
        if (onProgress) onProgress(Math.min(90, currentProgress));
      }
    }, 1000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } finally {
      clearInterval(progressInterval);
    }

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: `HTTP ${response.status} ${response.statusText}` };
      }

      const errMsg = errorData?.error?.message || errorData?.message || `Interactions API call failed with status ${response.status}`;
      const err: any = new Error(`Omni Video generation failed: ${errMsg}`);
      err.code = errorData?.error?.code || response.status;
      err.status = errorData?.error?.status;
      throw err;
    }

    const interaction = await response.json();
    if (onProgress) onProgress(92);

    const video = findVideo(interaction);
    if (!video) {
      throw new Error("No video found in the Gemini Omni 1.2 Flash response.");
    }

    let blob: Blob;
    if (video.data) {
      const binary = atob(video.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: "video/mp4" });
    } else {
      blob = await fetchVideoFromUri(video.uri as string, apiKey, onProgress);
      if (!blob.type.startsWith('video/')) blob = new Blob([blob], { type: 'video/mp4' });
    }
    // Blob URL for smooth memory management in the video element
    const videoUrl = URL.createObjectURL(blob);
    const billed = billedCostFromUsage(interaction.usage);
    const finalCost = billed ?? cost; // the real bill when Google sent it, else the price-list estimate

    if (onProgress) onProgress(100);

    logGeminiEvent(
      OMNI_MODEL_ID,
      `Omni Video Success [${resolution}, ${seconds}s${viaUri ? ', uri' : ''}]: ${settings.customPrompt}`,
      finalCost,
      seconds,
      'success',
      null,
      traceId,
      undefined,
      { ...requestDetails, resolution, interactionId: interaction.id }
    );

    return { videoUrl, costUsd: finalCost, costFromUsage: billed !== null };
  } catch (error: any) {
    logGeminiEvent(
      OMNI_MODEL_ID,
      `Omni Video Error: ${settings.customPrompt}`,
      0,
      0,
      'error',
      error.message || String(error),
      traceId,
      undefined,
      {
        ...requestDetails,
        errorCode: error.code,
        errorStatus: error.status
      }
    );
    throw error;
  }
}
