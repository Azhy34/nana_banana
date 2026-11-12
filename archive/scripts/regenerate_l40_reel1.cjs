#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

function getApiKey() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/) ||
                  content.match(/VITE_GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
    if (match) return match[1].trim();
  }
  return process.env.GEMINI_API_KEY || null;
}

const CLEAN_WALLPAPER_PATH = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc/clean_l40_wallpaper_ref.png';
const TEXTURE_PATH = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');
const OUT_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 40/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';
const ART_DIR = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc';

const EXACT_UNIFORM_STRIPE_PROMPT = [
  "WALLPAPER PRODUCT FIDELITY (MANDATORY & CRITICAL): Replicate the exact wallpaper pattern from REFERENCE_IMAGE_1 1:1 without alteration.",
  "REFERENCE_IMAGE_1 is a classic broad two-tone vertical block-stripe wallpaper mural consisting strictly of alternating wide cream (ivory) stripes and wide muted sage green (Salbeigrün) stripes.",
  "UNIFORM STRIPE WIDTH LOCK: Every single sage green stripe and every single cream stripe MUST have the exact same uniform, equal width across the entire room from left to right.",
  "Strictly forbidden: irregular stripe spacing, alternating narrow and wide stripes, distorted stripe rhythms. All stripes are perfectly parallel, vertical, straight, and identical in width.",
  "COLOR & DETAIL LOCK: Soft warm cream and soft earthy sage green. Strictly ZERO black lines, ZERO dark outlines, ZERO pinstripes, ZERO borders on the sides of stripes, and ZERO 3D wood slats or beadboard grooves. Pure flat 2D non-woven wallpaper print."
].join(" ");

const CARDS_TO_REGEN = [
  {
    filename: 'l40_funhaus_01_9x16_scallop_wooden_bed.png',
    title: 'Reel 1 Scene 1: Scallop Trim + Natural Birch Wooden Bed (Exact Uniform Stripes)',
    prompt: [
      EXACT_UNIFORM_STRIPE_PROMPT,
      "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The sage green and cream uniform striped wallpaper covers the lower two-thirds of the wall, crowned cleanly by a distinct decorative red lacquer / terracotta scalloped wave border trim. Above the wavy trim, the upper wall is painted in warm chalky cream with retro framed art prints.",
      "HERO FURNITURE (100% NATURAL WOOD - NO METAL): A low Scandinavian toddler bed made of smooth natural solid birch wood with rounded vertical wooden spindles and low safety rails (completely non-metal solid wood). Dressed in crisp cream organic bedding with an ochre yellow textured throw and a gingham pillow.",
      "ROOM DETAILS: An adorable flower-shaped low wooden craft table with wax crayons, a stack of circular donut/macaron foam poufs (terracotta, mustard yellow, mint), a mid-century cobalt blue mushroom lamp on a fluted wood nightstand, frosted bubble globe chandelier hanging from the ceiling, light oak herringbone parquet floor.",
      "LIGHTING & OPTICS: Warm directional morning sunlight grazing across the wall, highlighting Craft Lambda non-woven paper micro-relief. Photographed on Sony A7R V, 35mm lens, f/5.6 aperture, edge-to-edge sharpness, zero distortion, zero text, zero watermarks."
    ].join(" ")
  },
  {
    filename: 'l40_funhaus_02_9x16_scallop_play_table_lifestyle.png',
    title: 'Reel 1 Scene 2: Scallop Trim + Flower Craft Table & Poufs (Exact Uniform Stripes)',
    prompt: [
      EXACT_UNIFORM_STRIPE_PROMPT,
      "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The lower wall features the exact uniform wide sage green and cream striped wallpaper, crowned by the decorative terracotta scalloped wave moulding. Warm cream wall above with cute framed children's illustrations (smiling red apple, little bear).",
      "COMPOSITION (VERTICAL 9:16 PLAY CORNER FOCUS): Focused medium shot on the creative play area. An organic flower-shaped low table in light natural birch wood with wooden pots holding colored pencils, an open drawing book, and tactile wooden building blocks. Beside the table, stackable circular macaron/donut foam poufs in soft poppy red and ochre yellow.",
      "STORAGE & DETAILS: A low birch Montessori toy shelf displaying smooth wooden toy animals (elephant, giraffe, bunny). Light oak wood floor with a soft textured dotted cream rug. Directional morning sunbeam grazing across the matte wallpaper texture. Zero text, zero watermarks."
    ].join(" ")
  }
];

