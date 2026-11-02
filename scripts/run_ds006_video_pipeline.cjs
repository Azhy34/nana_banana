#!/usr/bin/env node

/**
 * End-to-End Video Ad Pipeline for DS-006 (Elefanten-Tapete)
 *
 * Steps:
 * 1. Generate Scene 1 Video (4s Omni Flash) from frame1_clean.png
 * 2. Generate Scene 2 Video (4s Omni Flash) from frame2_clean.png
 * 3. Splicing via FFmpeg (0.5s xfade) with single continuous Master Audio Bed
 *
 * Rules: Follows .agents/skills/creative-ad-auditor/SKILL.md
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

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

async function generateOmniClip(apiKey, inputImagePath, outputPath, prompt, stageName) {
  const base64Data = fs.readFileSync(inputImagePath).toString('base64');
  const traceId = crypto.randomBytes(16).toString('hex');

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

  console.log(`\n🎥 Generating clip: ${path.basename(outputPath)} (${stageName})...`);
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

  if (!videoBase64) {
    throw new Error('No video bytes returned by Gemini Omni 1.1 Flash');
  }

  fs.writeFileSync(outputPath, Buffer.from(videoBase64, 'base64'));
  const sizeMb = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`   ✓ Saved: ${outputPath} (${sizeMb} MB in ${durationSec}s)`);

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
    stage: stageName,
    outputFile: path.relative(process.cwd(), outputPath)
  });
}

async function run() {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');

  const runDir = path.join(process.cwd(), 'runs', 'GMC-DS-006_creative');
  const frame1Clean = path.join(runDir, 'frame1_clean.png');
  const frame2Clean = path.join(runDir, 'frame2_clean.png');

  const scene1Video = path.join(runDir, 'scene1_flight.mp4');
  const scene2Video = path.join(runDir, 'scene2_flight.mp4');
  const finalAd = path.join(runDir, 'commercial_ad_elefanten_master.mp4');

  const prompt1 = `A smooth, slow, architectural Steadicam push-in gliding forward into the nursery towards the elephant savanna wallpaper mural.

GEOMETRIC & FURNITURE LOCK:
- The natural wooden slatted crib, white bedding, bare light oak floorboards, and room architecture remain 100% frozen, solid, and geometrically locked.
- Zero warping, zero morphing, zero shifting furniture.
- Realistic 3D camera parallax: the wooden crib gently glides past as the camera moves forward into the room space.

INANIMATE 2D INK LOCK:
- The wallpaper design (Elefanten-Tapete with mama and baby elephant in savanna) is strictly flat 2D printed ink on textured wallpaper.
- Absolutely NO biological animation, NO flapping ears, NO moving animals, and NO morphing illustrations.

LIGHTING & DEPTH:
- Warm natural morning sunlight streams in from the tall window on the left, casting soft realistic ambient shadows across the clean floorboards and grazing the matte non-woven paper texture.

AUDIO & SOUNDSCAPE:
- Gentle, calming acoustic nursery soundscape. Soft, soothing acoustic guitar notes with warm peaceful room acoustics.`;

  const prompt2 = `A slow, ultra-smooth architectural Steadicam camera glide moving forward diagonally along the feature wall towards the sunlit window, framing the mama and baby elephant.

GEOMETRIC LOCK:
- The room architecture, floorboards, and window frame remain 100% frozen, solid, and locked.
- Zero shifting, zero disappearing elements.

INANIMATE 2D INK LOCK:
- The mama and baby elephant illustration is strictly flat 2D printed ink on textured non-woven wallpaper.
- Absolutely NO biological animation, NO moving animals, NO flapping ears.

LIGHTING & DEPTH:
- Warm natural morning sunlight streams in from the tall window on the left, casting soft realistic shadows and grazing the matte paper relief.

AUDIO & SOUNDSCAPE:
- Gentle, calming acoustic nursery soundscape with soft acoustic guitar notes.`;

  // Step 1: Generate Scene 1 Video
  await generateOmniClip(apiKey, frame1Clean, scene1Video, prompt1, 'omni_flight_ds006_scene1');

  // Step 2: Generate Scene 2 Video
  await generateOmniClip(apiKey, frame2Clean, scene2Video, prompt2, 'omni_flight_ds006_scene2');

  // Step 3: FFmpeg Assembly
  console.log('\n' + '='.repeat(70));
  console.log('🎬 ASSEMBLING COMMERCIAL AD (Single Master Audio Bed)');
  console.log('='.repeat(70));

  const s1Temp = path.join(runDir, 'temp_s1.mp4');
  const s2Temp = path.join(runDir, 'temp_s2.mp4');

  console.log('[1/3] Trimming & muting Scene 1 (0.0s - 3.5s)...');
  execFileSync(ffmpeg, [
    '-y', '-ss', '0', '-t', '3.5', '-i', scene1Video,
    '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24',
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', s1Temp
  ]);

  console.log('[2/3] Trimming & muting Scene 2 (0.0s - 3.5s)...');
  execFileSync(ffmpeg, [
    '-y', '-ss', '0', '-t', '3.5', '-i', scene2Video,
    '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24',
    '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', s2Temp
  ]);

  console.log('[3/3] Splicing video with 0.5s xfade + binding master audio bed...');
  execFileSync(ffmpeg, [
    '-y',
    '-i', s1Temp,
    '-i', s2Temp,
    '-ss', '0', '-t', '6.5', '-i', scene1Video,
    '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=0.5:offset=3.0[v];[2:a]afade=t=out:st=6.0:d=0.5[a]',
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-pix_fmt', 'yuv420p',
    finalAd
  ]);

  try { fs.unlinkSync(s1Temp); } catch {}
  try { fs.unlinkSync(s2Temp); } catch {}

  const finalMb = (fs.statSync(finalAd).size / 1024 / 1024).toFixed(2);
  console.log(`\n🎉 FINAL COMMERCIAL AD READY!`);
  console.log(`   File:     ${finalAd} (${finalMb} MB)`);
  console.log(`   Duration: 6.5s (2 scenes + 0.5s smooth crossfade)`);
  console.log(`   Audio:    Seamless master audio track (zero clashes)`);
}

run().catch(err => {
  console.error('\n❌ PIPELINE ERROR:', err.message || err);
  process.exit(1);
});

