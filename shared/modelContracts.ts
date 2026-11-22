import { z } from 'zod';

/**
 * Single source of truth for AI model capabilities, prompt rules, and Zod request contracts.
 * KIE model constraints mirror the live OpenAPI snapshots in `api_truth/kie/*.schema.json`.
 */

export type ModelProviderKind = 'gemini' | 'openrouter' | 'kie' | 'replicate';
export type ModelMediaKind = 'image' | 'video';
export type NegativePromptMode = 'inline_avoid' | 'positive_only' | 'field';
export type PromptStyleMode = 'full' | 'brief';

export interface ModelCapability {
  id: string;
  label: string;
  provider: ModelProviderKind;
  kind: ModelMediaKind;
  aspectRatios: readonly string[];
  resolutions: readonly string[];
  maxRefs: number;
  refField?: string;
  maxPromptChars: number;
  negativePromptMode: NegativePromptMode;
  recommendedPromptMode: PromptStyleMode;
  supportsTextureRef: boolean;
  /** Approximate cost in USD per 2K image or 5s clip (for pre-run budget estimates). */
  costUsd2K: number;
  /** KIE credit cost per 2K image or 5s clip, when billed via KIE. */
  kieCredits2K?: number;
  /** Optional ratio/resolution exclusions from the provider schema (e.g. gpt-image-2 at 2K). */
  unsupportedAt2K?: readonly string[];
  notes: string;
}

export const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
  'google/gemini-3.1-flash-image': {
    id: 'google/gemini-3.1-flash-image',
    label: 'Gemini 3.1 Flash Image',
    provider: 'gemini',
    kind: 'image',
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    resolutions: ['512', '1K', '2K', '4K'],
    maxRefs: 5,
    maxPromptChars: 20000,
    negativePromptMode: 'inline_avoid',
    recommendedPromptMode: 'full',
    supportsTextureRef: true,
    costUsd2K: 0.0672,
    notes: 'Fast & versatile; supports both full and brief prompts.',
  },
  'google/gemini-3-pro-image': {
    id: 'google/gemini-3-pro-image',
    label: 'Gemini 3 Pro Image',
    provider: 'gemini',
    kind: 'image',
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
    resolutions: ['1K', '2K', '4K'],
    maxRefs: 5,
    maxPromptChars: 20000,
    negativePromptMode: 'inline_avoid',
    recommendedPromptMode: 'full',
    supportsTextureRef: true,
    costUsd2K: 0.134,
    notes: 'Highest detail for 2K/4K and Refine.',
  },
  'qwen/qwen-image-2': {
    id: 'qwen/qwen-image-2',
    label: 'Qwen Image 2 (Replicate)',
    provider: 'replicate',
    kind: 'image',
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'],
    resolutions: ['1K', '2K'],
    maxRefs: 1,
    maxPromptChars: 8000,
    negativePromptMode: 'positive_only',
    recommendedPromptMode: 'brief',
    supportsTextureRef: false,
    costUsd2K: 0.035,
    notes: 'Single reference only; prefers concise positive prompts.',
  },
  'nano-banana-2-1': {
    id: 'nano-banana-2-1',
    label: 'Nano Banana 2.1 (KIE)',
    provider: 'kie',
    kind: 'image',
    aspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'],
    resolutions: ['1K', '2K', '4K'],
    maxRefs: 10,
    refField: 'image_input',
    maxPromptChars: 20000,
    negativePromptMode: 'positive_only',
    recommendedPromptMode: 'brief',
    supportsTextureRef: true,
    costUsd2K: 0.03,
    kieCredits2K: 6,
    notes: 'KIE default: 6 credits ($0.03) at 2K, supports 4:5 and 3:4 natively.',
  },
  'gpt-image-2-image-to-image': {
    id: 'gpt-image-2-image-to-image',
    label: 'GPT Image 2 (KIE)',
    provider: 'kie',
    kind: 'image',
    aspectRatios: ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9'],
    resolutions: ['1K', '2K', '4K'],
    maxRefs: 16,
    refField: 'input_urls',
    maxPromptChars: 20000,
    negativePromptMode: 'positive_only',
    recommendedPromptMode: 'brief',
    supportsTextureRef: true,
    costUsd2K: 0.05,
    kieCredits2K: 10,
    unsupportedAt2K: ['4:5', '5:4', '3:1', '1:3', '9:21'],
    notes: 'Strong photorealism; 2K on KIE does not support 4:5 or 5:4 (use 3:4 or 4K).',
  },
  'grok-imagine-image-2-0/image-edit': {
    id: 'grok-imagine-image-2-0/image-edit',
    label: 'Grok Imagine 2.0 Edit (KIE)',
    provider: 'kie',
    kind: 'image',
    aspectRatios: ['1:1', '2:3', '3:2', '16:9', '9:16', 'auto'],
    resolutions: [],
    maxRefs: 5,
    refField: 'image_urls',
    maxPromptChars: 8000,
    negativePromptMode: 'positive_only',
    recommendedPromptMode: 'brief',
    supportsTextureRef: true,
    costUsd2K: 0.04,
    notes: 'No resolution parameter; 4:5 and 3:4 are not supported.',
  },
  'gemini-omni-1.2-flash': {
    id: 'gemini-omni-1.2-flash',
    label: 'Gemini Omni 1.2 Flash',
    provider: 'gemini',
    kind: 'video',
    aspectRatios: ['9:16', '4:5', '3:4', '16:9'],
    resolutions: ['360p', '720p', '1080p'],
    maxRefs: 1,
    maxPromptChars: 4000,
    negativePromptMode: 'positive_only',
    recommendedPromptMode: 'brief',
    supportsTextureRef: false,
    costUsd2K: 0.35,
    notes: 'Default 5s 720p clip (~$0.35). Positive single-shot motion instructions.',
  },
  'veo-3.1-fast-generate-preview': {
    id: 'veo-3.1-fast-generate-preview',
    label: 'Veo 3.1 Fast',
    provider: 'gemini',
    kind: 'video',
    aspectRatios: ['9:16'],
    resolutions: ['720p'],
    maxRefs: 1,
    maxPromptChars: 4000,
    negativePromptMode: 'field',
    recommendedPromptMode: 'brief',
    supportsTextureRef: false,
    costUsd2K: 0.60,
    notes: 'Fixed 6s 9:16 clip ($0.60). Accepts separate negativePrompt.',
  },
  'kling-2.6/image-to-video': {
    id: 'kling-2.6/image-to-video',
    label: 'Kling 2.6 (KIE)',
    provider: 'kie',
    kind: 'video',
    aspectRatios: ['9:16', '4:5', '3:4', '1:1', '4:3', '16:9'],
    resolutions: ['720p'],
    maxRefs: 1,
    refField: 'image_urls',
    maxPromptChars: 2500,
    negativePromptMode: 'positive_only',
    recommendedPromptMode: 'brief',
    supportsTextureRef: false,
    costUsd2K: 0.315,
    kieCredits2K: 63,
    notes: '5s or 10s clip (63 credits / 5s). Strictly max 2500 chars; best for locked-camera person motion.',
  },
};

