#!/usr/bin/env node

/**
 * Generate Clean Frame 1 for DS-006 (Elefanten-Tapete)
 *
 * Task:
 * Remove the paper/fabric storage bag to the left of the crib,
 * leaving clean natural wooden floorboards while preserving 1:1 wallpaper and crib geometry.
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
  const runDir = path.join(process.cwd(), 'runs', 'GMC-DS-006_creative');
  fs.mkdirSync(runDir, { recursive: true });

  const inputFramePath = path.join(process.cwd(), 'scratch', 'ds006', 'elefanten-in-der-savanne-3-1536.webp');
  const muralPath = path.join(process.cwd(), 'scratch', 'ds006', 'elefanten-in-der-savanne-1-1254.webp');
  const cleanFramePath = path.join(runDir, 'frame1_clean.png');

  // Also download mural 1 if missing
  if (!fs.existsSync(muralPath)) {
    console.log('Downloading 2D mural reference...');
    const res = await fetch('https://moonbloomwalls.com/img/elefanten-in-der-savanne-1-1254.webp');
    fs.writeFileSync(muralPath, Buffer.from(await res.arrayBuffer()));
  }

  const inputBase64 = fs.readFileSync(inputFramePath).toString('base64');
  const muralBase64 = fs.readFileSync(muralPath).toString('base64');

  const prompt = `Surgical object removal and clean architectural reframing within the EXACT SAME nursery interior from REFERENCE_IMAGE_1.
REFERENCE_IMAGE_1 shows the starting scene: an authentic nursery with a natural solid wood slatted crib, light oak wooden flooring, warm window daylight, and the savannah elephant wallpaper mural.
REFERENCE_IMAGE_2 shows the 1:1 flat wallpaper artwork (Elefanten-Tapete mit Mama und Baby).

CRITICAL REMOVAL (CLEAN FLOOR):
- Strictly REMOVE the storage paper sack / fabric toy bag standing on the floor to the left of the wooden crib.
- Replace that area with clean, empty, bare light natural wooden floorboards matching the rest of the flooring seamlessly.
- Soft, natural morning ambient light and realistic subtle floor shadows under the crib legs.
- Zero sacks, zero bags, zero baskets, zero clutter on the floor.

RIGID CONTINUITY & ARCHITECTURAL LOCK:
- The natural wooden slatted crib, white mattress, bedding, wall architecture, and tall window on the left must remain 100% physically identical.
- The wallpaper on the feature wall must be an exact 1:1 continuation of REFERENCE_IMAGE_2: watercolor savannah landscape with mama and baby elephant, gentle mountain horizon, and warm morning sun in ochre, sand, and sage green tones.
- INANIMATE 2D INK LOCK: Flat static wallpaper ink printed on tactile non-woven paper. Absolutely NO biological animation, NO moving elephants.
- High-end architectural editorial nursery photography, tack sharp, 9:16 vertical.`;

  const negativePrompt =
    "paper bag, storage sack, fabric sack, laundry bag, toy bag, paper sack next to crib, floor clutter, trash bag, wicker basket, woven basket, house bed, roof frame over bed, plastic toys, distorted furniture, cartoon, CGI, blurry, low quality";

  console.log('='.repeat(70));
  console.log('🎨 GENERATING CLEAN FRAME 1 (Bag Removed, Floor Clean)');
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Model:        gemini-3.1-flash-image`);
  console.log(`Resolution:   2K (9:16 portrait)`);
  console.log(`Input:        ${path.relative(process.cwd(), inputFramePath)}`);
  console.log(`Output:       ${path.relative(process.cwd(), cleanFramePath)}`);
  console.log('='.repeat(70));

  const ai = new GoogleGenAI({ apiKey });
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: {
      parts: [
        { text: "REFERENCE_IMAGE_1 (room interior): preserve this exact room, wooden crib, floorboards, and window lighting." },
        { inlineData: { data: inputBase64, mimeType: 'image/webp' } },
        { text: "REFERENCE_IMAGE_2 (flat wallpaper design): map this exact 1:1 savannah elephant mural onto the feature wall." },
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

  let outputBase64 = null;
  const candidates = response.candidates || [];
  for (const cand of candidates) {
    const parts = cand.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        outputBase64 = part.inlineData.data;
        break;
      }
    }
    if (outputBase64) break;
  }

  if (!outputBase64) {
    throw new Error('No image returned by Gemini 3.1 Flash Image');
  }

  fs.writeFileSync(cleanFramePath, Buffer.from(outputBase64, 'base64'));
  const sizeMb = (fs.statSync(cleanFramePath).size / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ CLEAN FRAME 1 GENERATED!`);
  console.log(`   File:     ${cleanFramePath} (${sizeMb} MB)`);
  console.log(`   Time:     ${durationSec}s`);
  console.log(`   Cost:     ~$0.0672 USD`);

  // Copy to artifact directory for immediate user review
  const artifactDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Mikhail', '.gemini', 'antigravity', 'brain', '648e08b6-33ad-45f1-b770-5d3ad3a980fc');
  const artifactDest = path.join(artifactDir, 'ds006_frame1_clean.png');
  fs.copyFileSync(cleanFramePath, artifactDest);

  logSession({
    timestamp: new Date().toISOString(),
    sessionId: 'gmc-DS-006',
    model: 'gemini-3.1-flash-image',
    prompt: prompt.slice(0, 200) + '...',
    cost: 0.0672,
    duration: parseFloat(durationSec),
    status: 'success',
    traceId,
    aspectRatio: '9:16',
    resolution: '2K',
    gmcItemGroupId: 'DS-006',
    stage: 'clean_frame1_bag_removal',
    outputFile: path.relative(process.cwd(), cleanFramePath)
  });
}

run().catch(err => {
  console.error('\n❌ ERROR:', err.message || err);
  process.exit(1);
});

