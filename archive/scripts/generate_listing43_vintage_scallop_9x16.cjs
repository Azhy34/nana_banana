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
const OUT_FILENAME = 'funhaus_vintage_scallop_bed_daybed_9x16.png';
const OUT_PATH = path.join(OUT_DIR, OUT_FILENAME);

const PROMPT = [
  "WALLPAPER SPECIFICATION: The reference image is a vertical stripe wallpaper mural in dusty rose and warm cream (Altrosa und Creme). Retain the exact stripe widths, colors, and proportions 1:1 without alteration or recoloring.",
  "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The feature wall features a playful retro two-tone layout inspired by European dopamine decor: the dusty rose striped wallpaper covers the lower two-thirds of the wall, crowned by a distinct decorative red lacquer scalloped wave border trim (festooned wavy moulding). Above the scalloped trim, the upper wall is painted in warm chalky cream with an aesthetic gallery of charming retro illustrations in scalloped and checkered frames.",
  "COMPOSITION (VERTICAL 9:16 EDITORIAL INTERIOR): A stunning, deep vertical composition capturing the playful retro kids bedroom aesthetic. On one side, an elegant vintage curved metal spindle daybed in pale cornflower blue dressed with soft organic waffle blankets and gingham checkered pillows. Beside it, a whimsical mid-century cobalt blue mushroom lamp sits on a low nightstand.",
  "FOREGROUND & PLAYFUL DOPAMINE DETAILS: In the foreground corner, a charming low flower-shaped wooden craft table with neat wax crayons and a stack of circular donut/macaron foam poufs in ochre yellow and soft terracotta. At the top of the frame, soft glowing frosted glass globes of a bubble chandelier. Beautiful light oak herringbone parquet flooring.",
  "LIGHTING & MATERIAL TEXTURE: Natural directional morning daylight streams in from a tall side window, softly grazing across the wallpaper surface to reveal the physical Craft Lambda ultra-matte sand micro-relief and non-woven fleece paper texture. Soft ambient occlusion and realistic shadows under the furniture.",
  "OPTICAL CLARITY: Photographed on Sony A7R V with 35mm prime lens, f/5.6 aperture, edge-to-edge mural sharpness, zero distortion, zero text, zero watermarks, 100% clean video-ready base."
].join(" ");

const BASE_NEGATIVE = "peeling wallpaper, wallpaper peeling off wall, corner curl, bed canopy, fabric canopy, baldachin, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plush animal heads, fake taxidermy, animal trophies, wicker baskets, straw baskets, rattan furniture, plastic furniture, plastic toys, bunk beds, ladders, messy clutter, distorted geometry, CGI 3D render look, text overlay, watermark, advertising badge, letters, words";

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found');
    process.exit(1);
  }

  console.log('='.repeat(75));
  console.log('🎨 GENERATING CUSTOM 9:16 PHOTO (Vintage Scallop Bed & Daybed Fun Haus)');
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

