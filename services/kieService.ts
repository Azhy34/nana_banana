import { GenerationSettings, GenerationUsage, UploadedImage } from '../types';
import {
  getModelCapability,
  validateModelInput,
  kling26InputSchema,
  kling30InputSchema,
  videoUpscaleInputSchema,
  getVideoUpscaleEstimate,
  KIE_USD_PER_CREDIT,
  VideoUpscaleResolution,
} from '../shared/modelContracts';
import { logGeminiEvent } from './geminiService';
import { MACRO_TEXTURE_LABEL } from './macroTexture';
import { generateSpanId, generateTraceId } from '../utils/tracing';

const WALLPAPER_LABEL =
  'REFERENCE_IMAGE_1 (Wallpaper Graphic Artwork): This is the exact wallpaper graphic design to display on the accent wall. Preserve all colors, illustrations, lines, and composition 1:1 without alteration.';

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
  const labels = [WALLPAPER_LABEL, ...(withTexture && refCount > 1 ? [MACRO_TEXTURE_LABEL] : [])];
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

interface KieRecordData {
  state?: string;
  resultJson?: string;
  failMsg?: string;
  costTime?: number;
  consumeCredits?: number;
  creditsConsumed?: number;
  credits_consumed?: number;
}

interface KieTaskResult {
  url: string;
  serverTimeSeconds?: number;
  creditsConsumed?: number;
}

function parseKieRecordTelemetry(data?: KieRecordData): { serverTimeSeconds?: number; creditsConsumed?: number } {
  if (!data) return {};
  const rawTime = Number(data.costTime);
  const serverTimeSeconds = Number.isFinite(rawTime) && rawTime > 0
    ? (rawTime > 3600 ? rawTime / 1000 : rawTime)
    : undefined;
  const rawCredits = Number(data.consumeCredits ?? data.creditsConsumed ?? data.credits_consumed);
  const creditsConsumed = Number.isFinite(rawCredits) && rawCredits > 0 ? rawCredits : undefined;
  return { serverTimeSeconds, creditsConsumed };
}

async function pollKieTask(
  kieKey: string,
  taskId: string,
  timeoutMs = 240_000,
  onProgress?: (progress: number) => void,
): Promise<KieTaskResult> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 3500));
    if (onProgress) {
      const elapsedRatio = Math.min(0.85, (Date.now() - started) / (timeoutMs * 0.5));
      onProgress(Math.round(10 + elapsedRatio * 100));
    }
    const res = await callKieProxy<{ data?: KieRecordData }>(kieKey, {
      action: 'recordInfo',
      taskId,
    });
    const state = res?.data?.state;
    if (state === 'success') {
      const parsed = JSON.parse(res.data?.resultJson || '{}');
      const url = parsed?.resultUrls?.[0] || parsed?.video?.url || parsed?.images?.[0]?.url || parsed?.url;
      if (!url) throw new Error('KIE task succeeded but returned no result URL');
      return { url, ...parseKieRecordTelemetry(res.data) };
    }
    if (state === 'fail' || state === 'failed') {
      throw new Error(res?.data?.failMsg || 'KIE generation task failed');
    }
  }
  throw new Error(`KIE task timed out (taskId: ${taskId})`);
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

    const taskResult = await pollKieTask(kieKey, taskId);
    const duration = (Date.now() - startTime) / 1000;
    const credits = taskResult.creditsConsumed ?? cap?.kieCredits2K;
    const finalCost = taskResult.creditsConsumed ? taskResult.creditsConsumed * KIE_USD_PER_CREDIT : cost;
    logGeminiEvent(settings.model, settings.prompt, finalCost, duration, 'success', null, tid, undefined, {
      aspectRatio: settings.aspectRatio,
      resolution: settings.imageSize,
      referenceCount: referenceImages.length,
      provider: 'kie',
      spanId,
      kieTaskId: taskId,
      kieCredits: credits,
      serverTimeSeconds: taskResult.serverTimeSeconds,
      costSource: taskResult.creditsConsumed ? 'credits' : 'estimate',
    });

    return {
      image: taskResult.url,
      usage: { promptTokens: 0, candidateTokens: 0, totalTokens: 0, costUsd: finalCost, responseId: taskId },
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
  analytics?: { promptMode?: string; style?: string; audience?: string; macroTexture?: boolean },
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

    const taskResult = await pollKieTask(kieKey, taskId);
    const duration = (Date.now() - startTime) / 1000;
    const credits = taskResult.creditsConsumed ?? cap?.kieCredits2K;
    const finalCost = taskResult.creditsConsumed ? taskResult.creditsConsumed * KIE_USD_PER_CREDIT : cost;
    logGeminiEvent(modelId, prompt, finalCost, duration, 'success', null, tid, undefined, {
      aspectRatio,
      resolution: '2K',
      referenceCount: refs.length,
      provider: 'kie',
      spanId,
      kieTaskId: taskId,
      kieCredits: credits,
      serverTimeSeconds: taskResult.serverTimeSeconds,
      costSource: taskResult.creditsConsumed ? 'credits' : 'estimate',
      ...analytics,
    });
    return taskResult.url;
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

const KIE_CDN_HOSTS = ['tempfile.aiquickdraw.com', '.kie.ai', '.redpandaai.co'];

function isKieCdnUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return KIE_CDN_HOSTS.some((s) => (s.startsWith('.') ? host.endsWith(s) : host === s));
  } catch {
    return false;
  }
}

