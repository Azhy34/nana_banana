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

const WALLPAPER_PATH = 'C:/Users/Mikhail/Desktop/Обои/Листинг 40/streifentapete-salbeigruen-creme-muster-vliestapete-3x2.png';
const TEXTURE_PATH = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');
const OUT_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 40/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';
const OUT_PATH = path.join(OUT_DIR, 'l40_funhaus_04_9x16_fullwall_montessori_playroom.png');
const ART_PATH = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc/l40_funhaus_04_9x16_fullwall_montessori_playroom.png';

const STRICT_WALLPAPER_L40 = [
  "ABSOLUTE 1:1 PATTERN REPRODUCTION: Replicate REFERENCE_IMAGE_1 with 100% geometric and color fidelity.",
  "The wallpaper consists ONLY of alternating equal-width stripes in soft warm cream (ivory) and muted earthy sage green (Salbeigrün).",
  "There are NO pinstripes, NO black lines, NO dark outlines, and NO borders between stripes.",
  "FULL-HEIGHT 100% WALL COVERAGE: The wallpaper covers the entire accent wall continuously from floor to ceiling as a seamless, flat 2D non-woven paper mural."
].join(" ");

const PROMPT_COZY_PLAYROOM = [
  STRICT_WALLPAPER_L40,
  "ROOM & ATMOSPHERE (WARM, COZY, LIVED-IN MONTESSORI NURSERY): A wonderfully warm, cozy, sun-drenched Scandinavian children's playroom full of Danish Hygge and cheerful Dopamine Decor energy. Soft, warm golden morning light streams gently through a window, casting warm honey-toned ambient light across the room with NO harsh overexposure, NO white blowout, and NO sterile lighting.",
  "WALL DECOR & SHELF: On the sage green striped feature wall, a low natural wood floating shelf holds a potted trailing green ivy plant and a tiny wooden mushroom. Under the shelf, three charming framed retro children's art prints (a sweet bunny, a stylized flower, a blue elephant) hang in light natural oak wood frames, giving the wall depth and warmth.",
  "PLAY FURNITURE & SENSORY TOYS: In the center, a low round natural birch play table with two adorable rabbit-ear wooden chairs. On the table, smooth natural wooden building blocks and an open storybook. Beside the table, a low wooden toy storage console with colorful fabric storage bins in mustard yellow, terracotta red, and pastel sky blue.",
  "COZY CORNER & TEXTILES: In the background corner, a cozy fabric teepee tent with a colorful felt pompom garland and a plush mustard yellow floor cushion. On the light oak hardwood floor lies a thick, soft cream pompom wool rug. A warm woven pendant lamp or clean ceiling with zero spotlights.",
  "LIGHTING & TEXTURE: Directional warm golden sunlight gently grazing the tactile Craft Lambda ultra-matte non-woven paper texture, bringing out the authentic paper grain. Photographed on Sony A7R V with 35mm prime lens, f/5.6 aperture, edge-to-edge sharpness, warm cozy color temperature (3200K golden hour ambiance), zero text, zero watermarks, 100% clean video-ready base."
].join(" ");

const STRICT_NEGATIVE = [
  "ceiling spotlights, canister lights, downlights, cylinder ceiling lights, track lighting, commercial lighting, office lighting,",
  "harsh white light, overexposure, blown-out highlights, washed out, sterile room, cold light, empty bare wall,",
  "iron bed, metal bed, steel bed, metal spindle bed, black lines, black outlines, dark borders, black lines on sides of stripes, double lines,",
  "slatted wall, beadboard, vertical grooves, wood slats, 3D wall panels, pinstripes, altered stripes,",
  "peeling wallpaper, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plastic furniture, messy clutter, CGI 3D render look, text overlay, watermark, advertising badge, letters, words"
].join(" ");

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not found');

  console.log('='.repeat(75));
  console.log('🎨 REGENERATING REEL 2 SCENE 2 (Cozy Warm Montessori Playroom - No Spotlights)');
  console.log(`Wallpaper: ${path.basename(WALLPAPER_PATH)}`);
  console.log(`Output:    ${OUT_PATH}`);
  console.log('='.repeat(75));

  const wallpaperBuf = fs.readFileSync(WALLPAPER_PATH);
  const wallpaperPart = { inlineData: { data: wallpaperBuf.toString('base64'), mimeType: 'image/png' } };

  let texturePart = null;
  if (fs.existsSync(TEXTURE_PATH)) {
    const texBuf = fs.readFileSync(TEXTURE_PATH);
    texturePart = { inlineData: { data: texBuf.toString('base64'), mimeType: 'image/jpeg' } };
    console.log('✓ Craft Lambda texture loaded');
  }

  const ai = new GoogleGenAI({ apiKey });

  const parts = [
    { text: "REFERENCE_IMAGE_1 (Exact Product Artwork): Replicate this exact two-tone sage green and cream stripe pattern with 100% fidelity. Equal width stripes, zero pinstripes, zero black outlines, zero dark borders." },
    wallpaperPart
  ];
  if (texturePart) {
    parts.push({
      text: "REFERENCE_IMAGE_2 (Physical Material Texture Only): Extract ONLY the fine-grain sand texture and ultra-matte non-woven paper micro-relief. Discard any drawings or gold leaves."
    });
    parts.push(texturePart);
  }
  parts.push({ text: PROMPT_COZY_PLAYROOM });

  console.log('\n[Gemini 3.1 Flash Image] Requesting warm cozy 2K 9:16 generation...');
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
        fs.writeFileSync(OUT_PATH, imgBuffer);
        fs.writeFileSync(ART_PATH, imgBuffer);
        const sizeMb = (imgBuffer.length / 1024 / 1024).toFixed(2);
        console.log(`✅ Saved ${OUT_PATH} (${sizeMb} MB)`);
        console.log(`✓ Copied to artifacts: ${ART_PATH}`);
        saved = true;
        break;
      }
    }
    if (saved) break;
  }

  if (!saved) throw new Error('Failed to save regenerated image');
  console.log('\n🎉 REEL 2 SCENE 2 REGENERATED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

