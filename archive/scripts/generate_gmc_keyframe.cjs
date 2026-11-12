#!/usr/bin/env node

/**
 * Step 1: Generate Frame B (End Frame) for GMC Video Pipeline
 *
 * Takes:
 * - Start Frame (Frame A): salbei-nebelwald-5-1536.webp (Nursery with crib & changing table)
 * - Reference Mural: salbei-nebelwald-6-1800.webp (Flat 2D mural artwork)
 *
 * Generates:
 * - End Frame (Frame B): 9:16 portrait in the exact same room, closer to the feature wall.
 *
 * Model: gemini-3.1-flash-image
 * Cost: ~$0.0672
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

async function downloadIfMissing(url, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 1000) {
    return;
  }
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} downloading ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(destPath, buf);
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

  const startFrameUrl = 'https://moonbloomwalls.com/img/salbei-nebelwald-5-1536.webp';
  const muralUrl = 'https://moonbloomwalls.com/img/salbei-nebelwald-6-1800.webp';

  const startFramePath = path.join(runDir, 'frame_start.webp');
  const muralPath = path.join(runDir, 'wallpaper_mural.webp');
  const endFramePath = path.join(runDir, 'frame_end.png');

  console.log('='.repeat(70));
  console.log(`🎬 STEP 1: GENERATE FRAME B (END FRAME)`);
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Model:        gemini-3.1-flash-image`);
  console.log(`Aspect Ratio: 9:16 (2K)`);
  console.log(`Output:       ${path.relative(process.cwd(), endFramePath)}`);
  console.log('='.repeat(70));

  console.log('\n[1/3] Preparing reference assets...');
  await downloadIfMissing(startFrameUrl, startFramePath);
  await downloadIfMissing(muralUrl, muralPath);

  const startBase64 = fs.readFileSync(startFramePath).toString('base64');
  const muralBase64 = fs.readFileSync(muralPath).toString('base64');
  console.log('      ✓ Reference assets ready in memory.');

  console.log('\n[2/3] Submitting multimodal camera reframing request to Gemini...');

  const prompt = `Camera angle reframing within the EXACT SAME children's room interior from REFERENCE_IMAGE_1.
REFERENCE_IMAGE_1 shows the starting scene: an authentic lived-in nursery with a natural solid wood slatted crib, changing table dresser with open shelves, olive-green carpet, light oak floorboards, and the sage-green watercolor misty forest wallpaper mural on the feature wall.
REFERENCE_IMAGE_2 shows the 1:1 flat wallpaper design (Salbei Nebelwald with misty pine trees and flying birds).

INSTRUCTION:
Generate the ending keyframe of this EXACT SAME room, with the camera smoothly gliding 1.5 meters closer towards the feature wall, framing the wooden crib and wallpaper mural closer up with a gentle 10-degree diagonal reframing.

RIGID CONTINUITY & ARCHITECTURAL LOCK:
- Every piece of furniture present in REFERENCE_IMAGE_1 must remain 100% physically identical: the natural solid wood crib slats, the changing table dresser, the olive-green carpet, the wooden floorboards, and the window daylight.
- The wallpaper on the feature wall must be a seamless 1:1 match to REFERENCE_IMAGE_2: misty sage-green watercolor forest with flying birds.
- Same warm natural morning light and soft ambient shadows.
- Zero new furniture, zero disappearing objects, zero structural changes. Editorial interior photography, tack sharp, 9:16 portrait.`;

  const negativePrompt =
    "peeling wallpaper, wallpaper peeling off wall, corner curl, page curl, paper curl, house bed, house-frame bed, roof frame over bed, overhead frame beams, mounted animal heads, plush animal heads, stuffed animal heads, half-wall wallpaper, half-height wallpaper, two-tone wall, split wall, wainscoting, plastic toys, distorted furniture, messy room, low quality, seams, tiling, repeating wallpaper patterns, cheap 3D render look, cartoon style, CGI, blurry textures";

  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: {
      parts: [
        { text: "REFERENCE_IMAGE_1 (starting room keyframe): this is the starting room interior. Preserve its exact furniture, layout, materials, and lighting 100%." },
        { inlineData: { data: startBase64, mimeType: 'image/webp' } },
        { text: "REFERENCE_IMAGE_2 (wallpaper mural): this is the flat 2D wallpaper print. Map it seamlessly across the feature wall." },
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
  console.log(`\n[3/3] ✓ Generated Frame B in ${durationSec}s!`);
  console.log(`      Saved to: ${endFramePath}`);

  // Telemetry
  const cost = 0.0672;
  logSession({
    timestamp: new Date().toISOString(),
    sessionId: 'gmc-WA-003',
    model: 'gemini-3.1-flash-image',
    prompt: prompt.slice(0, 200) + '...',
    cost,
    duration: parseFloat(durationSec),
    status: 'success',
    traceId,
    aspectRatio: '9:16',
    resolution: '2K',
    gmcItemGroupId: 'WA-003',
    stage: 'generate_end_frame',
    startImageUrl: startFrameUrl,
    endImageUrl: path.relative(process.cwd(), endFramePath)
  });

  console.log(`\n📊 SUMMARY:`);
  console.log(`   Cost:        ~$${cost.toFixed(4)} USD`);
  console.log(`   Duration:    ${durationSec}s`);
  console.log(`   Start Frame: ${path.relative(process.cwd(), startFramePath)}`);
  console.log(`   End Frame:   ${path.relative(process.cwd(), endFramePath)}`);
  console.log(`   Telemetry:   Logged to gemini_sessions.json [traceId=${traceId}]`);
}

run().catch(err => {
  console.error('\n❌ ERROR:', err.message || err);
  process.exit(1);
});