async function resolveVideoFrameUrl(kieKey: string, imageInput: string): Promise<string> {
  if (/^https?:\/\//i.test(imageInput)) {
    // Images generated via KIE Batch are already hosted on KIE CDN — pass directly without re-uploading
    if (isKieCdnUrl(imageInput)) return imageInput;

    const proxied = await fetch('/api/kie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetchImage', url: imageInput }),
    });
    if (!proxied.ok) throw new Error(`Failed to fetch source frame (${proxied.status})`);
    const blob = await proxied.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to encode fetched frame to base64'));
      reader.readAsDataURL(blob);
    });
    imageInput = dataUrl;
  }

  const normalized = imageInput.startsWith('data:')
    ? imageInput
    : `data:image/jpeg;base64,${imageInput}`;

  const uploadRes = await callKieProxy<{ data?: { downloadUrl?: string; download_url?: string } }>(kieKey, {
    action: 'upload',
    base64Data: normalized,
    fileName: 'video_frame.jpg',
    uploadPath: 'nana-banana/video',
  });
  const frameUrl = uploadRes?.data?.downloadUrl || uploadRes?.data?.download_url;
  if (!frameUrl) throw new Error('KIE frame upload returned no downloadUrl');
  return frameUrl;
}

export interface KieVideoOptions {
  modelId?: 'kling-2.6/image-to-video' | 'kling-3.0/video';
  mode?: 'std' | 'pro';
}

