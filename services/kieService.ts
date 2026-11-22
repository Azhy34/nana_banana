import { GenerationSettings, GenerationUsage, UploadedImage } from '../types';
import { getModelCapability, validateModelInput, kling26InputSchema } from '../shared/modelContracts';
import { logGeminiEvent } from './geminiService';
import { generateSpanId, generateTraceId } from '../utils/tracing';

const WALLPAPER_LABEL =
  'REFERENCE_IMAGE_1 (Wallpaper Graphic Artwork): This is the exact wallpaper graphic design to display on the accent wall. Preserve all colors, illustrations, lines, and composition 1:1 without alteration.';

const TEXTURE_LABEL =
  'REFERENCE_IMAGE_2 (Physical Material Texture Reference - Craft Lambda Non-Woven Sand Texture): This is a macro photograph of the real physical wallpaper material. Extract and copy ONLY the physical surface micro-relief: the fine-grain sand texture (Sandstruktur), non-woven paper fleece substrate, and ultra-matte chalky finish under natural daylight. DO NOT copy or transfer any graphic drawings or gold leaf designs from REFERENCE_IMAGE_2. Only transfer its physical paper texture and tactile surface grain onto the wall.';

/**
 * KIE models accept references as a flat URL array (no per-image text parts),
 * so the prompt must explicitly bind index 1 -> wallpaper (1:1 unchanged) and index 2 -> texture.
 * In `brief` mode buildBriefPrompt() already embeds "References: image 1 is ...".
 */
function withKieReferenceLabels(
  prompt: string,
  refCount: number,
  withTexture: boolean,
  promptMode?: string,
): string {
  if (refCount === 0 || promptMode === 'brief') return prompt;
  if (prompt.includes('REFERENCE_IMAGE_1')) return prompt;
  const labels = [WALLPAPER_LABEL, ...(withTexture && refCount > 1 ? [TEXTURE_LABEL] : [])];
  return `${labels.join('\n')}\n\n${prompt}`;
}

async function callKieProxy<T = any>(kieKey: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/kie', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${kieKey}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || (json && typeof json.code === 'number' && json.code !== 200)) {
    throw new Error(json?.msg || json?.error || `KIE request failed (${res.status})`);
  }
  return json as T;
}

async function uploadReference(kieKey: string, image: UploadedImage, fileName: string): Promise<string> {
  const dataUrl = `data:${image.mimeType || 'image/jpeg'};base64,${image.data}`;
  const res = await callKieProxy<{ data?: { downloadUrl?: string; download_url?: string } }>(kieKey, {
    action: 'upload',
    base64Data: dataUrl,
    fileName,
    uploadPath: 'nana-banana/refs',
  });
  const url = res?.data?.downloadUrl || res?.data?.download_url;
  if (!url) throw new Error('KIE upload succeeded but returned no downloadUrl');
  return url;
}

async function pollKieTask(kieKey: string, taskId: string, timeoutMs = 240_000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 3500));
    const res = await callKieProxy<{ data?: { state?: string; resultJson?: string; failMsg?: string } }>(kieKey, {
      action: 'recordInfo',
      taskId,
    });
    const state = res?.data?.state;
    if (state === 'success') {
      const parsed = JSON.parse(res.data?.resultJson || '{}');
      const url = parsed?.resultUrls?.[0] || parsed?.images?.[0]?.url || parsed?.url;
      if (!url) throw new Error('KIE task succeeded but returned no image URL');
      return url;
    }
    if (state === 'fail' || state === 'failed') {
      throw new Error(res?.data?.failMsg || 'KIE generation task failed');
    }
  }
  throw new Error('KIE generation timed out');
}

function buildKieInput(
  modelId: string,
  prompt: string,
  refUrls: string[],
  aspectRatio: string,
  resolution?: string,
): Record<string, unknown> {
  const cap = getModelCapability(modelId);
  const input: Record<string, unknown> = { prompt };

  if (refUrls.length > 0 && cap?.refField) {
    input[cap.refField] = refUrls;
  }
  if (aspectRatio && cap?.aspectRatios.includes(aspectRatio)) {
    input.aspect_ratio = aspectRatio;
  }
  if (resolution && cap?.resolutions.includes(resolution)) {
    input.resolution = resolution;
  }
  if (modelId.startsWith('nano-banana')) {
    input.output_format = 'png';
  }
  return input;
}

