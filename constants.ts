import { AspectRatio, ImageSize, ModelType } from './types';

// Pricing from Google AI Studio (ai.google.dev/pricing)
// inputPer1M — price per 1M input tokens when generating images
// outputPerImage — flat price per output image
export const MODEL_PRICING: Record<ModelType, { inputPer1M: number; outputPerImage: number }> = {
  [ModelType.Pro]:          { inputPer1M: 2.00, outputPerImage: 0.134  },
  [ModelType.Flash31]:      { inputPer1M: 0.50, outputPerImage: 0.0672 },
  [ModelType.NanoBanana21]: { inputPer1M: 0,    outputPerImage: 0.03   },
  [ModelType.GptImage2]:    { inputPer1M: 0,    outputPerImage: 0.05   },
  [ModelType.GrokImagine]:  { inputPer1M: 0,    outputPerImage: 0.04   },
  [ModelType.QwenImage2]:   { inputPer1M: 0,    outputPerImage: 0.035  },
  [ModelType.ABTest]:       { inputPer1M: 0,    outputPerImage: 0      },
};

export const ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const QWEN_ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'];
export const IMAGE_SIZES_FLASH31: ImageSize[] = ['512', '1K', '2K', '4K'];
export const IMAGE_SIZES: ImageSize[] = ['1K', '2K', '4K'];

export const MODEL_OPTIONS = [
  { value: ModelType.Flash31, label: 'Gemini 3.1 Flash Image (Fast & Cheap)' },
  { value: ModelType.Pro, label: 'Gemini 3 Pro Image (High Quality, 4K)' },
  { value: ModelType.QwenImage2, label: 'Qwen Image 2 (Replicate)' },
];

// Veo Video Generation Constants
export const VEO_MODEL_ID = 'veo-3.1-fast-generate-preview';
export const VEO_FIXED_DURATION_SECONDS = 6;
export const VEO_FIXED_ASPECT_RATIO = '9:16';
export const VEO_PERSON_GENERATION = 'allow_adult';

export const VEO_MODEL_OPTIONS = [
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
];

export const VEO_PRICING_PER_SECOND_USD = 0.10; // Video + Audio rate

export function getVeoCostUsd(durationSeconds: number): number {
  return durationSeconds * VEO_PRICING_PER_SECOND_USD;
}

// Etsy listing video requirements (help.etsy.com — "How to Add Listing Videos")
// Etsy rejects anything below the minimum with:
// "Die Auflösung deines Videos ist N Pixel mal M Pixel. Sie muss mindestens 500 Pixel mal 500 Pixel betragen"
export const ETSY_MIN_VIDEO_SIDE_PX = 500;          // hard reject below this
export const ETSY_RECOMMENDED_VIDEO_SIDE_PX = 1080; // Etsy's recommended quality

// Batch Generator: how many listing photos one run makes. 3 is a quick test set: one photo per format (9:16, 2:3, 4:3).
export const BATCH_COUNT_OPTIONS = [3, 6, 9, 12, 15] as const;

// Omni 1.2 Flash Constants & Pricing (gemini-omni-1.2-flash, GA 2026-11-05; 1.1 is routed to 1.2 on 2026-12-03)
export const OMNI_MODEL_ID = 'gemini-omni-1.2-flash';
export const OMNI_DEFAULT_DURATION_SECONDS = 5;
export const OMNI_DURATION_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10, 15] as const;
export const OMNI_USD_PER_M_VIDEO_TOKENS = 12;
export const OMNI_TOKENS_PER_SECOND = { '720p': 5792, '1080p': 8688 } as const;
export type OmniResolutionKey = keyof typeof OMNI_TOKENS_PER_SECOND;

// Kling 2.6 via KIE (kling-2.6/image-to-video: 5s = 63 credits / $0.315, sound=false)
export const KLING_MODEL_ID = 'kling-2.6/image-to-video';
export const KLING_DURATION_OPTIONS = [5, 10] as const;
export function getKlingCostUsd(seconds: number = 5): number {
  return seconds >= 10 ? 0.63 : 0.315;
}

// Kling 3.0 via KIE (kling-3.0/video: std 720p = 15.1 cr/s ($0.0755/s), pro 1080p = 20.2 cr/s ($0.101/s), sound=false)
export const KLING3_MODEL_ID = 'kling-3.0/video';
export type Kling3Mode = 'std' | 'pro';
export function getKling3Credits(seconds: number = 5, mode: Kling3Mode = 'std'): number {
  const perSec = mode === 'pro' ? 20.2 : 15.1;
  return Number((perSec * seconds).toFixed(1));
}
export function getKling3CostUsd(seconds: number = 5, mode: Kling3Mode = 'std'): number {
  return Number((getKling3Credits(seconds, mode) * 0.005).toFixed(4));
}
export function getOmniCostUsd(
  resolution: OmniResolutionKey = '720p',
  seconds: number = OMNI_DEFAULT_DURATION_SECONDS,
): number {
  return (OMNI_TOKENS_PER_SECOND[resolution] * seconds * OMNI_USD_PER_M_VIDEO_TOKENS) / 1_000_000;
}

