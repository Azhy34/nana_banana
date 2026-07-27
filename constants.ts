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
  { value: ModelType.Flash31, label: 'Gemini 3.1 Flash (New, Fast)' },
  { value: ModelType.Pro, label: 'Gemini 3 Pro (High Quality, 4K)' },
  { value: ModelType.QwenImage2, label: 'Qwen Image 2 (Replicate)' },
];

// Veo Video Generation Constants
export const VEO_MODEL_ID = 'veo-3.1-fast-generate-preview';
export const VEO_FIXED_DURATION_SECONDS = 6;
export const VEO_FIXED_ASPECT_RATIO = '9:16';
export const VEO_PERSON_GENERATION = 'allow_adult';

export const VEO_MODEL_OPTIONS = [
  { value: VEO_MODEL_ID, label: 'Veo 3.1 Fast' }
];

export const VEO_PRICING_PER_SECOND_USD = 0.10; // Video + Audio rate

export function getVeoCostUsd(durationSeconds: number): number {
  return durationSeconds * VEO_PRICING_PER_SECOND_USD;
}

export const VEO_NEGATIVE_PROMPT =
  "morphing wallpaper pattern, drawing new elements on the wall, new moons appearing, doubling moon, shifting moon, morphing arches, changing wallpaper motifs, animating the wallpaper design, moving wall prints, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark, bad quality, blurry, beam crossing the frame, ceiling beam blocking the view, wooden beam passing in front of camera, pillar or column blocking the shot, foreground object flying past the camera, obstruction entering the frame, silhouette sweeping across the frame, camera passing through objects, unexpected foreground element, parallax object crossing the shot, page turning effect, book page flip, page flip transition, page curl, paper page turning, transition wipe effect, opening page-turn effect, storybook page turn, fade transition, wipe transition, intro transition effect, toy swinging, hanging toy moving, mobile spinning, mobile toy swaying, crib mobile moving, stuffed toy moving, dangling object swinging, curtains appearing, curtains materializing, new curtains, drapes appearing, new drapery, fabric appearing from nowhere, hanging decoration swinging";

export const VEO_PRESETS = {
  dolly_in: {
    label: "Медленный наезд камеры (Dolly-In)",
    prompt: "An extremely slow, steady, and smooth cinematic camera push-in while gently panning and sliding sideways to reveal the extended wallpaper mural. The camera tracks diagonally across the room, focusing on showing the wallpaper pattern. The wallpaper behaves strictly as a static flat print on the wall with zero changes, zero morphing, and no new details appearing. All design elements on the wallpaper, including the arches, moon, and stars, are completely static and fixed, and do not move, shift, double, or animate. Every object, toy, and piece of furniture in the room stays perfectly still and fixed in its exact position — nothing sways, swings, dangles, or moves in any way. The view stays completely clear and unobstructed throughout the entire shot — nothing ever enters the frame, crosses in front of the camera, or blocks the view. The video starts immediately on the steady interior shot — no transition effect of any kind at the start or at any point during the clip. High-end catalog style."
  },
  ambient: {
    label: "Легкое оживление / Живое фото (Ambient)",
    prompt: "A static cinematic shot with a very slow, subtle horizontal camera drift (panning gently left-to-right). The only motion in the entire frame is a subtle, gentle shift in daylight and soft shadow across the room. Every object, toy, decoration, and piece of furniture stays perfectly still and fixed in its exact position — nothing sways, swings, dangles, spins, or moves in any way. No curtains, drapes, or fabric of any kind are present unless they were already clearly visible in the original photo, and even then they do not move. The wallpaper design on the back wall remains perfectly static, flat, and unchanged. All design elements on the wallpaper, including the arches, moon, and stars, are completely static and fixed, and do not move, shift, double, or animate. The view stays completely clear and unobstructed throughout the entire shot — nothing ever enters the frame, crosses in front of the camera, or blocks the view. The video starts immediately on the steady interior shot — no transition effect of any kind at the start or at any point during the clip. High-end lifestyle catalog style."
  },
  dolly_out: {
    label: "Плавный отъезд камеры (Dolly-Out)",
    prompt: "An extremely slow, steady, and smooth cinematic camera pull-back while gently tracking sideways to show more of the room and the full width of the wallpaper mural. The camera moves backward and slides horizontally. The wallpaper design remains a flat, non-moving print on the wall with zero morphing or details changing. All design elements on the wallpaper, including the arches, moon, and stars, are completely static and fixed, and do not move, shift, double, or animate. Every object, toy, and piece of furniture in the room stays perfectly still and fixed in its exact position — nothing sways, swings, dangles, or moves in any way. The view stays completely clear and unobstructed throughout the entire shot — nothing ever enters the frame, crosses in front of the camera, or blocks the view. The video starts immediately on the steady interior shot — no transition effect of any kind at the start or at any point during the clip. High quality."
  }
};

