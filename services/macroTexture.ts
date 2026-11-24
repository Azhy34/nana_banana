import { BatchPromptTags, UploadedImage } from '../types';
import { CRAFT_LAMBDA_TEXTURE_IMAGE } from './craftLambdaAsset';

/**
 * Single source of truth for the "Macro Texture in Interior" shot mode and Craft Lambda texture ref.
 *
 * Policy:
 * - Standard full-room cards use ONLY 1 reference (the wallpaper artwork 1:1) so the model never
 *   splits attention or contaminates colors/details with a second image.
 * - Macro Texture cards automatically attach REFERENCE_IMAGE_2 (pure clean Craft Lambda fine
 *   sand-grain crop) and generate a dedicated editorial close-up photographed inside the room.
 */

export const MACRO_TEXTURE_PREVIEW_URL = '/textures/craft_lambda.jpg';

export const MACRO_TEXTURE_LABEL =
  'REFERENCE_IMAGE_2 (Physical Material Texture Reference - Craft Lambda Non-Woven Sand Texture): This is a clean macro photograph of the real physical non-woven wallpaper substrate. Apply ONLY its physical surface micro-relief onto the printed wallpaper: fine-grain sand texture (Sandstruktur), tactile non-woven paper fleece fibers, and ultra-matte chalky finish under natural grazing daylight. Keep all colors, tones, and artwork from REFERENCE_IMAGE_1 strictly unchanged 1:1.';

export interface MacroPromptContext {
  lightingDescription?: string;
  styleName?: string;
  colorName?: string;
}

const MACRO_CLOSEUP_VARIANTS: readonly string[] = [
  'The entire close-up frame is dedicated to the pasted wallpaper wall under a diagonal shaft of warm window sunlight and soft dappled leaf shadows, with zero bed, zero pillows, and zero furniture in the foreground.',
  'In the lower corner of the foreground, softly out of focus in creamy optical bokeh, a single graceful leafy branch of an indoor olive tree or ficus plant frames the wallpaper close-up inside a sunlit room, with no bed or headboard.',
  'A pure architectural wall close-up: only a subtle hint of the clean room corner and natural window light falloff at the very edge of the frame anchor the wallpaper inside a real European room, with zero bed or furniture blocking the wall.',
  'In the lower corner of the foreground, softly out of focus in creamy optical bokeh, the edge of a fluted birch side table and the warm glow of a ceramic table lamp anchor the close-up inside a real room, with no bed or pillow.',
  'In the lower foreground, softly out of focus in creamy optical bokeh, a small corner of a natural solid oak headboard edge anchors the close-up inside a real European children\'s room.',
];

function pickMacroVariant(): string {
  return MACRO_CLOSEUP_VARIANTS[Math.floor(Math.random() * MACRO_CLOSEUP_VARIANTS.length)];
}

export function isMacroTextureCard(tags: Pick<BatchPromptTags, 'macroTexture'>): boolean {
  return Boolean(tags.macroTexture);
}

/**
 * Resolves whether to attach the Craft Lambda physical texture image to a given card.
 * Only macro texture cards receive the 2nd reference image; standard room shots stay 1-ref clean.
 */
export function resolveCardTexture(tags: Pick<BatchPromptTags, 'macroTexture'>): UploadedImage | null {
  return tags.macroTexture ? CRAFT_LAMBDA_TEXTURE_IMAGE : null;
}

/**
 * Picks one card index in a batch deck for the Macro Texture shot, avoiding the Hero slot
 * and preferring listing-friendly ratios (4:3, 3:4, 4:5, 2:3) before 9:16 video slots.
 */
export function pickMacroSlotIndex(formats: readonly string[], heroIdx: number): number {
  if (formats.length === 0) return -1;
  const preferredOrder = ['2:3', '4:5', '4:3', '3:4', '9:16'];
  for (const ratio of preferredOrder) {
    const idx = formats.findIndex((ar, i) => ar === ratio && i !== heroIdx);
    if (idx >= 0) return idx;
  }
  const fallback = formats.findIndex((_, i) => i !== heroIdx);
  return fallback >= 0 ? fallback : -1;
}

