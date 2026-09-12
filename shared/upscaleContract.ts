/**
 * Single source of truth for the Topaz upscale contract.
 *
 * The enums below mirror the LIVE input schema of the official Replicate model
 * `topazlabs/image-upscale` (latest_version 2fdc3b86a01d338ae89ad58e5d9241398a8a01de9b0dda41ba8a0434c8a00dc3),
 * verified 2026-09-12 via `GET /v1/models/topazlabs/image-upscale`.
 *
 * Both the browser service and the serverless route import from here, so the UI
 * cannot offer an option the API does not accept.
 *
 * NOTE: package.json sets "type": "module", so the /api routes run as real ESM
 * on Vercel and MUST import this file with an explicit '.js' extension. `vercel
 * dev` resolves it without one, so dropping the extension fails only in
 * production, with ERR_MODULE_NOT_FOUND at runtime and a green build.
 */
import { z } from 'zod';

/**
 * Replicate also accepts 'None' here, but that means "do not upscale" — it has
 * no place in an upscaler UI, so we deliberately do not expose it.
 * There is NO '3x': anything between 2x and 4x is not a valid factor.
 */
export const UPSCALE_FACTORS = ['2x', '4x', '6x'] as const;
export const ENHANCE_MODELS = [
  'Standard V2',
  'Low Resolution V2',
  'CGI',
  'High Fidelity V2',
  'Text Refine',
] as const;
export const OUTPUT_FORMATS = ['jpg', 'png'] as const;
export const SUBJECT_DETECTIONS = ['None', 'All', 'Foreground', 'Background'] as const;

export type UpscaleFactor = (typeof UPSCALE_FACTORS)[number];
export type TopazEnhanceModel = (typeof ENHANCE_MODELS)[number];
export type UpscaleOutputFormat = (typeof OUTPUT_FORMATS)[number];
export type SubjectDetection = (typeof SUBJECT_DETECTIONS)[number];

/** Body accepted by POST /api/upscale. */
export const upscaleRequestSchema = z.object({
  image: z
    .string()
    .min(1, 'image is required')
    .refine(
      (value) => /^https?:\/\//i.test(value) || value.startsWith('data:'),
      'image must be an http(s) URL or a data: URL'
    ),
  upscaleFactor: z.enum(UPSCALE_FACTORS).default('4x'),
  enhanceModel: z.enum(ENHANCE_MODELS).default('High Fidelity V2'),
  faceEnhance: z.boolean().default(false),
  outputFormat: z.enum(OUTPUT_FORMATS).default('png'),
  subjectDetection: z.enum(SUBJECT_DETECTIONS).default('All'),
});

export type UpscaleRequest = z.infer<typeof upscaleRequestSchema>;

/** Maps our camelCase request onto the snake_case input Replicate expects. */
export const toReplicateInput = (request: UpscaleRequest) => ({
  image: request.image,
  upscale_factor: request.upscaleFactor,
  enhance_model: request.enhanceModel,
  output_format: request.outputFormat,
  face_enhancement: request.faceEnhance,
  subject_detection: request.subjectDetection,
});

/** Flattens zod issues into "field: message" lines for a 400 response. */
export const formatIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

/**
 * Reads an error body without ever throwing.
 *
 * Replicate returns JSON (`{detail}` on 4xx), but a failing edge/proxy can return
 * HTML or an empty body — calling `.json()` on that throws and masks the real
 * status code with a parser error.
 */
export const readErrorBody = async (response: Response, fallback: string): Promise<string> => {
  let raw = '';
  try {
    raw = await response.text();
  } catch {
    return `${fallback} (HTTP ${response.status}, body unreadable)`;
  }

  if (!raw.trim()) return `${fallback} (HTTP ${response.status}, empty body)`;

  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.detail || parsed?.error || parsed?.title || parsed?.message;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // Not JSON — fall through and surface the raw text instead.
  }

  return `${fallback} (HTTP ${response.status}): ${raw.slice(0, 300)}`;
};

/**
 * What Replicate sends back for a prediction.
 *
 * Only the fields we actually consume are described. Validation here is a GATE,
 * not a transform: `parsePrediction` returns the original object untouched, so
 * extra fields (urls, created_at, logs, ...) survive and still reach the client.
 */
export const predictionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['starting', 'processing', 'succeeded', 'canceled', 'failed']),
  output: z.union([z.string(), z.array(z.string())]).nullish(),
  error: z.unknown().nullish(),
  metrics: z.object({ predict_time: z.number().optional() }).nullish(),
});

export type Prediction = z.infer<typeof predictionSchema>;

/**
 * Validates a Replicate response and hands back the ORIGINAL object.
 *
 * Without this the code did `await response.json() as ReplicatePrediction` — a
 * compile-time cast that checks nothing at runtime. A changed response shape
 * would surface as a confusing failure somewhere downstream instead of here.
 */
export const parsePrediction = <T>(raw: T): T & Prediction => {
  const parsed = predictionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Unexpected response from Replicate — ${formatIssues(parsed.error).join('; ')}`
    );
  }
  return raw as T & Prediction;
};

/** Replicate's `error` is usually a string but not contractually so. */
export const predictionErrorText = (prediction: Prediction, fallback: string): string => {
  const { error } = prediction;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') return JSON.stringify(error).slice(0, 300);
  return fallback;
};
