#!/usr/bin/env node

/**
 * Re-assemble Elefanten Commercial Ad with:
 * 1. Ultra-slow Scene 1 (scene1_slow_flight.mp4)
 * 2. Scene 2 (scene2_flight.mp4)
 * 3. 0.5s smooth crossfade
 * 4. FULL 6.5s continuous acoustic guitar master track (zero cutoffs, zero silence)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const runDir = path.join(process.cwd(), 'runs', 'GMC-DS-006_creative');
const s1Slow = path.join(runDir, 'scene1_slow_flight.mp4');
const s2 = path.join(runDir, 'scene2_flight.mp4');
const masterAudioSource = path.join(process.cwd(), 'runs', 'GMC-WA-003_keyframe', 'test1_omni_camera_flight.mp4');

const outputAd = path.join(runDir, 'commercial_ad_elefanten_v2_smooth.mp4');

console.log('='.repeat(70));
console.log('🎬 RE-ASSEMBLING SMOOTH ELEFANTEN AD (V2)');
console.log(`Scene 1 (Slow): ${path.relative(process.cwd(), s1Slow)}`);
console.log(`Scene 2:        ${path.relative(process.cwd(), s2)}`);
console.log(`Master Audio:   ${path.relative(process.cwd(), masterAudioSource)}`);
console.log(`Output:         ${path.relative(process.cwd(), outputAd)}`);
console.log('='.repeat(70));

const s1Temp = path.join(runDir, 'temp_s1_v2.mp4');
const s2Temp = path.join(runDir, 'temp_s2_v2.mp4');

// 1. Normalize Scene 1 to 3.5s @ 720x1280 24fps
console.log('\n[1/3] Trimming Scene 1 (0.0s - 3.5s)...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '3.5',
  '-i', s1Slow,
  '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24',
  '-an',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  s1Temp
]);

// 2. Normalize Scene 2 to 3.5s @ 720x1280 24fps
console.log('[2/3] Trimming Scene 2 (0.0s - 3.5s)...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '3.5',
  '-i', s2,
  '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24',
  '-an',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  s2Temp
]);

// 3. Splicing with 0.5s xfade + binding continuous 10s audio source trimmed to 6.5s
console.log('[3/3] Splicing video + binding continuous 6.5s master acoustic bed...');
execFileSync(ffmpeg, [
  '-y',
  '-i', s1Temp,
  '-i', s2Temp,
  '-ss', '0',
  '-t', '6.5',
  '-i', masterAudioSource, // 10.03s long audio track!
  '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=0.5:offset=3.0[v];[2:a]afade=t=out:st=6.0:d=0.5[a]',
  '-map', '[v]',
  '-map', '[a]',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-pix_fmt', 'yuv420p',
  outputAd
]);

try { fs.unlinkSync(s1Temp); } catch {}
try { fs.unlinkSync(s2Temp); } catch {}

const sizeMb = (fs.statSync(outputAd).size / 1024 / 1024).toFixed(2);
console.log(`\n🎉 AD V2 SMOOTH ASSEMBLED SUCCESSFULLY!`);
console.log(`   File:     ${outputAd} (${sizeMb} MB)`);
console.log(`   Duration: 6.5s`);
console.log(`   Camera:   Ultra-slow calm crawl speed`);
console.log(`   Audio:    100% continuous acoustic guitar without any cutoffs`);

