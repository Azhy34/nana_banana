#!/usr/bin/env node

/**
 * Commercial Video Ad Assembler (Single Master Audio Bed Architecture)
 *
 * Rules:
 * 1. Visual scenes (Scene 1 Nursery + Scene 2 Toddler 45°) are spliced with cinematic xfade.
 * 2. Audio is strictly a SINGLE continuous master track across the entire video (never acrossfaded between different AI songs)
 *    to guarantee 100% harmonious sound without key, tempo, or phase clashes.
 * 3. Soft audio fade-out on the final 0.5 seconds.
 *
 * Tool: ffmpeg-static
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const runDir = path.join(process.cwd(), 'runs', 'GMC-WA-003_keyframe');

const scene1Input = path.join(runDir, 'test1_omni_camera_flight.mp4');
const scene2Input = path.join(runDir, 'scene2_45deg_flight.mp4');
const outputAd = path.join(runDir, 'commercial_ad_master.mp4');

if (!fs.existsSync(scene1Input) || !fs.existsSync(scene2Input)) {
  console.error('❌ Missing input files:');
  console.error('   Scene 1:', scene1Input, fs.existsSync(scene1Input));
  console.error('   Scene 2:', scene2Input, fs.existsSync(scene2Input));
  process.exit(1);
}

console.log('='.repeat(70));
console.log('🎬 MASTER VIDEO AD ASSEMBLER (Single Continuous Audio Bed)');
console.log(`FFmpeg:   ${ffmpeg}`);
console.log(`Scene 1:  ${path.relative(process.cwd(), scene1Input)}`);
console.log(`Scene 2:  ${path.relative(process.cwd(), scene2Input)}`);
console.log(`Output:   ${path.relative(process.cwd(), outputAd)}`);
console.log('='.repeat(70));

const s1Trimmed = path.join(runDir, 'temp_s1.mp4');
const s2Trimmed = path.join(runDir, 'temp_s2.mp4');

// 1. Normalize video streams to 720x1280 @ 24fps without audio interference
console.log('\n[1/3] Normalizing Scene 1 video (0.0s - 3.5s)...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '3.5',
  '-i', scene1Input,
  '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24',
  '-an',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  s1Trimmed
]);

console.log('[2/3] Normalizing Scene 2 video (0.0s - 3.5s)...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '3.5',
  '-i', scene2Input,
  '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=24',
  '-an',
  '-c:v', 'libx264',
  '-preset', 'fast',
  '-crf', '18',
  s2Trimmed
]);

// 2. Splice video with 0.5s xfade + bind single continuous audio master track
// Scene 1: 3.5s, Scene 2: 3.5s, Transition: 0.5s at 3.0s => Total duration = 6.5s
console.log('[3/3] Splicing video + binding continuous 6.5s master audio track...');
execFileSync(ffmpeg, [
  '-y',
  '-i', s1Trimmed,
  '-i', s2Trimmed,
  '-ss', '0',
  '-t', '6.5',
  '-i', scene1Input, // Continuous master audio source
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

// Clean up temp files
try { fs.unlinkSync(s1Trimmed); } catch {}
try { fs.unlinkSync(s2Trimmed); } catch {}

const sizeMb = (fs.statSync(outputAd).size / (1024 * 1024)).toFixed(2);
console.log('\n✅ MASTER AD ASSEMBLED SUCCESSFULLY!');
console.log(`   File:     ${outputAd} (${sizeMb} MB)`);
console.log(`   Duration: 6.5s (2 scenes + 0.5s smooth crossfade)`);
console.log(`   Audio:    100% continuous acoustic guitar track (zero cuts, zero clashes)`);
