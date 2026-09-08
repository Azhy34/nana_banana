import { VideoJobSettings, GeminiLogDetails } from '../types';
import { logGeminiEvent } from './geminiService';
import {
  OMNI_MODEL_ID,
  getOmniCostUsd,
} from '../constants';

/**
 * Generates Gemini Omni 1.1 Flash video completely on the client side (browser)
 * using the official Google Interactions API.
 * 
 * Supports:
 * - 360p Draft (Fast & Cost-effective: ~0.15$)
 * - 720p Final (High Quality for Etsy/Pinterest: ~0.45$)
 * - Image-to-Video with locked wallpaper pattern & nursery physics
 */
export async function generateOmniVideoOnClient(
  imageBase64: string,
  settings: VideoJobSettings,
  apiKey: string,
  onProgress?: (progress: number) => void,
  traceId?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error("Gemini API key is required. Please set it in the header settings.");
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const resolution = settings.resolution || '360p';
  const cost = getOmniCostUsd(resolution);

  const requestDetails: GeminiLogDetails = {
    aspectRatio: '16:9',
    durationSeconds: 5,
    seed: settings.seed,
  };

  if (onProgress) onProgress(15);

  logGeminiEvent(
    OMNI_MODEL_ID,
    `Omni Video Start [${resolution}]: ${settings.customPrompt}`,
    0,
    0,
    'started',
    null,
    traceId,
    undefined,
    { ...requestDetails, resolution }
  );

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

  // Build the multimodal payload adhering strictly to the Google Omni 1.1 Interactions API contract
  const payload = {
    model: OMNI_MODEL_ID,
    input: [
      {
        type: "image",
        data: cleanBase64,
        mime_type: "image/jpeg"
      },
      {
        type: "text",
        text: settings.customPrompt
      }
    ],
    response_format: {
      type: "video",
      resolution: resolution,
      aspect_ratio: "9:16"
    }
  };

  try {
    if (onProgress) onProgress(30);

    // Progress simulation while waiting for network processing
    let currentProgress = 30;
    const progressInterval = setInterval(() => {
      if (currentProgress < 92) {
        currentProgress += 2;
        if (onProgress) onProgress(Math.min(92, currentProgress));
      }
    }, 1000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    clearInterval(progressInterval);

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
    if (onProgress) onProgress(95);

    let videoBase64: string | undefined;

    // Check convenience field first (standard SDK response)
    if (interaction.output_video?.data) {
      videoBase64 = interaction.output_video.data;
    } else if (Array.isArray(interaction.steps)) {
      // Fallback: search in steps array
      for (const step of interaction.steps) {
        if (step.type === "model_output" && Array.isArray(step.content)) {
          for (const item of step.content) {
            if (item.type === "video" && item.data) {
              videoBase64 = item.data;
              break;
            }
          }
        }
        if (videoBase64) break;
      }
    }

    if (!videoBase64) {
      throw new Error("No video bytes found in the Gemini Omni 1.1 Flash response.");
    }

    // Convert base64 to blob URL for smooth memory management in video element
    const binary = atob(videoBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "video/mp4" });
    const videoUrl = URL.createObjectURL(blob);

    if (onProgress) onProgress(100);

    logGeminiEvent(
      OMNI_MODEL_ID,
      `Omni Video Success [${resolution}]: ${settings.customPrompt}`,
      cost,
      5,
      'success',
      null,
      traceId,
      undefined,
      { ...requestDetails, resolution, interactionId: interaction.id }
    );

    return videoUrl;
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
