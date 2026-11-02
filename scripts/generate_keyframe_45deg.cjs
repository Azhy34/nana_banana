#!/usr/bin/env node

/**
 * Step 1b: Generate Frame B at a 45-degree Diagonal Angle (Eliminating Wicker Baskets)
 *
 * Requirements:
 * 1. True 45-degree diagonal perspective (3/4 view) looking across the crib towards the wall.
 * 2. Remove the woven/wicker baskets from the floor completely (clean light oak floor + olive rug).
 * 3. 100% architectural and material continuity with the birch crib and Salbei Nebelwald wallpaper.
 *
 * Model: gemini-3.1-flash-image (2K 9:16)
 * Cost: ~$0.0672 USD
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

function logSession(event) {
  const file = path.join(process.cwd(), 'gemini_sessions.json');
  let data = {};
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch {}
  }
  const sid = event.sessionId || 'gmc-marketing';
  if (!data[sid]) data[sid] = { createdTime: new Date().toISOString(), events: [] };
  data[sid].events.push(event);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found in .env.local');
  }

  const traceId = crypto.randomBytes(16).toString('hex');
  const runDir = path.join(process.cwd(), 'runs', 'GMC-WA-003_keyframe');
  fs.mkdirSync(runDir, { recursive: true });

  const startFramePath = path.join(runDir, 'frame_start.webp');
  const muralPath = path.join(runDir, 'wallpaper_mural.webp');
  const endFramePath = path.join(runDir, 'frame_end_45deg.png');

  if (!fs.existsSync(startFramePath) || !fs.existsSync(muralPath)) {
    throw new Error('Reference files missing in runs/GMC-WA-003_keyframe/');
  }

  const startBase64 = fs.readFileSync(startFramePath).toString('base64');
  const muralBase64 = fs.readFileSync(muralPath).toString('base64');

  console.log('='.repeat(70));
  console.log(`📐 STEP 1B: GENERATE 45° DIAGONAL FRAME B (NO BASKETS)`);
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Model:        gemini-3.1-flash-image`);
  console.log(`Camera:       45° diagonal 3/4 perspective across crib to feature wall`);
  console.log(`Clean Floor:  Wicker/straw baskets completely removed`);
  console.log(`Output:       ${path.relative(process.cwd(), endFramePath)}`);
  console.log('='.repeat(70));

  const prompt = `A true three-quarter diagonal perspective shot (45-degree angle) of this EXACT SAME children's room interior from REFERENCE_IMAGE_1.

CAMERA & PERSPECTIVE CHANGE:
- The camera is relocated to the right side of the room near the changing table dresser, framing the scene diagonally at a 45-degree angle across the slatted wooden crib towards the feature wall and the window on the far left.
- Distinct 3D spatial depth and parallax: the crib is framed from its three-quarter side angle in the mid-ground, leading the eye along the wall to the window.

OBJECT REMOVAL (CLEAN FLOOR):
- Completely remove all woven wicker baskets, straw baskets, and hampers from the floor beside the crib.
- The floor beside the crib is clean and tidy, showing only the natural light oak wood floorboards and the smooth olive-green area rug.

RIGID ROOM & MATERIAL CONTINUITY:
- The natural solid birch/beech slatted crib, mattress, and wood finish remain 100% identical to REFERENCE_IMAGE_1.
- The wallpaper mural on the feature wall is an exact seamless match to REFERENCE_IMAGE_2: misty watercolor pine forest in soft sage-green with flying birds.
- Warm morning daylight streaming through the window on the left, casting realistic soft diagonal shadows across the floor and crib.
- Zero new unrelated objects, zero plastic items. High-end editorial architectural magazine photography, tack sharp 9:16 portrait.`;

  const negativePrompt =
    "wicker baskets, straw baskets, woven baskets, rattan hampers, floor clutter, peeling wallpaper, wallpaper peeling off wall, corner curl, page curl, paper curl, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plush animal heads, stuffed animal heads, half-wall wallpaper, half-height wallpaper, two-tone wall, split wall, wainscoting, plastic toys, distorted furniture, messy room, low quality, seams, tiling, repeating wallpaper patterns, cheap 3D render look, cartoon style, CGI, blurry textures";

  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();

  console.log('\nSubmitting request to Gemini 3.1 Flash Image...');
  let response = null;
  let lastErr = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Attempt ${attempt}/2] Retrying after transient 503...`);
        await new Promise(r => setTimeout(r, 3000));
      }
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
        contents: {
          parts: [
            { text: "REFERENCE_IMAGE_1 (room interior to transform): keep the birch crib, floorboards, olive rug, and lighting." },
            { inlineData: { data: startBase64, mimeType: 'image/webp' } },
            { text: "REFERENCE_IMAGE_2 (flat wallpaper mural): Salbei Nebelwald design." },
            { inlineData: { data: muralBase64, mimeType: 'image/webp' } },
            { text: prompt }
          ]
        },
        config: {
          imageConfig: {
            aspectRatio: '9:16',
            imageSize: '2K',
            negativePrompt
          }
        }
      });
      if (response) break;
    } catch (err) {
      lastErr = err;
      console.warn(`[Attempt ${attempt}] Error: ${err.message || err}`);
    }
  }

  if (!response) {
    throw lastErr || new Error('Failed to generate image after 2 attempts.');
  }

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

  fs.writeFileSync(endFramePath, Buffer.from(generatedBase64, 'base64'));
  console.log(`\n✓ Generated 45° Frame B in ${durationSec}s!`);
  console.log(`  Saved to: ${endFramePath}`);

  // Telemetry log
  logSession({
    timestamp: new Date().toISOString(),
    sessionId: 'gmc-WA-003',
    model: 'gemini-3.1-flash-image',
    prompt: prompt.slice(0, 200) + '...',
    cost: 0.0672,
    duration: parseFloat(durationSec),
    status: 'success',
    traceId,
    aspectRatio: '9:16',
    resolution: '2K',
    gmcItemGroupId: 'WA-003',
    stage: 'generate_end_frame_45deg',
    endImageUrl: path.relative(process.cwd(), endFramePath)
  });
}

run().catch(err => {
  console.error('\n❌ ERROR:', err.message || err);
  process.exit(1);
});