// Google: "for videos larger than 4MB (>720p) use delivery=\"uri\" to avoid payload size limits".
// 1080p and long clips are fetched through the Files API instead of inline base64.
export function omniNeedsUriDelivery(resolution: OmniResolutionKey, seconds: number): boolean {
  return resolution === '1080p' || seconds > 10;
}

// Topaz upscale via Replicate. Billed in units that grow with output megapixels
// (24 MP = 1 unit, 512 MP = 17 units); the prediction reports them as
// metrics.unspecified_billing_metric. Price table: replicate.com/topazlabs/image-upscale (2026-09-14).
// Upscale models on Replicate
export const REAL_ESRGAN_MODEL_ID = 'nightmareai/real-esrgan';
export const REAL_ESRGAN_USD_PER_RUN = 0.002;
export const REAL_ESRGAN_MAX_PIXELS = 1448 * 1448; // 2,096,704 px (~2.1 MP) — hardware VRAM limit of nightmareai/real-esrgan
export const TOPAZ_UPSCALE_MODEL_ID = 'topazlabs/image-upscale';
export const TOPAZ_USD_PER_BILLING_UNIT = 0.048;

export const VEO_NEGATIVE_PROMPT =
  "peeling wallpaper, wallpaper peeling off wall, unrolling paper, corner curl, wallpaper sheet bending, page curl, paper peeling, peeling corner, curling wallpaper, wallpaper tearing, paper lift, lifting corner, peeling paper, paper detachment, page turn, page flip, paper sweep, book page flip, page curl, paper page turning, opening transition, wipe transition, intro transition effect, transition wipe, fade-in, storybook page turn, morphing wallpaper pattern, drawing new elements on the wall, new moons appearing, doubling moon, shifting moon, morphing arches, changing wallpaper motifs, animating the wallpaper design, moving wall prints, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark, bad quality, blurry, beam crossing the frame, ceiling beam blocking the view, wooden beam passing in front of camera, pillar or column blocking the shot, foreground object flying past the camera, obstruction entering the frame, silhouette sweeping across the frame, camera passing through objects, unexpected foreground element, parallax object crossing the shot, toy swinging, hanging toy moving, mobile spinning, mobile toy swaying, crib mobile moving, stuffed toy moving, dangling object swinging, curtains appearing, curtains materializing, new curtains, drapes appearing, new drapery, fabric appearing from nowhere, hanging decoration swinging";

export const VEO_PRESETS = {
  dolly_in: {
    label: "Медленный наезд камеры (Dolly-In)",
    prompt: "A smooth, slow cinematic camera push-in, gently panning horizontally across the room. The room interior and wallpaper remain completely static. Clean 9:16 interior product showcase with subtle natural shadow movement."
  },
  ambient: {
    label: "Легкое оживление / Живое фото (Ambient)",
    prompt: "A subtle, ultra-slow cinematic camera pan across a perfectly frozen, static interior room. Zero morphing, zero artifacts, zero moving furniture or objects. Only a delicate, realistic natural sunlight sweep and soft ambient shadow play grazing across the wall and floor. High-end e-commerce product video showcase."
  },
  dolly_out: {
    label: "Плавный отъезд камеры (Dolly-Out)",
    prompt: "A smooth, slow cinematic camera pull-back, expanding the view of the room and feature wall. The entire room and product remain perfectly static and sharp."
  }
};

export const OMNI_PROMPT_FIRST_FRAME = 'Use the attached image as the very first frame of the video.';
export const OMNI_PROMPT_SINGLE_SHOT = 'In a single continuous shot with no scene cuts.';
export const OMNI_PROMPT_FREEZE =
  'The mural on the wall stays perfectly still and unchanged: its drawing, its colours and every painted detail remain exactly as in the first frame. Everything else in the frame keeps its shape and its place.';
export const OMNI_PROMPT_AUDIO = 'The sound is a quiet room tone, with no dialogue and no music.';
/** The sentences added to every Omni request (shown read-only under the prompt field). */
export const OMNI_PROMPT_BASE = [OMNI_PROMPT_FIRST_FRAME, OMNI_PROMPT_SINGLE_SHOT, OMNI_PROMPT_FREEZE, OMNI_PROMPT_AUDIO] as const;

