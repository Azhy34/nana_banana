import { AspectRatio, ImageSize, ModelType } from './types';

// Pricing from Google AI Studio (ai.google.dev/pricing)
// inputPer1M — price per 1M input tokens when generating images
// outputPerImage — flat price per output image
export const MODEL_PRICING: Record<ModelType, { inputPer1M: number; outputPerImage: number }> = {
  [ModelType.Pro]:     { inputPer1M: 2.00, outputPerImage: 0.134  },
  [ModelType.Flash31]: { inputPer1M: 0.50, outputPerImage: 0.0672 },
  [ModelType.QwenImage2]: { inputPer1M: 0, outputPerImage: 0.035 },
  [ModelType.ABTest]:  { inputPer1M: 0,    outputPerImage: 0 },
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
export const OMNI_PROMPT_SINGLE_SHOT = 'In a single continuous shot with no scene cuts.';
export const OMNI_PROMPT_PRINT_LOCK =
  'The wallpaper artwork is flat printed ink and stays exactly as in the image: nothing on it moves, blinks, turns or changes, and no animal or figure on it is animated, duplicated or redrawn. Furniture, floor and architecture stay still and undistorted.';
export const OMNI_PROMPT_AUDIO = 'No dialogue, no music, only a faint natural room ambience.';

export const OMNI_PRESETS = {
  omni_wall_dolly: {
    label: "🎥 Архитектурный наезд на стену (Wall Focus)",
    description: "Плавный наезд с сохранением геометрии стены и жесткой фиксацией обоев.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera pushes in slowly and steadily along a straight line toward the feature wall, with no rotation and no sideways drift. Warm morning sunlight stays constant and soft shadows rest along the baseboards. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_texture_macro: {
    label: "🔍 Макро-фактура Craft Lambda (Etsy Texture Proof)",
    description: "Крупный план реальной текстуры: матовая зернистая поверхность без бликов и дублирования объектов.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera pushes in very slowly and straight toward the wallpaper surface until it is close to macro distance, with no sideways motion. Soft warm side light skims across the matte fine-grain surface and reveals its tactile relief, with no glare and no plastic sheen. The printed illustration is flat static ink: nothing on it moves, blinks, turns or duplicates, and no head, limb or object appears or disappears. ${OMNI_PROMPT_AUDIO}`
  },
  omni_sunlight_loop: {
    label: "✨ Живой свет и тени (Pinterest Viral Loop)",
    description: "Едва заметный дрейф камеры: теплые лучи солнца и тени листьев скользят по стене 9:16, клип можно зациклить.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} The camera drifts very slowly forward and slightly sideways. Warm afternoon sunlight and soft dappled leaf shadows glide smoothly across the wall and floor, and the clip ends close to where it began so it loops. Nothing new appears in the room. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  },
  omni_montessori: {
    label: "👶 Монтессори-ракурс от кроватки (Room Scale & Coziness)",
    description: "Низкий детский ракурс: показывает масштаб обоев в интерьере и уют детской комнаты.",
    prompt: `${OMNI_PROMPT_SINGLE_SHOT} Low-angle shot at a child's eye height: the camera moves steadily straight forward toward the feature wall, keeping the crib in the foreground, with no rotation, no arc and no sweep. Warm cozy morning sunlight with soft natural shadows. The crib bars stay straight and solid, with no part bending or disappearing. ${OMNI_PROMPT_PRINT_LOCK} ${OMNI_PROMPT_AUDIO}`
  }
};

