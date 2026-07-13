import { GoogleGenAI } from '@google/genai';
import { VideoJobSettings } from '../types';
import { logGeminiEvent } from './geminiService';

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

  // 2. Format prompt
  const combinedPrompt = negativePrompt 
    ? `${settings.customPrompt} Negative prompt: ${negativePrompt}` 
    : settings.customPrompt;

  if (onProgress) onProgress(10);

  // Clean base64 prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  // 3. Trigger video generation LRO
  try {
    logGeminiEvent('veo-3.1-fast-generate-preview', `Video Start: ${combinedPrompt}`, 0, 0, 'success', null, traceId);

    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: combinedPrompt,
      image: {
        imageBytes: cleanBase64,
        mimeType: 'image/jpeg'
      },
      config: {
        aspectRatio: '9:16',
        durationSeconds: 6,
        personGeneration: 'allow_adult'
      }
    });

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
        const errMsg = typeof polledOp.error.message === 'string' 
          ? polledOp.error.message 
          : JSON.stringify(polledOp.error);
        throw new Error(`Video generation failed: ${errMsg}`);
      }

      const result = polledOp.response;
      if (!result) {
        throw new Error("No response returned from the completed operation.");
      }

      const generatedVideo = result.generatedVideos?.[0];
      if (!generatedVideo || !generatedVideo.video) {
        throw new Error("No video returned in the Gemini API response.");
      }

      logGeminiEvent('veo-3.1-fast-generate-preview', `Video Success: ${combinedPrompt}`, 0.60, 6.0, 'success', null, traceId);

      const videoBytes = generatedVideo.video.videoBytes;
      if (videoBytes) {
        return `data:video/mp4;base64,${videoBytes}`;
      }

      if (generatedVideo.video.uri) {
        return generatedVideo.video.uri;
      }

      throw new Error("Video output data is empty in the response.");
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  } catch (error: any) {
    logGeminiEvent('veo-3.1-fast-generate-preview', `Video Error: ${combinedPrompt}`, 0, 0, 'error', error.message || String(error), traceId);
    throw error;
  }
}