/** The text really sent to Omni: opening + the motion from the form + freeze + sound. A base sentence already typed by the user is not repeated. */
export function composeOmniPrompt(motion: string): string {
  let text = motion.trim();
  if (text && !/[.!?…]$/.test(text)) text += '.';
  const missing = (sentence: string) => (text.includes(sentence) ? [] : [sentence]);
  return [...missing(OMNI_PROMPT_FIRST_FRAME), ...missing(OMNI_PROMPT_SINGLE_SHOT), text, ...missing(OMNI_PROMPT_FREEZE), ...missing(OMNI_PROMPT_AUDIO)]
    .filter(Boolean)
    .join(' ');
}

/** Kling-specific wall lock: freezes ONLY the printed wallpaper mural so light, shadows, curtains and people can move freely. */
export const KLING_WALL_FREEZE =
  'The wallpaper mural on the wall stays completely still and unchanged: its illustration, colours and proportions remain identical to the first frame.';

/** For Kling 2.6: wraps the motion with the positive wallpaper freeze (without freezing the rest of the room). */
export function composeKlingPrompt(motion: string): string {
  let text = motion.trim();
  if (text && !/[.!?…]$/.test(text)) text += '.';
  return text.includes(KLING_WALL_FREEZE) ? text : `${text} ${KLING_WALL_FREEZE}`.trim();
}

export const OMNI_PRESETS = {
  omni_forward_drift: {
    label: "🎥 Вход со смещением (Forward Drift)",
    description: "Камера идёт вперёд и на несколько сантиметров вправо, в луче солнца плывёт пыль. Единственный рецепт, давший чистый клип на Omni 1.2 (Листинг 11, через KIE, 10.11). Лучше для кадра с солнечным светом.",
    status: 'ok',
    prompt: 'The camera moves forward and drifts a few centimetres to the right at a calm pace, so the nearer objects shift more than the farther ones. Fine dust drifts slowly through the sunbeam and the warm sunlight patches on the floor shift gently.'
  },
  omni_walk_in: {
    label: "🚶 Вход в комнату шагом (Walk-In)",
    description: "Камера входит в комнату спокойным шагом, ближние предметы смещаются сильнее дальних. Проверено на Kling 2.6, на Omni 1.2 ещё нет.",
    status: 'test',
    prompt: 'The camera advances straight forward into the room at a clearly visible calm walking pace, as if a person is entering, and the nearer objects shift more than the farther ones, giving a natural depth parallax.'
  },
  omni_light_only: {
    label: "✨ Живой свет, камера стоит (Light Only)",
    description: "Камера неподвижна: по полу и комнате плывёт тёплый солнечный свет с тенями листвы, слегка шевелится штора у окна и летит пыль в луче.",
    status: 'test',
    prompt: 'Locked static camera, no camera movement. Warm golden sunlight from the window visibly brightens and sweeps across the floor, rug and lower room while distinct dappled shadows of leafy branches sway clearly in a gentle breeze. Fine dust motes drift visibly through the sunbeam and sheer window fabric stirs softly.'
  },
  omni_locked_person: {
    label: "👶 Человек со спины, камера стоит (Human Hook)",
    description: "Камера неподвижна, ребёнок или мама со спины делает заметное спокойное действие (играет на ковре или поправляет одеяло). Виральный хук для Reels/TikTok.",
    status: 'test',
    prompt: 'Locked static camera, no camera movement. The person seen from behind performs a clear calm natural movement, leaning gently toward the floor rug or bedding while keeping their head turned toward the room and away from the lens, with only the back of their head and clothes visible.'
  },
  omni_pull_back: {
    label: "↩ Отъезд-раскрытие (Pull-Back Reveal)",
    description: "Камера плавно отъезжает примерно на 10% и открывает чуть больше комнаты. Края кадра модель дорисовывает сама: проверьте клип глазами.",
    status: 'test',
    prompt: 'The camera pulls back steadily by about 10 percent at a calm constant speed, smoothly expanding the view of the room while keeping the entire mural wall centered and intact in the frame.'
  },
  omni_texture_light: {
    label: "🔍 Фактура крупно (Texture Light)",
    description: "Только для КРУПНОГО кадра обоев: камера стоит, яркий косой свет заметно скользит по матовому песчаному рельефу, проявляя фактуру.",
    status: 'test',
    prompt: 'Locked static camera, no camera movement. Clearly visible warm raking side light sweeps steadily across the matte fine-grain surface, bringing out the tactile sand-grain paper relief and soft micro-shadows while fine dust drifts in the air.'
  }
} as const satisfies Record<string, { label: string; description: string; status: 'ok' | 'test'; prompt: string }>;
export type OmniPresetKey = keyof typeof OMNI_PRESETS;
export const OMNI_DEFAULT_PRESET: OmniPresetKey = 'omni_forward_drift';

