#!/usr/bin/env node

/**
 * Generate Clean Frames 1 & 2 for DS-006 (Elefanten-Tapete)
 *
 * Task:
 * 1. Frame 1: Remove the storage paper sack to the left of the crib.
 * 2. Frame 2: Remove the bag standing on the floor under the window on the left.
 *
 * Output: Both frames in vertical 9:16 format, tack sharp, 1:1 wallpaper fidelity.
 * Model: gemini-3.1-flash-image
 * Cost: ~$0.134 (2 x $0.0672)
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

  const ai = new GoogleGenAI({ apiKey });
  const runDir = path.join(process.cwd(), 'runs', 'GMC-DS-006_creative');
  fs.mkdirSync(runDir, { recursive: true });

  const artifactDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Mikhail', '.gemini', 'antigravity', 'brain', '648e08b6-33ad-45f1-b770-5d3ad3a980fc');

  const muralPath = path.join(process.cwd(), 'scratch', 'ds006', 'elefanten-in-der-savanne-1-1254.webp');
  if (!fs.existsSync(muralPath)) {
    console.log('Downloading 2D mural reference...');
    const res = await fetch('https://moonbloomwalls.com/img/elefanten-in-der-savanne-1-1254.webp');
    fs.writeFileSync(muralPath, Buffer.from(await res.arrayBuffer()));
  }
  const muralBase64 = fs.readFileSync(muralPath).toString('base64');

  const baseNegative =
    "paper bag, storage sack, fabric sack, laundry bag, toy bag, paper sack on floor, floor clutter, trash bag, wicker basket, woven basket, house bed, roof frame over bed, plastic toys, distorted furniture, cartoon, CGI, blurry, low quality";

  // ==========================================
  // GENERATE CLEAN FRAME 1 (Interior with crib)
  // ==========================================
  console.log('='.repeat(70));
  console.log('🎨 [1/2] GENERATING CLEAN FRAME 1 (Bag to the left of crib removed)');
  console.log('='.repeat(70));

  const frame1Input = path.join(process.cwd(), 'scratch', 'ds006', 'elefanten-in-der-savanne-3-1536.webp');
  const frame1Output = path.join(runDir, 'frame1_clean.png');
  const frame1Base64 = fs.readFileSync(frame1Input).toString('base64');

  const prompt1 = `Surgical object removal and clean architectural reframing within the EXACT SAME nursery interior from REFERENCE_IMAGE_1.
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

  const traceId1 = crypto.randomBytes(16).toString('hex');
  const startT1 = Date.now();

  const resp1 = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: {
      parts: [
        { text: "REFERENCE_IMAGE_1 (room interior): preserve this exact room, wooden crib, floorboards, and window lighting." },
        { inlineData: { data: frame1Base64, mimeType: 'image/webp' } },
        { text: "REFERENCE_IMAGE_2 (flat wallpaper design): map this exact 1:1 savannah elephant mural onto the feature wall." },
        { inlineData: { data: muralBase64, mimeType: 'image/webp' } },
        { text: prompt1 }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: '9:16',
        imageSize: '2K',
        negativePrompt: baseNegative
      }
    }
  });

  const dur1 = ((Date.now() - startT1) / 1000).toFixed(1);
  let base64_1 = null;
  for (const c of resp1.candidates || []) {
    for (const p of c.content?.parts || []) {
      if (p.inlineData?.data) { base64_1 = p.inlineData.data; break; }
    }
    if (base64_1) break;
  }

  if (!base64_1) throw new Error('Failed to generate Clean Frame 1');
  fs.writeFileSync(frame1Output, Buffer.from(base64_1, 'base64'));
  fs.copyFileSync(frame1Output, path.join(artifactDir, 'ds006_frame1_clean.png'));
  console.log(`✓ Clean Frame 1 saved in ${dur1}s (${(fs.statSync(frame1Output).size / 1024 / 1024).toFixed(2)} MB)`);

  // ==========================================
  // GENERATE CLEAN FRAME 2 (Macro Mama & Baby)
  // ==========================================
  console.log('\n' + '='.repeat(70));
  console.log('🎨 [2/2] GENERATING CLEAN FRAME 2 (Bag under the window removed)');
  console.log('='.repeat(70));

  const frame2Input = path.join(process.cwd(), 'scratch', 'ds006', 'elefanten-in-der-savanne-5-1254.webp');
  const frame2Output = path.join(runDir, 'frame2_clean.png');
  const frame2Base64 = fs.readFileSync(frame2Input).toString('base64');

  const prompt2 = `Surgical object removal and clean vertical reframing (9:16 portrait) within the EXACT SAME scene from REFERENCE_IMAGE_1.
REFERENCE_IMAGE_1 shows the close-up scene of the nursery wall featuring the mama elephant and baby elephant, with a tall window on the left.
REFERENCE_IMAGE_2 shows the 1:1 flat wallpaper artwork (Elefanten-Tapete mit Mama und Baby).

CRITICAL REMOVAL (CLEAN FLOOR UNDER WINDOW):
- Strictly REMOVE the storage paper sack / fabric bag standing on the floor under the window on the left.
- Replace that area with clean, empty natural wooden floorboards matching the room flooring.
- Soft, realistic grazing morning sunlight streaming in through the window, revealing the physical matte paper texture.
- Zero sacks, zero bags, zero clutter on the floor.

RIGID CONTINUITY & ARCHITECTURAL LOCK:
- The mama elephant and baby elephant illustration on the wall must be perfectly clear, prominent, and preserved 1:1 from REFERENCE_IMAGE_2.
- The tall window on the left and the floorboards remain 100% authentic to the room architecture.
- INANIMATE 2D INK LOCK: Flat static 2D printed ink on tactile non-woven wallpaper. Absolutely NO biological animation.
- High-end architectural nursery photography, editorial style, 9:16 vertical portrait, tack sharp.`;

  const traceId2 = crypto.randomBytes(16).toString('hex');
  const startT2 = Date.now();

  const resp2 = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image',
    contents: {
      parts: [
        { text: "REFERENCE_IMAGE_1 (close-up scene): preserve this room composition, window lighting, and wallpaper." },
        { inlineData: { data: frame2Base64, mimeType: 'image/webp' } },
        { text: "REFERENCE_IMAGE_2 (flat wallpaper design): map this exact 1:1 savannah elephant mural onto the feature wall." },
        { inlineData: { data: muralBase64, mimeType: 'image/webp' } },
        { text: prompt2 }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: '9:16',
        imageSize: '2K',
        negativePrompt: baseNegative
      }
    }
  });

  const dur2 = ((Date.now() - startT2) / 1000).toFixed(1);
  let base64_2 = null;
  for (const c of resp2.candidates || []) {
    for (const p of c.content?.parts || []) {
      if (p.inlineData?.data) { base64_2 = p.inlineData.data; break; }
    }
    if (base64_2) break;
  }

  if (!base64_2) throw new Error('Failed to generate Clean Frame 2');
  fs.writeFileSync(frame2Output, Buffer.from(base64_2, 'base64'));
  fs.copyFileSync(frame2Output, path.join(artifactDir, 'ds006_frame2_clean.png'));
  console.log(`✓ Clean Frame 2 saved in ${dur2}s (${(fs.statSync(frame2Output).size / 1024 / 1024).toFixed(2)} MB)`);

  console.log('\n' + '='.repeat(70));
  console.log('🎉 BOTH CLEAN FRAMES READY FOR VIDEO GENERATION!');
  console.log(`Frame 1: ${frame1Output}`);
  console.log(`Frame 2: ${frame2Output}`);
  console.log('='.repeat(70));
}

run().catch(err => {
  console.error('\n❌ ERROR:', err.message || err);
  process.exit(1);
});

