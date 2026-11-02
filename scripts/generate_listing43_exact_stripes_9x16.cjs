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
const OUT_PATH_1 = path.join(OUT_DIR, 'funhaus_scallop_bed_exact_stripes_9x16.png');
const OUT_PATH_2 = path.join(OUT_DIR, 'funhaus_fullwall_daybed_exact_stripes_9x16.png');

const STRICT_WALLPAPER_INSTRUCTION = [
  "ABSOLUTE 1:1 PATTERN REPRODUCTION (CRITICAL): The wallpaper mural on the wall MUST replicate REFERENCE_IMAGE_1 with 100% geometric and color fidelity.",
  "Look closely at REFERENCE_IMAGE_1: the wallpaper consists ONLY of alternating wide soft cream stripes and wide dusty-rose (Altrosa) stripes.",
  "Down the center of each dusty-rose stripe runs exactly ONE single subtle dark-wine/burgundy vertical pinstripe.",
  "There are NO lines on the edges of the stripes. The boundary between cream and dusty rose is completely flat, seamless, and devoid of any dark outlines or borders.",
  "STRICT NEGATIVE INSTRUCTION: DO NOT add black lines, DO NOT add black outlines to stripe edges, DO NOT add double pinstripes, DO NOT render 3D wood slats, grooves, or beadboard shadows. It is purely flat 2D wallpaper printed on smooth matte non-woven paper."
].join(" ");

const PROMPT_CARD_1 = [
  STRICT_WALLPAPER_INSTRUCTION,
  "WALL ARCHITECTURE (SCALLOPED RETRO BORDER): The feature wall features a playful retro two-tone layout: the dusty-rose striped wallpaper covers the lower two-thirds of the wall, crowned by a distinct decorative red lacquer scalloped wave border trim. Above the scalloped trim, the upper wall is painted in warm chalky cream with retro art prints in scalloped and checkered frames.",
  "COMPOSITION (VERTICAL 9:16 INTERIOR): A vintage curved metal spindle daybed in pale cornflower blue with soft organic waffle blanket and gingham checkered pillows. Beside it, an adorable low flower-shaped wooden craft table with wax crayons and a stack of circular donut/macaron foam poufs (ochre yellow and soft terracotta). A mid-century cobalt blue mushroom table lamp rests on a low nightstand. Frosted bubble chandelier at the ceiling. Light oak herringbone floor.",
  "LIGHTING: Warm gentle morning window light softly illuminating the matte wallpaper surface. Zero text, zero watermarks, 100% clean video-ready base."
].join(" ");

const PROMPT_CARD_2 = [
  STRICT_WALLPAPER_INSTRUCTION,
  "FULL-HEIGHT 100% WALL COVERAGE: This exact striped wallpaper covers the entire background wall from floor baseboard to the ceiling, completely seamless, edge-to-edge behind the furniture.",
  "COMPOSITION (VERTICAL 9:16 INTERIOR): A low Scandinavian solid birch toddler daybed dressed with a striped bolster pillow and a warm gingham check cushion. Beside it, a fluted cylindrical wooden nightstand with a cobalt blue retro mushroom lamp. Wavy scalloped picture frames with colorful retro graphic art prints hang neatly on the striped feature wall. In the foreground, a flower-shaped low wooden craft table with a stack of donut foam poufs. Cluster bubble frosted chandelier above. Light oak herringbone floor.",
  "LIGHTING: Gentle natural morning sunlight streaming from the tall window, revealing the physical Craft Lambda ultra-matte non-woven paper texture. Zero text, zero watermarks, 100% clean video-ready base."
].join(" ");

const STRICT_NEGATIVE = "black lines, black outlines, dark borders, black lines on sides of stripes, double lines, slatted wall, beadboard, vertical grooves, wood slats, 3D wall panels, altered stripes, extra pinstripes, dark borders around stripes, peeling wallpaper, bed canopy, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, wicker baskets, rattan furniture, plastic furniture, messy clutter, distorted geometry, CGI 3D render look, text overlay, watermark, advertising badge, letters, words";

async function generateCard(ai, wallpaperPart, texturePart, prompt, outPath, label) {
  console.log(`\n🎨 Generating ${label}...`);
  const parts = [
    { text: "REFERENCE_IMAGE_1 (Exact Wallpaper Design): This is the exact product being sold. Replicate its pattern, colors, and stripe sequence 100% identically." },
    wallpaperPart
  ];
  if (texturePart) {
    parts.push({
      text: "REFERENCE_IMAGE_2 (Material Texture Only): Extract ONLY the fine-grain sand texture and ultra-matte non-woven paper surface. Discard any drawings or gold leaves from this reference."
    });
    parts.push(texturePart);
  }
  parts.push({ text: prompt });

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
  for (const c of candidates) {
    const resParts = c.content?.parts || [];
    for (const p of resParts) {
      if (p.inlineData && p.inlineData.data) {
        const imgBuffer = Buffer.from(p.inlineData.data, 'base64');
        fs.writeFileSync(outPath, imgBuffer);
        const sizeMb = (imgBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`✅ Saved ${outPath} (${sizeMb} MB)`);
        
        // Copy to brain artifacts
        const artDir = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc';
        const artDest = path.join(artDir, path.basename(outPath));
        fs.copyFileSync(outPath, artDest);
        console.log(`✓ Copied to artifacts: ${artDest}`);
        return true;
      }
    }
  }
  throw new Error(`Failed to save ${label}`);
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not found');

  const wallpaperBuf = fs.readFileSync(WALLPAPER_PATH);
  const wallpaperPart = { inlineData: { data: wallpaperBuf.toString('base64'), mimeType: 'image/png' } };

  let texturePart = null;
  if (fs.existsSync(TEXTURE_PATH)) {
    const texBuf = fs.readFileSync(TEXTURE_PATH);
    texturePart = { inlineData: { data: texBuf.toString('base64'), mimeType: 'image/jpeg' } };
  }

  const ai = new GoogleGenAI({ apiKey });

  await generateCard(ai, wallpaperPart, texturePart, PROMPT_CARD_1, OUT_PATH_1, 'Card 1 (Scallop Trim + Vintage Blue Bed - Exact Stripes)');
  await generateCard(ai, wallpaperPart, texturePart, PROMPT_CARD_2, OUT_PATH_2, 'Card 2 (Full Wall Daybed - Exact Stripes)');
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

