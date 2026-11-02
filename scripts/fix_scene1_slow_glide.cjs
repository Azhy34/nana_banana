#!/usr/bin/env node

/**
 * Regenerate Scene 1 with Ultra-Slow, Tranquil Micro-Glide (Zero rushing)
 *
 * Model: gemini-omni-1.1-flash
 * Input: runs/GMC-DS-006_creative/frame1_clean.png
 * Duration: 4s
 * Output: runs/GMC-DS-006_creative/scene1_slow_flight.mp4
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
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const traceId = crypto.randomBytes(16).toString('hex');
  const runDir = path.join(process.cwd(), 'runs', 'GMC-DS-006_creative');
  const inputPath = path.join(runDir, 'frame1_clean.png');
  const outputPath = path.join(runDir, 'scene1_slow_flight.mp4');

  const base64Data = fs.readFileSync(inputPath).toString('base64');

  const prompt = `An ultra-slow, buttery-smooth, cinematic architectural micro-push-in gliding forward at a tranquil, calming crawl speed along the Z-axis.

PACING & SLOW MOTION:
- Barely perceptible, tranquil, peaceful movement: the camera drifts forward only a few inches over the entire 4-second duration (less than 5% scale drift).
- Absolutely ZERO fast zooming, ZERO rushing, ZERO camera acceleration, ZERO sudden motion.
- Completely stable, serene, slow-motion Steadicam glide like a high-end luxury architectural film on Arri Alexa.

GEOMETRIC & FURNITURE LOCK:
- The natural wooden slatted crib, white bedding, bare light oak floorboards, and room architecture remain 100% frozen, solid, and geometrically locked.
- Zero warping, zero morphing, zero shifting furniture slats.

INANIMATE 2D INK LOCK:
- The wallpaper mural (Elefanten-Tapete with mama and baby elephant in savanna) is strictly flat 2D printed ink on textured wallpaper.
- Absolutely NO biological animation, NO flapping ears, NO moving animals.

LIGHTING & ATMOSPHERE:
- Warm natural morning sunlight streams in from the tall window on the left, casting soft, motionless ambient shadows across the clean floorboards.`;

  console.log('='.repeat(70));
  console.log(`🎥 REGENERATING SCENE 1 (Ultra-Slow Tranquil Micro-Glide)`);
  console.log(`Trace ID:     ${traceId}`);
  console.log(`Model:        gemini-omni-1.1-flash`);
  console.log(`Duration:     4 seconds`);
  console.log(`Input:        ${path.relative(process.cwd(), inputPath)}`);
  console.log(`Output:       ${path.relative(process.cwd(), outputPath)}`);
  console.log('='.repeat(70));

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`;
  const payload = {
    model: 'gemini-omni-1.1-flash',
    input: [
      { type: 'image', data: base64Data, mime_type: 'image/png' },
      { type: 'text', text: prompt }
    ],
    response_format: {
      type: 'video',
      resolution: '720p',
      aspect_ratio: '9:16',
      duration: '4s'
    }
  };

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
    throw new Error(`Interactions API failed (${response.status}): ${errBody}`);
  }

  const interaction = await response.json();
  let videoBase64 = null;
  if (interaction.output_video?.data) {
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

  if (!videoBase64) throw new Error('No video bytes received');
  fs.writeFileSync(outputPath, Buffer.from(videoBase64, 'base64'));

  console.log(`\n✅ SCENE 1 SLOW FLIGHT GENERATED!`);
  console.log(`   File: ${outputPath} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB in ${durationSec}s)`);

  logSession({
    timestamp: new Date().toISOString(),
    sessionId: 'gmc-DS-006',
    model: 'gemini-omni-1.1-flash',
    prompt: prompt.slice(0, 200) + '...',
    cost: 0.40,
    duration: parseFloat(durationSec),
    status: 'success',
    traceId,
    aspectRatio: '9:16',
    resolution: '720p',
    durationSeconds: 4,
    gmcItemGroupId: 'DS-006',
    stage: 'omni_flight_ds006_scene1_slow',
    outputFile: path.relative(process.cwd(), outputPath)
  });
}

run().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});

