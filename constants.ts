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

// Omni 1.1 Flash Constants & Pricing
export const OMNI_MODEL_ID = 'gemini-omni-1.1-flash';
export const OMNI_FIXED_DURATION_SECONDS = 5;
// Official rate (ai.google.dev/gemini-api/docs/pricing): Omni video output is billed at
// $17.50 / 1M tokens, at 5,792 tokens per second of 720p video => ~$0.10 per second.
// 5s @ 720p ≈ $0.50. Google publishes no separate 360p rate, so the draft price stays an estimate.
export const OMNI_PRICING_DRAFT_360P_USD = 0.15; // estimate — 360p draft, no published rate
export const OMNI_PRICING_FINAL_720P_USD = 0.50; // 5s x $0.10/s at 720p

export function getOmniCostUsd(resolution: '360p' | '720p' = '720p'): number {
  return resolution === '360p' ? OMNI_PRICING_DRAFT_360P_USD : OMNI_PRICING_FINAL_720P_USD;
}

// Topaz upscale via Replicate. Billed in units that grow with output megapixels
// (24 MP = 1 unit, 512 MP = 17 units); the prediction reports them as
// metrics.unspecified_billing_metric. Price table: replicate.com/topazlabs/image-upscale (2026-09-14).
// Upscale models on Replicate
export const REAL_ESRGAN_MODEL_ID = 'nightmareai/real-esrgan';
export const REAL_ESRGAN_USD_PER_RUN = 0.002;
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

// Specialized Nursery & Wallpaper Presets for Gemini Omni 1.1 Flash
export const OMNI_PRESETS = {
  omni_wall_dolly: {
    label: "🎥 Архитектурный наезд на стену (Wall Focus)",
    description: "Плавный наезд с сохранением геометрии стены, матовой текстуры Craft Lambda и жесткой фиксацией обоев.",
    prompt: "A smooth, slow, steady architectural camera push-in towards the nursery feature wall. ABSOLUTE PRESERVATION REQUIREMENT: The wallpaper pattern, motifs, colors, and layout from the input image must remain 100% frozen, completely static, and strictly unaltered. The wallpaper features a fine tactile sand-grain matte texture (Craft Lambda). INANIMATE 2D INK LOCK: The artwork is flat 2D printed wallpaper; strictly no biological animation, no duplicate heads, no moving characters, and no morphing. Furniture and floor remain physically locked and static. Warm natural morning sunlight grazes the wall, creating soft ambient shadow occlusion along the baseboards. Flawless 9:16 interior design showcase, continuous unbroken camera motion, no warping."
  },
  omni_texture_macro: {
    label: "🔍 Макро-фактура Craft Lambda (Etsy Texture Proof)",
    description: "Крупный план реальной текстуры: тонкий минеральный песок, матовый флизелин, без бликов и дублирования объектов.",
    prompt: "Cinematic slow-motion macro push-in camera shot, slowly zooming straight into the tactile surface of the wallpaper with zero lateral panning. INANIMATE 2D PRINT LOCK: The wallpaper artwork, animals, and illustrations are strictly flat, 100% static, non-moving ink printed on paper. Absolutely NO biological animation, NO head movement, NO blinking, NO new limbs, NO morphing, and NO duplicate heads or body parts. The printed illustration remains completely frozen and unchanged. REAL MATERIAL TEXTURE: The wallpaper is printed on a heavy-weight luxury non-woven substrate with a distinctive fine-grain sand texture (Craft Lambda Sandstruktur). Completely eliminate plastic reflections, synthetic vinyl sheen, or glare (komplett matt, keine Reflexionen). Soft, diffused warm side lighting highlights the organic matte paper grain and tactile micro-relief. Flawless focus, steady fluid motion, premium Etsy listing video proof."
  },
  omni_sunlight_loop: {
    label: "✨ Живой свет и тени (Pinterest Viral Loop)",
    description: "Зацикленное видео: теплые лучи солнца и тени скользят по текстуре стены 9:16.",
    prompt: "Static architectural camera framing of the stylish children's bedroom feature wall. ZERO MORPHING: The room architecture, furniture, and wallpaper illustration are 100% frozen and geometrically locked. The wallpaper is flat static 2D print: strictly no animation or duplication of characters. Warm afternoon sunlight and subtle dappled leaf shadows drift smoothly across the textured matte wallpaper and floor, emphasizing the authentic fine-sand paper depth. No new motifs or objects appear. Hypnotic, calming ambient lighting movement designed for a seamless, viral Pinterest video loop."
  },
  omni_montessori: {
    label: "👶 Монтессори-ракурс от кроватки (Room Scale & Coziness)",
    description: "Низкий детский ракурс: показывает масштаб обоев в интерьере и уют детской комнаты.",
    prompt: "Smooth low-angle camera arc shot composed from a child's eye-level perspective. The camera gently sweeps past the natural solid wood slatted crib, expanding the spatial view of the room and proving the real-life proportions of the wallpaper mural. STRICT 1:1 WALLPAPER LOCK: The wallpaper design on the wall is an exact static match to the input image, flat 2D printed ink, with zero new elements added, zero duplicate heads, zero animal motion, and zero morphing. Solid wood furniture remains completely stationary. The white balance is strictly adjusted to warm, cozy tones (Gemütlichkeit). Premium editorial nursery showcase, continuous unbroken camera movement."
  }
};