const STRICT_NEGATIVE = [
  "irregular stripes, uneven stripe width, narrow stripes, thin stripes, distorted stripe rhythms, variable stripe width, wavy stripes, pinstripes,",
  "black lines, black outlines, dark borders, black lines on sides of stripes, double lines, slatted wall, beadboard, vertical grooves, wood slats, 3D wall panels,",
  "iron bed, metal bed, steel bed, metal spindle bed, iron bars, metal headboard,",
  "peeling wallpaper, bed canopy, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, wicker baskets, rattan furniture, plastic furniture, messy clutter, distorted geometry, CGI 3D render look, text overlay, watermark, advertising badge, letters, words"
].join(" ");

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not found');

  console.log('='.repeat(75));
  console.log('🎨 REGENERATING REEL 1 (SCENES 1 & 2) WITH EXACT UNIFORM STRIPES');
  console.log(`Wallpaper Ref: clean_l40_wallpaper_ref.png (2400x1600 Lanczos anti-aliased)`);
  console.log(`Output Dir:    ${OUT_DIR}`);
  console.log('='.repeat(75));

  const wallpaperBuf = fs.readFileSync(CLEAN_WALLPAPER_PATH);
  const wallpaperPart = { inlineData: { data: wallpaperBuf.toString('base64'), mimeType: 'image/png' } };

  let texturePart = null;
  if (fs.existsSync(TEXTURE_PATH)) {
    const texBuf = fs.readFileSync(TEXTURE_PATH);
    texturePart = { inlineData: { data: texBuf.toString('base64'), mimeType: 'image/jpeg' } };
  }

  const ai = new GoogleGenAI({ apiKey });

  for (const card of CARDS_TO_REGEN) {
    const outPath = path.join(OUT_DIR, card.filename);
    const artPath = path.join(ART_DIR, card.filename);

    console.log(`\n🎨 Generating ${card.title}...`);

    const parts = [
      { text: "REFERENCE_IMAGE_1 (Authentic Wallpaper Artwork): This is the exact wallpaper product. It features perfectly equal-width, uniform broad vertical stripes of soft cream and sage green. Replicate this exact uniform stripe rhythm without distortion or irregular spacing." },
      wallpaperPart
    ];
    if (texturePart) {
      parts.push({
        text: "REFERENCE_IMAGE_2 (Physical Texture Reference): Extract ONLY the fine-grain sand micro-relief and ultra-matte non-woven paper finish. Discard any drawings or gold leaf."
      });
      parts.push(texturePart);
    }
    parts.push({ text: card.prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: '9:16',
          imageSize: '2K',
          negativePrompt: STRICT_NEGATIVE
        }
      }
    });

    const candidates = response.candidates || [];
    let saved = false;
    for (const c of candidates) {
      const resParts = c.content?.parts || [];
      for (const p of resParts) {
        if (p.inlineData && p.inlineData.data) {
          const imgBuffer = Buffer.from(p.inlineData.data, 'base64');
          fs.writeFileSync(outPath, imgBuffer);
          fs.writeFileSync(artPath, imgBuffer);
          const sizeMb = (imgBuffer.length / 1024 / 1024).toFixed(2);
          console.log(`✅ Saved ${outPath} (${sizeMb} MB)`);
          console.log(`✓ Copied to artifacts: ${artPath}`);
          saved = true;
          break;
        }
      }
      if (saved) break;
    }

    if (!saved) throw new Error(`Failed to save ${card.filename}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n🎉 BOTH REEL 1 SCENES REGENERATED SUCCESSFULLY WITH EXACT STRIPES!');
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

