#!/usr/bin/env node

/**
 * Scene 2: Generate 4-Second Camera Flight for 45-Degree Toddler Room
 *
 * Model: gemini-omni-1.1-flash
 * Input: runs/GMC-WA-003_2668a02f/frame_start.webp (45° angle toddler room with table & chairs)
 * Duration: 4s (Bounded duration to prevent unanchored hallucination / glitches)
 * Output: runs/GMC-WA-003_keyframe/scene2_45deg_flight.mp4
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

  const inputPath = path.join(process.cwd(), 'runs', 'GMC-WA-003_2668a02f', 'frame_start.webp');
  const outputPath = path.join(runDir, 'scene2_45deg_flight.mp4');

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input image missing at: ${inputPath}`);
  }

  const base64Data = fs.readFileSync(inputPath).toString('base64');

  const prompt = `A slow, ultra-smooth architectural Steadicam camera glide moving forward diagonally along the feature wall towards the sunlit window in this toddler room.

GEOMETRIC & FURNITURE LOCK:
- The round wooden play table, two sculpted wooden chairs, low cubby toy shelf, floor bed, olive curtains, and textured green rug remain 100% frozen, solid, and geometrically locked.
- Absolute zero morphing, zero shifting, zero disappearing objects.
- Natural subtle 3D camera parallax as the camera gently glides forward.

INANIMATE 2D PRINT LOCK:
- The wallpaper mural (Salbei Nebelwald watercolor pine forest with flying birds) is strictly flat 2D printed ink on textured non-woven wallpaper.
- Absolutely NO biological animation, NO flapping wings, NO moving trees, and NO morphing illustrations.

LIGHTING & DEPTH:
- Warm natural morning daylight streams in from the tall window on the right, casting soft realistic ambient shadows across the green rug and grazing the matte non-woven paper texture.

AUDIO & SOUNDSCAPE:
- Gentle, calming acoustic nursery soundscape. Soft, soothing acoustic guitar notes with warm peaceful room acoustics.`;

  console.log('='.repeat(70));
  console.log(`🎥 SCENE 2: 45° TODDLER ROOM CAMERA FLIGHT (Gemini Omni 1.1)`);
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Model:        gemini-omni-1.1-flash`);
  console.log(`Resolution:   720p (9:16 portrait)`);
  console.log(`Duration:     4 seconds (bounded limit)`);
  console.log(`Input:        ${path.relative(process.cwd(), inputPath)}`);
  console.log(`Output:       ${path.relative(process.cwd(), outputPath)}`);
  console.log('='.repeat(70));

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;

  const payload = {
    model: 'gemini-omni-1.1-flash',
    input: [
      {
        type: 'image',
        data: base64Data,
        mime_type: 'image/webp'
      },
      {
        type: 'text',
        text: prompt
      }
    ],
    response_format: {
      type: 'video',
      resolution: '720p',
      aspect_ratio: '9:16',
      duration: '4s'
    }
  };

  console.log('\n[1/2] Sending request to Google Interactions API (duration: 4s)...');
  const startTime = Date.now();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!response.ok) {
    let errBody = '';
    try { errBody = await response.text(); } catch {}
    // If duration string is rejected in beta, retry without it or fallback
    throw new Error(`Interactions API failed (${response.status}): ${errBody}`);
  }

  console.log(`[2/2] Processing response (${durationSec}s)...`);
  const interaction = await response.json();

  let videoBase64 = null;
  if (interaction.output_video && interaction.output_video.data) {
    videoBase64 = interaction.output_video.data;
  } else if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (step.type === 'model_output' && Array.isArray(step.content)) {
        for (const item of step.content) {
          if (item.type === 'video' && item.data) {
            videoBase64 = item.data;
            break;
          }
        }
      }
      if (videoBase64) break;
    }
  }

  if (!videoBase64) {
    throw new Error('No video bytes received in Omni 1.1 response.');
  }

  fs.writeFileSync(outputPath, Buffer.from(videoBase64, 'base64'));
  const fileSizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);

  console.log(`\n✅ SCENE 2 VIDEO GENERATED SUCCESSFULLY!`);
  console.log(`   File:      ${outputPath} (${fileSizeMb} MB)`);
  console.log(`   Time:      ${durationSec}s`);
  console.log(`   Cost:      ~$0.40 USD`);

  // Telemetry log
  logSession({
    timestamp: new Date().toISOString(),
    sessionId: 'gmc-WA-003',
    model: 'gemini-omni-1.1-flash',
    prompt: prompt.slice(0, 200) + '...',
    cost: 0.40,
    duration: parseFloat(durationSec),
    status: 'success',
    traceId,
    aspectRatio: '9:16',
    resolution: '720p',
    durationSeconds: 4,
    gmcItemGroupId: 'WA-003',
    stage: 'omni_flight_scene2_45deg',
    interactionId: interaction.id,
    outputFile: path.relative(process.cwd(), outputPath)
  });
}

run().catch(err => {
  console.error('\n❌ PIPELINE ERROR:', err.message || err);
  process.exit(1);
});

