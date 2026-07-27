import { GoogleGenAI } from '@google/genai';
import { VideoJobSettings, GeminiLogDetails } from '../types';
import { logGeminiEvent } from './geminiService';
import {
  VEO_MODEL_ID,
  VEO_FIXED_DURATION_SECONDS,
  VEO_FIXED_ASPECT_RATIO,
  VEO_PERSON_GENERATION,
  getVeoCostUsd
} from '../constants';

/**
 * Generates Veo video completely on the client side (browser)
 * using the official @google/genai SDK.
 * 
 * Avoids any serverless Vercel function endpoints, cloud uploads,
 * or server configuration issues.
 */
export async function generateVeoVideoOnClient(
  imageBase64: string,
  settings: VideoJobSettings,
  negativePrompt: string,
  apiKey: string,
  onProgress?: (progress: number) => void,
  traceId?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error("Gemini API key is required. Please set it in the settings.");
  }

  // 1. Initialize client directly in browser
  const ai = new GoogleGenAI({ apiKey });

  if (onProgress) onProgress(10);
 
  // Clean base64 prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const requestDetails: GeminiLogDetails = {
    aspectRatio: VEO_FIXED_ASPECT_RATIO,
    durationSeconds: VEO_FIXED_DURATION_SECONDS,
    personGeneration: VEO_PERSON_GENERATION,
    seed: settings.seed,
  };

  let operationName: string | undefined;

  // 3. Trigger video generation LRO
  try {
    logGeminiEvent(VEO_MODEL_ID, `Video Start: ${settings.customPrompt}`, 0, 0, 'started', null, traceId, negativePrompt, requestDetails);

    const operation = await ai.models.generateVideos({
      model: VEO_MODEL_ID,
      prompt: settings.customPrompt,
      image: {
        imageBytes: cleanBase64,
        mimeType: 'image/jpeg'
      },
      config: {
        aspectRatio: VEO_FIXED_ASPECT_RATIO,
        durationSeconds: VEO_FIXED_DURATION_SECONDS,
        personGeneration: VEO_PERSON_GENERATION,
        // NOTE: `seed` is intentionally NOT sent — confirmed via live test that the
        // Gemini Developer API (mldev) backend rejects it client-side with
        // "seed parameter is not supported in Gemini API." (Vertex AI-only field).
        // settings.seed is still logged (see requestDetails) purely for correlation
        // with the download filename, and is used nowhere in the actual request.
        negativePrompt: negativePrompt || undefined
      }
    });

    operationName = operation.name;

    if (onProgress) onProgress(30);

    // 4. Poll / Wait for the LRO to complete
    let currentProgress = 30;
    const progressInterval = setInterval(() => {
      if (currentProgress < 95) {
        currentProgress += 1.5;
        if (onProgress) onProgress(Math.min(95, currentProgress));
      }
    }, 1000);

    try {
      let polledOp = operation;
      while (!polledOp.done) {
        // Wait 5 seconds between polls
        await new Promise(resolve => setTimeout(resolve, 5000));
        polledOp = await ai.operations.getVideosOperation({ operation: polledOp });
      }

      clearInterval(progressInterval);
      if (onProgress) onProgress(100);

      if (polledOp.error) {
        const errObj = polledOp.error as Record<string, unknown>;
        const errMsg = typeof errObj.message === 'string'
          ? errObj.message
          : JSON.stringify(errObj);
        const err: any = new Error(`Video generation failed: ${errMsg}`);
        if (errObj.code !== undefined) err.code = errObj.code;
        if (errObj.status !== undefined) err.status = errObj.status;
        throw err;
      }

      const result = polledOp.response;
      if (!result) {
        throw new Error("No response returned from the completed operation.");
      }

      const raiMediaFilteredCount = result.raiMediaFilteredCount;
      const raiMediaFilteredReasons = result.raiMediaFilteredReasons;

      const generatedVideo = result.generatedVideos?.[0];
      if (!generatedVideo || !generatedVideo.video) {
        const err: any = new Error("No video returned in the Gemini API response.");
        if (raiMediaFilteredCount) err.raiMediaFilteredCount = raiMediaFilteredCount;
        if (raiMediaFilteredReasons?.length) err.raiMediaFilteredReasons = raiMediaFilteredReasons;
        throw err;
      }

      const videoBytes = generatedVideo.video.videoBytes;
      let downloadUrl = "";

      if (videoBytes) {
        downloadUrl = `data:video/mp4;base64,${videoBytes}`;
      } else if (generatedVideo.video.uri) {
        let uri = generatedVideo.video.uri;
        if (uri.startsWith('http')) {
          const baseUrl = uri.split('?')[0];
          let downloadUrlBase = baseUrl;
          if (!downloadUrlBase.endsWith(':download')) {
            downloadUrlBase = `${downloadUrlBase}:download`;
          }
          downloadUrl = `${downloadUrlBase}?alt=media&key=${apiKey}`;
        } else {
          downloadUrl = uri;
        }
      }

      logGeminiEvent(
        VEO_MODEL_ID,
        `Video Success: ${settings.customPrompt} | Output: ${downloadUrl.split('key=')[0]}${downloadUrl.includes('key=') ? 'key=[REDACTED]' : ''}`,
        getVeoCostUsd(VEO_FIXED_DURATION_SECONDS),
        VEO_FIXED_DURATION_SECONDS,
        'success',
        null,
        traceId,
        negativePrompt,
        {
          ...requestDetails,
          operationName,
          raiMediaFilteredCount: raiMediaFilteredCount || undefined,
          raiMediaFilteredReasons: raiMediaFilteredReasons?.length ? raiMediaFilteredReasons : undefined,
        }
      );

      if (downloadUrl) {
        return downloadUrl;
      }

      throw new Error("Video output data is empty in the response.");
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  } catch (error: any) {
    logGeminiEvent(
      VEO_MODEL_ID,
      `Video Error: ${settings.customPrompt}`,
      0, 0, 'error',
      error.message || String(error),
      traceId,
      negativePrompt,
      {
        ...requestDetails,
        operationName,
        errorCode: error.code,
        errorStatus: error.status,
        raiMediaFilteredCount: error.raiMediaFilteredCount,
        raiMediaFilteredReasons: error.raiMediaFilteredReasons,
      }
    );
    throw error;
  }
}