/**
 * Builds the "Macro Texture in Interior" prompt in either `brief` (positive-only, ~1000 chars)
 * or `full` (~2000 chars, detailed editorial macro photography) mode.
 */
export function buildMacroTexturePrompt(
  tags: BatchPromptTags,
  ctx: MacroPromptContext = {},
): string {
  const foregroundAnchor = pickMacroVariant();
  const styleBit = ctx.styleName ? ` (${ctx.styleName} aesthetic)` : '';
  const colorBit = ctx.colorName ? ` Harmonized with subtle ${ctx.colorName.toLowerCase()} room tones.` : '';
  const lightBit = ctx.lightingDescription
    ? `${ctx.lightingDescription}, angled low across the wall`
    : 'Warm raking natural daylight from a nearby side window angled low across the wall';

  if (tags.promptMode === 'brief') {
    return [
      `Create an editorial macro close-up photograph of the wall mural inside a real European children's room${styleBit}.`,
      `References: image 1 is the wall mural artwork — reproduce an authentic close-up section of its illustration at true real-world print scale, colors and drawing completely unchanged 1:1. Image 2 is the pure Craft Lambda non-woven sand-grain paper texture — transfer only its fine matte sand micro-relief and chalky paper fibers onto the printed wall surface.`,
      `Scene: The camera sits 40 cm from the pasted wallpaper wall at an oblique 35-degree angle so the mural fills 85–90% of the frame edge to edge, smooth and seamless with zero folds or seams. ${foregroundAnchor}${colorBit} No people, no hands, no rolled wallpaper.`,
      `Light and camera: ${lightBit}, revealing the tactile fine-grain sand relief and ultra-matte reflection-free paper finish. Shot on Sony A7R V, 90mm f/4 macro lens, tack-sharp focus across the textured wallpaper fibers with natural shallow depth of field at the frame edges. Real photograph, natural daylight grain.`,
    ].join('\n\n');
  }

  return [
    `This is an intimate commercial editorial macro detail photograph showcasing the real physical texture and print quality of a designer wall mural installed inside a European children's bedroom${styleBit}. REFERENCE_IMAGE_1 is the wallpaper artwork: reproduce an authentic close-up section of this exact illustration flat on the wall at its true real-world wall scale, preserving every color, soft watercolor brushstroke, line, and proportion 1:1 without redrawing or restyling. REFERENCE_IMAGE_2 is the pure physical Craft Lambda non-woven sand texture: apply its fine sand-grain micro-relief (Sandstruktur), subtle matte paper fleece fibers, and ultra-matte chalky reflection-free finish directly across the printed wallpaper surface.`,
    `Composition & Interior Context: Camera positioned 35–50 cm from the wall at an oblique 35-degree raking angle. The seamlessly pasted wall mural occupies 85–90% of the frame, completely flat and taut on the wall with zero peeling, zero seams, and zero folds. ${foregroundAnchor}${colorBit}`,
    `Lighting & Tactility: ${lightBit}, grazing gently across the wallpaper surface so the fine sand micro-relief shows the dry, ultra-matte non-woven fleece paper grain and soft micro-shadows with zero sparkle, zero sheen, and zero glossy vinyl reflection.`,
    `Camera & Realism: Shot on Sony A7R V with a 90mm macro prime lens at f/4, natural optical depth of field keeping the central wallpaper artwork and sand-grain paper texture razor-sharp while the outer frame edges fall into smooth organic lens bokeh. Authentic architectural editorial photography, unretouched natural daylight. Aspect ratio: ${tags.aspectRatio}.`,
    `Avoid: rolled wallpaper, folded paper, paper curls, peeling edges, hands holding samples, swatch cards, flat studio table scan, glossy vinyl sheen, plastic reflection, specular glare, visible seams, tiling, distorted illustration, altered colors, altered mural characters, people, faces, text overlays, CGI render look.`,
  ].join('\n\n');
}
