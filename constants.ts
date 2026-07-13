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
export const VEO_MODEL_OPTIONS = [
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' }
];

export const VEO_PRICING_PER_SECOND_USD = 0.10; // Video + Audio rate

export const VEO_NEGATIVE_PROMPT = 
  "morphing wallpaper pattern, different wall color, morphing wall texture, warped walls, shifting print, repainted wall, new wall art appearing, camera shake, scene change, furniture moving, objects appearing or disappearing, text, watermark, bad quality, blurry";

export const VEO_PRESETS = {
  dolly_in: {
    label: "Медленный наезд камеры (Dolly-In)",
    prompt: "An extremely slow, steady, and smooth cinematic camera push-in while gently panning and sliding sideways to reveal the extended wallpaper mural. The camera tracks diagonally across the room, focusing on showing the wallpaper pattern. The wallpaper behaves strictly as a static flat print on the wall with zero changes, zero morphing, and no new details appearing. High-end catalog style."
  },
  ambient: {
    label: "Легкое оживление / Живое фото (Ambient)",
    prompt: "A static cinematic shot with a very slow, subtle horizontal camera drift (panning gently left-to-right). The camera captures gentle natural micro-movements in the room. The wallpaper design on the back wall remains perfectly static, flat, and unchanged. High-end lifestyle catalog style."
  },
  dolly_out: {
    label: "Плавный отъезд камеры (Dolly-Out)",
    prompt: "An extremely slow, steady, and smooth cinematic camera pull-back while gently tracking sideways to show more of the room and the full width of the wallpaper mural. The camera moves backward and slides horizontally. The wallpaper design remains a flat, non-moving print on the wall with zero morphing or details changing. High quality."
  }
};

