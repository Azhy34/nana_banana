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

// Omni 1.2 Flash Constants & Pricing (gemini-omni-1.2-flash, GA 2026-11-05; 1.1 is routed to 1.2 on 2026-12-03)
export const OMNI_MODEL_ID = 'gemini-omni-1.2-flash';
export const OMNI_DEFAULT_DURATION_SECONDS = 5;
// Google: any whole second from 3 to 15; without `response_format.duration` the model makes 10 s.
export const OMNI_DURATION_OPTIONS = [3, 5, 8, 10, 15] as const;
export type OmniDurationSeconds = (typeof OMNI_DURATION_OPTIONS)[number];
// Official rate (aistudio.google.com/docs/pricing, 2026-11-08): video output is billed at $12 per 1M tokens,
// at 1,931 / 5,792 / 8,688 tokens per second of 360p / 720p / 1080p video (1080p is upscaled).
// => 360p $0.023/s, 720p $0.07/s, 1080p $0.104/s.
export const OMNI_USD_PER_M_VIDEO_TOKENS = 12;
export const OMNI_TOKENS_PER_SECOND = { '360p': 1931, '720p': 5792, '1080p': 8688 } as const;
export type OmniResolutionKey = keyof typeof OMNI_TOKENS_PER_SECOND;

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

// Specialized Nursery & Wallpaper Presets for Gemini Omni 1.2 Flash.
// Written to Google's Omni prompt guide (aistudio.google.com/docs/omni#prompt-guide):
//  - ONE unbroken shot ("single continuous shot, no scene cuts"): by default Omni cuts several shots into a story;
//  - image-to-video prompts describe the MOTION only, never the room again (the picture is the first frame);
//  - there is no negative-prompt parameter: the bans are plain sentences inside the prompt;
//  - the audio is described, otherwise the model invents a soundtrack.
// The locks below are the ones that fixed real glitches in 2026-10 (flat 2D print, frozen furniture, no duplicated animal heads).
// Kling 2.6 via KIE (kling-2.6/image-to-video: 5s = 63 credits / $0.315, 10s = 126 credits / $0.63, sound=false)
export const KLING_MODEL_ID = 'kling-2.6/image-to-video';
export const KLING_DURATION_OPTIONS = [5, 10] as const;
export function getKlingCostUsd(seconds: number = 5): number {
  return seconds >= 10 ? 0.63 : 0.315;
}

export const OMNI_PROMPT_SINGLE_SHOT = 'In a single continuous shot with no scene cuts.';
export const OMNI_PROMPT_PRINT_LOCK =
  'The mural on the wall is flat printed ink and remains identical to the first frame: every painted motif, colour and line stays completely still. Furniture, floor and architecture stay fixed in place.';
export const OMNI_PROMPT_AUDIO = 'No dialogue, no music, only a faint natural room ambience.';

/**
 * Strips Omni-specific wrapper phrases ("In a single continuous shot...", "No dialogue...")
 * when the user switches to Kling 2.6, because Kling takes `sound: false` as an API field
 * and performs better with pure positive motion + freeze sentences (specs/video_motion.json).
 */
export function toKlingPrompt(omniPrompt: string): string {
  return omniPrompt
    .replace(OMNI_PROMPT_SINGLE_SHOT, '')
    .replace(OMNI_PROMPT_AUDIO, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const OMNI_PRESETS = {
  omni_wall_dolly: {
    label: "🎥 Вход со смещением (Forward Drift) · проверен",
    description: "Камера плавно идёт вперёд и на пару сантиметров вправо, в луче солнца плывёт пыль. Проверено на Omni 1.2.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera moves smoothly forward and drifts a few centimetres to the right at a calm pace, so nearer objects shift slightly more than farther ones. Fine dust drifts slowly through the warm sunbeam on the floor. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_locked_light: {
    label: "✨ Живой свет, камера стоит (Light Only) · топ-безопасно",
    description: "Камера полностью неподвижна, по полу и краю стены мягко качаются тени ветвей и скользит солнечный свет. Минимум риска для обоев.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera stays completely still as a fixed, static shot. Warm morning sunlight and soft dappled shadows of leafy branches sway gently across the floor and rug, with subtle dust motes in the sunbeam. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_locked_person: {
    label: "👶 Человек со спины, камера стоит (Human Hook) · для Reels",
    description: "Камера стоит неподвижно, ребёнок/мама со спины делает одно спокойное действие (играет на ковре или закрывает дверь).",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera stays completely still as a fixed, static shot. The person seen from behind performs one calm, slow natural movement while keeping their head turned away from the camera, with only the back of their head and clothes visible. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_walk_in: {
    label: "🚶 Вход в комнату шагом (Walk-In) · параллакс",
    description: "Камера входит в комнату спокойным шагом от первого лица, ближние предметы смещаются сильнее дальних. Проверено на Kling 2.6.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera advances straight forward into the room at a clearly visible calm walking pace, as if a person is entering, giving a natural depth parallax between foreground objects and the wall. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_pull_back: {
    label: "↩ Отъезд-раскрытие (Pull-Back Reveal) · тест",
    description: "Камера плавно отъезжает примерно на 10%, открывая чуть больше комнаты и масштаб панно. Проверять края глазом.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera slowly pulls back by about 10 percent at a constant calm speed, revealing a little more of the room while keeping the whole mural wall in the frame. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_texture_macro: {
    label: "🔍 Фактура крупно (Texture Light) · только для макро-кадра",
    description: "Только для КРУПНОГО кадра обоев: камера стоит, боковой свет скользит по матовой зернистой поверхности Craft Lambda.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera stays completely still as a fixed, static shot. Soft warm side light skims gently across the matte fine-grain paper surface, revealing its tactile micro-relief without glare. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_sunlight_loop: {
    label: "☀ Лучи и тени на полу (Sunlight Loop)",
    description: "Лёгкое дыхание утреннего света и теней на ковре и полу для зацикленного Pinterest-пина.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera stays completely still as a fixed, static shot. Warm afternoon sunlight and soft dappled leaf shadows glide smoothly across the floor and rug. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_montessori: {
    label: "🛏 От кроватки (Room Scale)",
    description: "Спокойный вход в комнату с акцентом на масштаб мебели у стены.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera moves steadily straight forward at a calm pace, keeping the foreground furniture solid and grounded. Warm cozy morning sunlight rests along the floor. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  }
};

