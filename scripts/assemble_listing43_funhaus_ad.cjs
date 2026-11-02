const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const baseDir = 'C:/Users/Mikhail/Desktop/Обои/Листинг 43/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';
const s1Input = path.join(baseDir, 'kling_scene1_scallop_flight.mp4');
const s2Input = path.join(baseDir, 'kling_scene2_fullwall_flight.mp4');
const audioMasterSource = path.join(process.cwd(), 'runs', 'GMC-WA-003_keyframe', 'test1_omni_camera_flight.mp4');
const outputAd = path.join(baseDir, 'commercial_ad_funhaus_master.mp4');

console.log('='.repeat(75));
console.log('🎬 ASSEMBLING LISTING 43 FUN HAUS MASTER AD (Kling 2.6 Pro Full HD)');
console.log(`FFmpeg:    ${ffmpeg}`);
console.log(`Scene 1:   ${s1Input}`);
console.log(`Scene 2:   ${s2Input}`);
console.log(`Audio Bed: ${audioMasterSource}`);
console.log(`Output:    ${outputAd}`);
console.log('='.repeat(75));

if (!fs.existsSync(s1Input)) {
  throw new Error(`Scene 1 not found: ${s1Input}`);
}
if (!fs.existsSync(s2Input)) {
  throw new Error(`Scene 2 not found: ${s2Input}`);
}
if (!fs.existsSync(audioMasterSource)) {
  throw new Error(`Master audio source not found: ${audioMasterSource}`);
}

const s1Trimmed = path.join(baseDir, 'temp_funhaus_s1.mp4');
const s2Trimmed = path.join(baseDir, 'temp_funhaus_s2.mp4');
const audioTrack = path.join(baseDir, 'temp_funhaus_audio.aac');

// 1. Normalize Scene 1 (Kling 1072x1928 -> 1080x1920 @ 24fps)
console.log('\n[1/4] Normalizing Scene 1 (0.0s - 3.5s)...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '3.5',
  '-i', s1Input,
  '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
  '-r', '24',
  '-an',
  s1Trimmed
]);

// 2. Normalize Scene 2 (Kling 1072x1928 -> 1080x1920 @ 24fps)
console.log('\n[2/4] Normalizing Scene 2 (0.0s - 3.5s)...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '3.5',
  '-i', s2Input,
  '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
  '-r', '24',
  '-an',
  s2Trimmed
]);

// 3. Extract continuous 6.5s audio bed with 0.5s fade out
console.log('\n[3/4] Extracting continuous 6.5s acoustic guitar audio bed with soft fade-out...');
execFileSync(ffmpeg, [
  '-y',
  '-ss', '0',
  '-t', '6.5',
  '-i', audioMasterSource,
  '-vn',
  '-af', 'afade=t=out:st=6.0:d=0.5',
  '-c:a', 'aac',
  '-b:a', '192k',
  audioTrack
]);

// 4. Splice video with 0.5s xfade and mux continuous audio
console.log('\n[4/4] Splicing video xfade and multiplexing master audio...');
execFileSync(ffmpeg, [
  '-y',
  '-i', s1Trimmed,
  '-i', s2Trimmed,
  '-i', audioTrack,
  '-filter_complex', '[0:v][1:v]xfade=transition=fade:duration=0.5:offset=3.0,format=yuv420p[v]',
  '-map', '[v]',
  '-map', '2:a',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-profile:v', 'high',
  '-level:v', '4.1',
  '-crf', '18',
  '-preset', 'slow',
  '-c:a', 'copy',
  '-movflags', '+faststart',
  outputAd
]);

// Cleanup temp files
[s1Trimmed, s2Trimmed, audioTrack].forEach(f => {
  if (fs.existsSync(f)) fs.unlinkSync(f);
});

const stats = fs.statSync(outputAd);
console.log(`\n🎉 Assembly complete!`);
console.log(`File: ${outputAd}`);
console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