export const kling26InputSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty').max(2500, 'Kling 2.6 prompt max length is 2500 characters'),
  image_urls: z.array(z.string().url('Frame URL must be a valid URI')).length(1, 'Kling 2.6 requires exactly 1 reference frame URL'),
  sound: z.boolean(),
  duration: z.enum(['5', '10']),
});

export type Kling26Input = z.infer<typeof kling26InputSchema>;

export const modelInputValidationSchema = z.object({
  modelId: z.string().min(1),
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  refCount: z.number().int().min(0).default(0),
});

export interface ModelValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  capability?: ModelCapability;
}

export function getModelCapability(modelId: string): ModelCapability | undefined {
  return MODEL_CAPABILITIES[modelId];
}

export function isKieModelId(modelId: string): boolean {
  return getModelCapability(modelId)?.provider === 'kie';
}

/** Active image models exposed in Generator and Batch UI (legacy Qwen excluded). */
export function getUiImageModels(): ModelCapability[] {
  return Object.values(MODEL_CAPABILITIES).filter(
    m => m.kind === 'image' && m.id !== 'qwen/qwen-image-2',
  );
}

export function validateModelInput(input: z.infer<typeof modelInputValidationSchema>): ModelValidationResult {
  const parsed = modelInputValidationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(i => i.message),
      warnings: [],
    };
  }
  const { modelId, prompt, aspectRatio, resolution, refCount } = parsed.data;
  const cap = getModelCapability(modelId);
  if (!cap) {
    return { ok: true, errors: [], warnings: [`Unknown model '${modelId}' — schema checks skipped.`] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (prompt.length > cap.maxPromptChars) {
    errors.push(`Prompt length ${prompt.length} exceeds ${cap.label} limit (${cap.maxPromptChars} chars).`);
  }
  if (aspectRatio && cap.aspectRatios.length > 0 && !cap.aspectRatios.includes(aspectRatio)) {
    errors.push(`Aspect ratio '${aspectRatio}' is not supported by ${cap.label} (${cap.aspectRatios.join(', ')}).`);
  }
  if (resolution && cap.resolutions.length > 0 && !cap.resolutions.includes(resolution)) {
    errors.push(`Resolution '${resolution}' is not supported by ${cap.label} (${cap.resolutions.join(', ')}).`);
  }
  if (
    resolution === '2K' &&
    aspectRatio &&
    cap.unsupportedAt2K?.includes(aspectRatio)
  ) {
    errors.push(`${cap.label} does not support '${aspectRatio}' at 2K resolution.`);
  }
  if (refCount > cap.maxRefs) {
    errors.push(`Too many reference images (${refCount} > max ${cap.maxRefs} for ${cap.label}).`);
  }
  if (cap.negativePromptMode === 'positive_only' && prompt.includes(' Avoid:')) {
    warnings.push(`${cap.label} works best in 'brief' mode without an 'Avoid:' tail.`);
  }

  return { ok: errors.length === 0, errors, warnings, capability: cap };
}