export async function generateKieVideo(
  kieKey: string,
  imageDataUrl: string,
  prompt: string,
  durationSeconds: number = 5,
  onProgress?: (progress: number) => void,
  traceId?: string,
  options: KieVideoOptions = {},
): Promise<string> {
  if (!kieKey) throw new Error('KIE API Key is required in the header.');
  const tid = traceId || generateTraceId();
  const spanId = generateSpanId();
  const startTime = Date.now();
  let taskId: string | undefined;
  const modelId = options.modelId ?? 'kling-2.6/image-to-video';
  const isKling3 = modelId === 'kling-3.0/video';
  const kling3Mode = options.mode ?? 'std';
  const durationNum = isKling3 ? Math.max(3, Math.min(15, Math.round(durationSeconds))) : (durationSeconds >= 10 ? 10 : 5);
  const durationStr = String(durationNum);
  const estimatedCredits = isKling3
    ? Number(((kling3Mode === 'pro' ? 20.2 : 15.1) * durationNum).toFixed(1))
    : (durationStr === '10' ? 126 : 63);
  const cost = Number((estimatedCredits * KIE_USD_PER_CREDIT).toFixed(4));
  const logResolution = isKling3 && kling3Mode === 'pro' ? '1080p' : '720p';

  const validation = validateModelInput({
    modelId,
    prompt,
    resolution: logResolution,
    refCount: 1,
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  logGeminiEvent(modelId, prompt, 0, 0, 'started', null, tid, undefined, {
    durationSeconds: durationNum,
    resolution: logResolution,
    provider: 'kie',
    spanId,
  });

  try {
    onProgress?.(10);
    const frameUrl = await resolveVideoFrameUrl(kieKey, imageDataUrl);

    onProgress?.(25);
    let validatedInput: Record<string, unknown>;
    if (isKling3) {
      const parsed3 = kling30InputSchema.safeParse({
        prompt,
        image_urls: [frameUrl],
        sound: false,
        duration: durationStr,
        mode: kling3Mode,
        multi_shots: false,
      });
      if (!parsed3.success) {
        throw new Error(`Invalid Kling 3.0 payload: ${parsed3.error.issues.map(i => i.message).join('; ')}`);
      }
      validatedInput = parsed3.data;
    } else {
      const parsedKling = kling26InputSchema.safeParse({
        prompt,
        image_urls: [frameUrl],
        sound: false,
        duration: durationStr as '5' | '10',
      });
      if (!parsedKling.success) {
        throw new Error(`Invalid Kling 2.6 payload: ${parsedKling.error.issues.map(i => i.message).join('; ')}`);
      }
      validatedInput = parsedKling.data;
    }

    const created = await callKieProxy<{ data?: { taskId?: string } }>(kieKey, {
      action: 'createTask',
      model: modelId,
      input: validatedInput,
    });
    taskId = created?.data?.taskId;
    if (!taskId) throw new Error('KIE Kling createTask returned no taskId');

    const pollTimeoutMs = isKling3 && kling3Mode === 'pro' ? 600_000 : 480_000;
    const startedPoll = Date.now();
    while (Date.now() - startedPoll < pollTimeoutMs) {
      await new Promise(r => setTimeout(r, 4000));
      const elapsedRatio = Math.min(0.65, (Date.now() - startedPoll) / (pollTimeoutMs * 0.75));
      onProgress?.(Math.round(25 + elapsedRatio * 100));

      const res = await callKieProxy<{ data?: KieRecordData }>(kieKey, {
        action: 'recordInfo',
        taskId,
      });
      const state = res?.data?.state;
      if (state === 'success') {
        const parsed = JSON.parse(res.data?.resultJson || '{}');
        const url = parsed?.resultUrls?.[0] || parsed?.video?.url || parsed?.url;
        if (!url) throw new Error('KIE Kling task succeeded but returned no video URL');
        const duration = (Date.now() - startTime) / 1000;
        const tel = parseKieRecordTelemetry(res.data);
        const credits = tel.creditsConsumed ?? estimatedCredits;
        const finalCost = tel.creditsConsumed ? tel.creditsConsumed * KIE_USD_PER_CREDIT : cost;
        logGeminiEvent(modelId, prompt, finalCost, duration, 'success', null, tid, undefined, {
          durationSeconds: durationNum,
          resolution: logResolution,
          provider: 'kie',
          spanId,
          kieTaskId: taskId,
          kieCredits: credits,
          serverTimeSeconds: tel.serverTimeSeconds,
          costSource: tel.creditsConsumed ? 'credits' : 'estimate',
        });
        onProgress?.(100);
        return url;
      }
      if (state === 'fail' || state === 'failed') {
        throw new Error(res?.data?.failMsg || 'KIE Kling video generation failed');
      }
    }
    throw new Error(`KIE Kling video generation timed out after ${Math.round(pollTimeoutMs / 60_000)}m (taskId: ${taskId}). Check kie.ai Logs.`);
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent(modelId, prompt, 0, duration, 'error', err?.message || 'KIE Kling error', tid, undefined, {
      durationSeconds: durationNum,
      resolution: logResolution,
      provider: 'kie',
      spanId,
      ...(taskId ? { kieTaskId: taskId } : {}),
    });
    throw err;
  }
}

export interface KieVideoUpscaleResult {
  url: string;
  costUsd: number;
  creditsConsumed: number;
  costFromUsage: boolean;
  serverTimeSeconds?: number;
}

export async function upscaleKieVideo(
  kieKey: string,
  videoUrl: string,
  resolution: VideoUpscaleResolution = '2K',
  durationSeconds: number = 5,
  onProgress?: (progress: number) => void,
  traceId?: string,
  inputDims?: { w: number; h: number } | null,
): Promise<KieVideoUpscaleResult> {
  if (!kieKey) throw new Error('KIE API Key is required in the header.');
  const parsedInput = videoUpscaleInputSchema.safeParse({ video_url: videoUrl, resolution });
  if (!parsedInput.success) {
    throw new Error(`Invalid video/upscale payload: ${parsedInput.error.issues.map(i => i.message).join('; ')}`);
  }

  const tid = traceId || generateTraceId();
  const spanId = generateSpanId();
  const startTime = Date.now();
  let taskId: string | undefined;
  const { credits: estimatedCredits, usd: estimatedCost } = getVideoUpscaleEstimate(resolution, durationSeconds);

  const baseTelemetry = {
    stage: 'upscale' as const,
    upscaleModel: 'video/upscale',
    provider: 'kie',
    resolution,
    durationSeconds,
    spanId,
    ...(inputDims ? { inputWidth: inputDims.w, inputHeight: inputDims.h } : {}),
  };

  logGeminiEvent('video/upscale', '', 0, 0, 'started', null, tid, undefined, baseTelemetry);

  try {
    onProgress?.(10);
    const created = await callKieProxy<{ data?: { taskId?: string } }>(kieKey, {
      action: 'createTask',
      model: 'video/upscale',
      input: parsedInput.data,
    });
    taskId = created?.data?.taskId;
    if (!taskId) throw new Error('KIE video/upscale createTask returned no taskId');

    const taskResult = await pollKieTask(kieKey, taskId, 300_000, onProgress);
    const duration = (Date.now() - startTime) / 1000;
    const creditsConsumed = taskResult.creditsConsumed ?? estimatedCredits;
    const finalCost = taskResult.creditsConsumed
      ? Number((taskResult.creditsConsumed * KIE_USD_PER_CREDIT).toFixed(4))
      : estimatedCost;

    logGeminiEvent('video/upscale', '', finalCost, duration, 'success', null, tid, undefined, {
      ...baseTelemetry,
      kieTaskId: taskId,
      kieCredits: creditsConsumed,
      serverTimeSeconds: taskResult.serverTimeSeconds,
      costSource: taskResult.creditsConsumed ? 'credits' : 'estimate',
    });
    onProgress?.(100);
    return {
      url: taskResult.url,
      costUsd: finalCost,
      creditsConsumed,
      costFromUsage: Boolean(taskResult.creditsConsumed),
      serverTimeSeconds: taskResult.serverTimeSeconds,
    };
  } catch (err: any) {
    const duration = (Date.now() - startTime) / 1000;
    logGeminiEvent('video/upscale', '', 0, duration, 'error', err?.message || 'KIE video/upscale error', tid, undefined, {
      ...baseTelemetry,
      ...(taskId ? { kieTaskId: taskId } : {}),
    });
    throw err;
  }
}
