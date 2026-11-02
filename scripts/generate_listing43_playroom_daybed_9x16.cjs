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

const WALLPAPER_PATH = 'C:/Users/Mikhail/Desktop/Обои/Листинг 43/streifentapete-altrosa-creme-muster-vliestapete-3x2.png';
const TEXTURE_PATH = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');
const OUT_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 43/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';
const OUT_FILENAME = 'funhaus_playroom_daybed_fullwall_9x16.png';
const OUT_PATH = path.join(OUT_DIR, OUT_FILENAME);

const PROMPT = [
  "WALLPAPER SPECIFICATION: The reference image is a vertical stripe wallpaper mural in dusty rose and warm cream (Altrosa und Creme). FULL-HEIGHT 100% WALL COVERAGE: It is strictly mandatory that this exact wallpaper pattern is mapped across the entire feature wall from the floor baseboard all the way up to the ceiling as a single, continuous, seamless mural covering 100% of the wall surface edge-to-edge, running solidly behind the daybed and all furniture without any horizontal cut, split, or unpapered section. Retain the exact stripe widths, colors, and proportions 1:1.",
  "ROOM & INTERIOR STYLE: An authentic, bright, cheerful children's playroom and bedroom designed in the trending Fun Haus / Playful Interior / Dopamine Decor aesthetic. The room radiates joyful, creative energy with clean Scandinavian craftsmanship.",
  "HERO FURNITURE & PLAYFUL OBJECTS: In a vertical 9:16 perspective, a low natural solid birch toddler daybed dressed in crisp organic cotton bedding with a striped bolster pillow and a warm gingham check cushion. Beside it, a fluted cylindrical wooden nightstand topped with a mid-century retro cobalt blue mushroom table lamp.",
  "FOREGROUND ACCENTS: In the foreground, an adorable flower-shaped low wooden craft table with a neat stack of circular donut/macaron foam poufs in coral pink, ochre yellow, and soft sage. At the top of the frame, soft glowing frosted glass globes of a cluster bubble chandelier. Light natural oak herringbone parquet floor with a soft textured cream rug.",
  "WALL ART: Wavy scalloped picture frames with colorful playful retro graphic art prints hang neatly on the striped feature wall.",
  "LIGHTING & MATERIAL TEXTURE: Natural directional morning daylight streams from an adjacent tall window, grazing across the wallpaper surface to highlight the physical Craft Lambda ultra-matte fine sand grain micro-relief and non-woven fleece paper texture. Soft ambient shadows under the furniture.",
  "OPTICAL CLARITY: Photographed on Sony A7R V with 35mm prime lens, f/5.6 aperture, edge-to-edge mural sharpness, zero distortion, zero text, zero watermarks, 100% clean video-ready base."
].join(" ");

const BASE_NEGATIVE = "peeling wallpaper, wallpaper peeling off wall, corner curl, bed canopy, fabric canopy, baldachin, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plush animal heads, fake taxidermy, animal trophies, wicker baskets, straw baskets, rattan furniture, plastic furniture, plastic toys, bunk beds, ladders, messy clutter, distorted geometry, CGI 3D render look, text overlay, watermark, advertising badge, letters, words, half-wall wallpaper, split wall, wainscoting";

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found');
    process.exit(1);
  }

  console.log('='.repeat(75));
  console.log('🎨 GENERATING 9:16 VERSION OF CARD 01 (Playroom Daybed Full Wall Fun Haus)');
  console.log(`Wallpaper: ${path.basename(WALLPAPER_PATH)}`);
  console.log(`Output:    ${OUT_PATH}`);
  console.log('='.repeat(75));

  const wallpaperBuf = fs.readFileSync(WALLPAPER_PATH);
  const wallpaperPart = {
    inlineData: {
      data: wallpaperBuf.toString('base64'),
      mimeType: 'image/png'
    }
  };

  let texturePart = null;
  if (fs.existsSync(TEXTURE_PATH)) {
    const texBuf = fs.readFileSync(TEXTURE_PATH);
    texturePart = {
      inlineData: {
        data: texBuf.toString('base64'),
        mimeType: 'image/jpeg'
      }
    };
    console.log('✓ Craft Lambda texture loaded');
  }

  const ai = new GoogleGenAI({ apiKey });

  const parts = [
    { text: "REFERENCE_IMAGE_1 (Wallpaper Graphic Design): This is the exact wallpaper graphic design to display on the feature wall. Preserve all vertical stripe lines, dusty rose (Altrosa) and cream colors, and proportions 1:1 without alteration or recoloring." },
    wallpaperPart
  ];

  if (texturePart) {
    parts.push({
      text: "REFERENCE_IMAGE_2 (Physical Material Texture Reference - Craft Lambda Non-Woven Sand Texture): This is a macro photograph of the physical wallpaper material. Extract and apply ONLY the physical surface micro-relief: the fine-grain sand texture, non-woven fleece paper substrate, and ultra-matte finish under daylight. DO NOT copy any drawings or gold leaf from this reference."
    });
    parts.push(texturePart);
  }

  parts.push({ text: PROMPT });

  console.log('\n[Gemini 3.1 Flash Image] Requesting 2K 9:16 generation...');
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: '9:16',
        imageSize: '2K',
        negativePrompt: BASE_NEGATIVE
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
        fs.writeFileSync(OUT_PATH, imgBuffer);
        const sizeMb = (imgBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`✅ Saved ${OUT_PATH} (${sizeMb} MB)`);
        saved = true;
        break;
      }
    }
    if (saved) break;
  }

  if (!saved) {
    console.error('❌ Failed to retrieve image data from Gemini response');
    process.exit(1);
  }

  // Copy to brain artifacts
  const artDir = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc';
  const artDest = path.join(artDir, OUT_FILENAME);
  fs.copyFileSync(OUT_PATH, artDest);
  console.log(`✓ Copied to artifacts: ${artDest}`);
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

