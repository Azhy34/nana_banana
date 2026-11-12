#!/usr/bin/env node

/**
 * Generate TRUE 45-Degree Corner Perspective Mockup
 *
 * Uses:
 * 1. REFERENCE_IMAGE_1: The flat 2D wallpaper mural (Salbei Nebelwald) - 1:1 fidelity
 * 2. REFERENCE_IMAGE_2: Craft Lambda physical texture reference
 * 3. 45-degree three-quarter corner perspective camera angle
 * 4. Furniture: Natural solid birch slatted crib, olive rug, clean oak floor (ZERO wicker baskets)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');

function getApiKey() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/) ||
                  content.match(/VITE_GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/);
    if (match) return match[1];
  }
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || null;
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not found in .env.local');

  const traceId = crypto.randomBytes(16).toString('hex');
  const runDir = path.join(process.cwd(), 'runs', 'GMC-WA-003_keyframe');
  fs.mkdirSync(runDir, { recursive: true });

  const muralPath = path.join(runDir, 'wallpaper_mural.webp');
  const texturePath = path.join(process.cwd(), 'public', 'textures', 'craft_lambda.jpg');
  const outputPath = path.join(runDir, 'true_45deg_corner_shot.png');

  if (!fs.existsSync(muralPath)) {
    throw new Error('wallpaper_mural.webp missing');
  }

  const muralBase64 = fs.readFileSync(muralPath).toString('base64');
  let textureBase64 = null;
  if (fs.existsSync(texturePath)) {
    textureBase64 = fs.readFileSync(texturePath).toString('base64');
  }

  console.log('='.repeat(70));
  console.log(`📐 GENERATING TRUE 45-DEGREE CORNER PERSPECTIVE SHOT`);
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Wallpaper:    Salbei Nebelwald (1:1 2D reference mural)`);
  console.log(`Angle:        3/4 corner perspective (45° angle showing deep room depth)`);
  console.log(`Clean Floor:  Zero wicker baskets, natural birch crib, olive rug`);
  console.log(`Output:       ${path.relative(process.cwd(), outputPath)}`);
  console.log('='.repeat(70));

  const prompt = `LAYER 1: WALLPAPER MURAL (HERO PRODUCT 1:1 ENFORCEMENT)
REFERENCE_IMAGE_1 is the exact 2D graphic design for the wallpaper product (Salbei Nebelwald).
It is strictly mandatory that this entire reference image is mapped onto the feature wall from edge to edge, as a single continuous seamless mural. The watercolor misty pine forest, mountain ridges, and flock of birds must be reproduced with 100% fidelity to the graphic file. The wallpaper mural is the central hero of the interior.

LAYER 2: ROOM & ARCHITECTURAL PERSPECTIVE (45° CORNER VIEW)
A stylish, peaceful Scandinavian nursery interior viewed from a distinct three-quarter corner perspective (45-degree camera angle). The camera is positioned in the corner of the room, looking diagonally across the nursery so the wallpaper feature wall recedes dramatically in deep perspective from the corner into the room.

LAYER 3: HERO FURNITURE & CLEAN FLOOR (NO BASKETS)
- A low minimalist Scandinavian baby crib in smooth natural solid birch wood with slender vertical slats is placed along the feature wall.
- Clean light oak wood floorboards with a smooth, cozy olive-green area rug.
- STRICT NEGATIVE: Absolute zero wicker baskets, zero straw baskets, zero hampers on the floor. The floor is clean and uncluttered.
- Zero house beds, zero overhead roof frames, zero tall obstructing posts.

LAYER 4: NATURAL LIGHTING & TEXTURE
Directional morning daylight streams in from an adjacent window on the side, gently grazing across the wallpaper to reveal an authentic tactile ultra-matte non-woven sand paper grain (Craft Lambda micro-relief) with soft natural ambient occlusion under the crib.

LAYER 5: CAMERA & OPTICS
Shot from standing child-scale perspective at a true 45-degree three-quarter diagonal angle. Sony A7R V with 35mm prime lens at f/5.6 aperture for tack-sharp depth of field across the entire wallpaper mural. Vertical 9:16 portrait orientation.`;

  const negativePrompt =
    "frontal view, flat wall, straight-on camera, wicker baskets, straw baskets, woven hampers, rattan furniture, floor clutter, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plush animal heads, peeling wallpaper, half-wall wallpaper, wainscoting, plastic toys, blurry textures, CGI 3D render look";

  const ai = new GoogleGenAI({ apiKey });
  const parts = [
    { text: "REFERENCE_IMAGE_1 (WALLPAPER PRODUCT DESIGN - MANDATORY 1:1 MAP): Map this exact watercolor forest design 1:1 onto the feature wall." },
    { inlineData: { data: muralBase64, mimeType: 'image/webp' } }
  ];

  if (textureBase64) {
    parts.push({ text: "REFERENCE_IMAGE_2 (Physical Wallpaper Material Texture): Extract only the non-woven sand-grain texture and matte finish." });
    parts.push({ inlineData: { data: textureBase64, mimeType: 'image/jpeg' } });
  }

  parts.push({ text: prompt });

  console.log('\nSubmitting request to Gemini 3.1 Flash Image...');
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: { parts },
    config: {
      imageConfig: {
        aspectRatio: '9:16',
        imageSize: '2K',
        negativePrompt
      }
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  let generatedBase64 = null;
  if (response.candidates && response.candidates[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        generatedBase64 = part.inlineData.data;
        break;
      }
    }
  }

  if (!generatedBase64) {
    throw new Error('No image was returned by Gemini 3.1 Flash Image.');
  }

  fs.writeFileSync(outputPath, Buffer.from(generatedBase64, 'base64'));
  console.log(`\n✓ Generated True 45° Corner Shot in ${durationSec}s!`);
  console.log(`  Saved to: ${outputPath}`);
}

run().catch(err => {
  console.error('\n❌ ERROR:', err.message || err);
  process.exit(1);
});