export async function generateKieImage(
  kieKey: string,
  referenceImages: UploadedImage[],
  settings: GenerationSettings,
  traceId?: string,
): Promise<{ image: string; usage: GenerationUsage }> {
  if (!kieKey) throw new Error('KIE API Key is required in the header.');
  const tid = traceId || generateTraceId();
  const spanId = generateSpanId();
  const startTime = Date.now();

  const validation = validateModelInput({
    modelId: settings.model,
    prompt: settings.prompt,
    aspectRatio: settings.aspectRatio,
    resolution: settings.imageSize,
    refCount: referenceImages.length,
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  const cap = getModelCapability(settings.model);
  const cost = cap?.costUsd2K ?? 0.03;

  logGeminiEvent(settings.model, settings.prompt, 0, 0, 'started', null, tid, undefined, {
    aspectRatio: settings.aspectRatio,
    resolution: settings.imageSize,
    referenceCount: referenceImages.length,
    provider: 'kie',
    spanId,
  });

  try {
    const refUrls = await Promise.all(
      referenceImages.map((img, i) => uploadReference(kieKey, img, `ref_${i + 1}.jpg`)),
    );
    const labeledPrompt = withKieReferenceLabels(settings.prompt, refUrls.length, false);
    const input = buildKieInput(settings.model, labeledPrompt, refUrls, settings.aspectRatio, settings.imageSize);
    const created = await callKieProxy<{ data?: { taskId?: string } }>(kieKey, {
      action: 'createTask',
      model: settings.model,
      input,
    });
    const taskId = created?.data?.taskId;
    if (!taskId) throw new Error('KIE createTask returned no taskId');

    const image = await pollKieTask(kieKey, taskId);
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(settings.model, settings.prompt, cost, duration, 'success', null, tid, undefined, {
      aspectRatio: settings.aspectRatio,
      resolution: settings.imageSize,
      referenceCount: referenceImages.length,
      provider: 'kie',
      spanId,
    });

    return {
      image,
      usage: { promptTokens: 0, candidateTokens: 0, totalTokens: 0 },
    };
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(settings.model, settings.prompt, 0, duration, 'error', err?.message || 'KIE error', tid, undefined, {
      aspectRatio: settings.aspectRatio,
      resolution: settings.imageSize,
      provider: 'kie',
      spanId,
    });
    throw err;
  }
}

export async function generateKieBatchImage(
  kieKey: string,
  wallpaper: UploadedImage,
  prompt: string,
  aspectRatio: string,
  modelId: string,
  traceId?: string,
  textureImage?: UploadedImage | null,
  analytics?: { promptMode?: string; style?: string; audience?: string },
): Promise<string> {
  if (!kieKey) throw new Error('KIE API Key is required in the header.');
  const tid = traceId || generateTraceId();
  const spanId = generateSpanId();
  const startTime = Date.now();
  const refs = textureImage ? [wallpaper, textureImage] : [wallpaper];

  const validation = validateModelInput({
    modelId,
    prompt,
    aspectRatio,
    resolution: '2K',
    refCount: refs.length,
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  const cap = getModelCapability(modelId);
  const cost = cap?.costUsd2K ?? 0.03;

  logGeminiEvent(modelId, prompt, 0, 0, 'started', null, tid, undefined, {
    aspectRatio,
    resolution: '2K',
    referenceCount: refs.length,
    provider: 'kie',
    spanId,
    ...analytics,
  });

  try {
    const refUrls = [await uploadReference(kieKey, wallpaper, 'wallpaper.jpg')];
    if (textureImage) {
      refUrls.push(await uploadReference(kieKey, textureImage, 'craft_lambda.jpg'));
    }

    const labeledPrompt = withKieReferenceLabels(prompt, refUrls.length, Boolean(textureImage), analytics?.promptMode);
    const input = buildKieInput(modelId, labeledPrompt, refUrls, aspectRatio, '2K');
    const created = await callKieProxy<{ data?: { taskId?: string } }>(kieKey, {
      action: 'createTask',
      model: modelId,
      input,
    });
    const taskId = created?.data?.taskId;
    if (!taskId) throw new Error('KIE createTask returned no taskId');

    const imageUrl = await pollKieTask(kieKey, taskId);
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(modelId, prompt, cost, duration, 'success', null, tid, undefined, {
      aspectRatio,
      resolution: '2K',
      referenceCount: refs.length,
      provider: 'kie',
      spanId,
      ...analytics,
    });
    return imageUrl;
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(modelId, prompt, 0, duration, 'error', err?.message || 'KIE error', tid, undefined, {
      aspectRatio,
      resolution: '2K',
      provider: 'kie',
      spanId,
      ...analytics,
    });
    throw err;
  }
}

export async function generateKieVideo(
  kieKey: string,
  imageDataUrl: string,
  prompt: string,
  durationSeconds: number = 5,
  onProgress?: (progress: number) => void,
  traceId?: string,
): Promise<string> {
  if (!kieKey) throw new Error('KIE API Key is required in the header.');
  const tid = traceId || generateTraceId();
  const spanId = generateSpanId();
  const startTime = Date.now();
  const modelId = 'kling-2.6/image-to-video';
  const durationStr = durationSeconds >= 10 ? '10' : '5';
  const cost = durationStr === '10' ? 0.63 : 0.315;

  const validation = validateModelInput({
    modelId,
    prompt,
    refCount: 1,
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  logGeminiEvent(modelId, prompt, 0, 0, 'started', null, tid, undefined, {
    durationSeconds: Number(durationStr),
    provider: 'kie',
    spanId,
  });

  try {
    onProgress?.(10);
    const uploadRes = await callKieProxy<{ data?: { downloadUrl?: string; download_url?: string } }>(kieKey, {
      action: 'upload',
      base64Data: imageDataUrl,
      fileName: 'video_frame.jpg',
      uploadPath: 'nana-banana/video',
    });
    const frameUrl = uploadRes?.data?.downloadUrl || uploadRes?.data?.download_url;
    if (!frameUrl) throw new Error('KIE frame upload returned no downloadUrl');

    onProgress?.(25);
    const klingInput = {
      prompt,
      image_urls: [frameUrl],
      sound: false,
      duration: durationStr as '5' | '10',
    };
    const parsedKling = kling26InputSchema.safeParse(klingInput);
    if (!parsedKling.success) {
      throw new Error(`Invalid Kling 2.6 payload: ${parsedKling.error.issues.map(i => i.message).join('; ')}`);
    }

    const created = await callKieProxy<{ data?: { taskId?: string } }>(kieKey, {
      action: 'createTask',
      model: modelId,
      input: parsedKling.data,
    });
    const taskId = created?.data?.taskId;
    if (!taskId) throw new Error('KIE Kling createTask returned no taskId');

    const startedPoll = Date.now();
    while (Date.now() - startedPoll < 300_000) {
      await new Promise(r => setTimeout(r, 4000));
      const elapsedRatio = Math.min(0.65, (Date.now() - startedPoll) / 180_000);
      onProgress?.(Math.round(25 + elapsedRatio * 100));

      const res = await callKieProxy<{ data?: { state?: string; resultJson?: string; failMsg?: string } }>(kieKey, {
        action: 'recordInfo',
        taskId,
      });
      const state = res?.data?.state;
      if (state === 'success') {
        const parsed = JSON.parse(res.data?.resultJson || '{}');
        const url = parsed?.resultUrls?.[0] || parsed?.video?.url || parsed?.url;
        if (!url) throw new Error('KIE Kling task succeeded but returned no video URL');
        const duration = (Date.now() - startTime) / 1000;
        logGeminiEvent(modelId, prompt, cost, duration, 'success', null, tid, undefined, {
          durationSeconds: Number(durationStr),
          provider: 'kie',
          spanId,
        });
        onProgress?.(100);
        return url;
      }
      if (state === 'fail' || state === 'failed') {
        throw new Error(res?.data?.failMsg || 'KIE Kling video generation failed');
      }
    }
    throw new Error('KIE Kling video generation timed out');
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(modelId, prompt, 0, duration, 'error', err?.message || 'KIE Kling error', tid, undefined, {
      durationSeconds: Number(durationStr),
      provider: 'kie',
      spanId,
    });
    throw err;
  }
}
