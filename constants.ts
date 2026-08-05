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

export const VEO_NEGATIVE_PROMPT =
  "peeling wallpaper, wallpaper peeling off wall, unrolling paper, corner curl, wallpaper sheet bending, page curl, paper peeling, peeling corner, curling wallpaper, wallpaper tearing, paper lift, lifting corner, peeling paper, paper detachment, page turn, page flip, paper sweep, book page flip, page curl, paper page turning, opening transition, wipe transition, intro transition effect, transition wipe, fade-in, storybook page turn, morphing wallpaper pattern, drawing new elements on the wall, new moons appearing, doubling moon, shifting moon, morphing arches, changing wallpaper motifs, animating the wallpaper design, moving wall prints, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark, bad quality, blurry, beam crossing the frame, ceiling beam blocking the view, wooden beam passing in front of camera, pillar or column blocking the shot, foreground object flying past the camera, obstruction entering the frame, silhouette sweeping across the frame, camera passing through objects, unexpected foreground element, parallax object crossing the shot, toy swinging, hanging toy moving, mobile spinning, mobile toy swaying, crib mobile moving, stuffed toy moving, dangling object swinging, curtains appearing, curtains materializing, new curtains, drapes appearing, new drapery, fabric appearing from nowhere, hanging decoration swinging";

export const VEO_PRESETS = {
  dolly_in: {
    label: "Медленный наезд камеры (Dolly-In)",
    prompt: "A smooth, slow cinematic camera push-in, gently panning horizontally across the room. The room interior and wallpaper remain completely static. Clean 9:16 interior product showcase with subtle natural shadow movement."
  },
  ambient: {
    label: "Легкое оживление / Живое фото (Ambient)",
    prompt: "A static camera shot with an ultra-slow horizontal drift. The product and room remain completely still. Subtle, natural shift of daylight and soft ambient shadows across the scene."
  },
  dolly_out: {
    label: "Плавный отъезд камеры (Dolly-Out)",
    prompt: "A smooth, slow cinematic camera pull-back, expanding the view of the room and feature wall. The entire room and product remain perfectly static and sharp."
  }
};

