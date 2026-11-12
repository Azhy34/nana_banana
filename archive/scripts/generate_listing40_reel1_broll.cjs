#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function getApiKey() {
  if (process.env.KIE_API_KEY) return process.env.KIE_API_KEY.trim();
  if (fs.existsSync('.env.local')) {
    const env = fs.readFileSync('.env.local', 'utf8');
    const m = env.match(/KIE_API_KEY=([^\r\n]+)/);
    if (m && m[1].trim()) return m[1].trim();
  }
  throw new Error('KIE_API_KEY not found in process.env or .env.local');
}

async function uploadFile(filePath, apiKey) {
  console.log(`[Upload] Uploading ${path.basename(filePath)} to KIE temp CDN...`);
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1) || 'png';
  const base64Data = `data:image/${ext};base64,` + buf.toString('base64');
  const fileName = path.basename(filePath);

  const res = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base64Data,
      uploadPath: 'nana-banana/listing40',
      fileName
    })
  });
  const data = await res.json();
  if (!data.success && data.code !== 200) {
    throw new Error(`Upload failed: ${JSON.stringify(data)}`);
  }
  console.log(`[Upload] Success! URL: ${data.data.downloadUrl}`);
  return data.data.downloadUrl;
}

async function pollTask(taskId, apiKey, timeoutSec = 360) {
  console.log(`[Poll] Monitoring task ${taskId} (max ${timeoutSec}s)...`);
  const start = Date.now();
  while ((Date.now() - start) < timeoutSec * 1000) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const info = await res.json();
    if (info.code !== 200) {
      console.warn(`[Poll] Non-200 code:`, info);
      continue;
    }
    const state = info.data?.state;
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[Poll] ${elapsed}s: State = ${state}`);

    if (state === 'success') {
      const resultUrls = info.data?.response?.resultUrls || [];
      if (!resultUrls.length) {
        try {
          const parsed = JSON.parse(info.data?.resultJson || '{}');
          if (parsed.resultUrls) resultUrls.push(...parsed.resultUrls);
        } catch (_) {}
      }
      return {
        url: resultUrls[0],
        costTime: info.data?.costTime,
        creditsConsumed: info.data?.creditsConsumed
      };
    }
    if (state === 'fail') {
      throw new Error(`Task failed: code=${info.data?.failCode}, msg=${info.data?.failMsg}`);
    }
  }
  throw new Error(`Task timed out after ${timeoutSec}s`);
}

async function downloadFile(url, destPath) {
  console.log(`[Download] Downloading ${url} -> ${destPath}...`);
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buf));
  console.log(`[Download] Saved ${destPath} (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}

const BASE_DIR = 'C:/Users/Mikhail/Desktop/Обои/Листинг 40/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';
const ART_DIR = 'C:/Users/Mikhail/.gemini/antigravity/brain/648e08b6-33ad-45f1-b770-5d3ad3a980fc';

const REEL1_TASKS = [
  {
    num: 1,
    title: 'Reel 1 Scene 1: Lateral Slider Parallax (Left to Right) - Birch Bed & Flower Table',
    inputImage: path.join(BASE_DIR, 'l40_funhaus_01_9x16_scallop_wooden_bed.png'),
    outputPath: path.join(BASE_DIR, 'l40_broll_01_scallop_bed_slide_5s.mp4'),
    artPath: path.join(ART_DIR, 'l40_broll_01_scallop_bed_slide_5s.mp4'),
    prompt: [
      "Smooth cinematic camera slider tracking shot gliding slowly horizontally from left to right along the X-axis, parallel to the wall.",
      "The movement creates a subtle, beautiful foreground parallax with the wooden flower craft table and donut poufs gliding in front of the natural birch toddler bed.",
      "Zero camera rotation, zero arc, rock-solid optical horizon.",
      "GEOMETRIC & FURNITURE LOCK: The natural birch toddler bed with vertical wooden rails, flower craft table, wax crayons, poufs, nightstand, and parquet floor remain 100% frozen, rigid, and geometrically locked with zero distortion.",
      "INANIMATE 2D INK LOCK: The sage green and cream vertical striped wallpaper and red scalloped wave border on the wall are flat printed ink on matte paper. Completely static 2D artwork, zero morphing stripes, zero waving edges.",
      "Warm morning sunlight grazes across the wallpaper surface."
    ].join(" ")
  },
  {
    num: 2,
    title: 'Reel 1 Scene 2: Slow Forward Push-In - Flower Craft Table & Pencils Lifestyle',
    inputImage: path.join(BASE_DIR, 'l40_funhaus_02_9x16_scallop_play_table_lifestyle.png'),
    outputPath: path.join(BASE_DIR, 'l40_broll_02_scallop_table_push_5s.mp4'),
    artPath: path.join(ART_DIR, 'l40_broll_02_scallop_table_push_5s.mp4'),
    prompt: [
      "Ultra-slow cinematic Steadicam forward push-in shot along the central Z-axis moving towards the playful craft table and wallpaper wall.",
      "The camera glides forward steadily at a snail's pace, maintaining rock-solid optical stability.",
      "GEOMETRIC & FURNITURE LOCK: The flower-shaped birch wooden table, colored pencils in cups, open drawing book, wooden building blocks, donut poufs, toy shelf, and rug remain 100% rigid, frozen, and geometrically locked with zero shifting parts.",
      "INANIMATE 2D INK LOCK: The sage green and cream striped wallpaper and terracotta scalloped wave border on the wall are strictly flat printed ink on matte non-woven paper. Completely static 2D pattern, zero biological animation, zero morphing stripes.",
      "Warm morning sunbeam grazes softly across the textured wallpaper mural."
    ].join(" ")
  }
];

async function main() {
  const apiKey = getApiKey();

  // Credit check
  const credRes = await fetch('https://api.kie.ai/api/v1/chat/credit', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const credData = await credRes.json();
  console.log(`[Credits] Starting balance: ${credData.data} credits`);

  for (const t of REEL1_TASKS) {
    console.log('\n' + '='.repeat(75));
    console.log(`🎬 GENERATING ${t.title}`);
    console.log(`Input:  ${t.inputImage}`);
    console.log(`Output: ${t.outputPath}`);
    console.log('='.repeat(75));

    if (!fs.existsSync(t.inputImage)) {
      throw new Error(`Input image not found: ${t.inputImage}`);
    }

    // 1. Upload
    const uploadedUrl = await uploadFile(t.inputImage, apiKey);

    // 2. Submit task
    const payload = {
      model: 'kling-2.6/image-to-video',
      input: {
        prompt: t.prompt,
        image_urls: [uploadedUrl],
        sound: false,
        duration: '5'
      }
    };

    console.log(`[Task] Submitting generation for model ${payload.model}...`);
    const taskRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const taskData = await taskRes.json();
    if (taskData.code !== 200 || !taskData.data?.taskId) {
      throw new Error(`Failed to create task: ${JSON.stringify(taskData)}`);
    }

    const taskId = taskData.data.taskId;
    console.log(`[Task] Created successfully! Task ID: ${taskId}`);

    // 3. Poll
    const result = await pollTask(taskId, apiKey, 360);
    console.log(`[Task] Finished! Cost: ${result.creditsConsumed || 55} credits in ${result.costTime || 'N/A'}s.`);
    console.log(`[Task] Video URL: ${result.url}`);

    // 4. Download
    await downloadFile(result.url, t.outputPath);
    fs.copyFileSync(t.outputPath, t.artPath);
    console.log(`✓ Copied to artifacts: ${t.artPath}`);

    // 5. Cooldown
    console.log('[Cooldown] Waiting 3s before next task...');
    await new Promise(r => setTimeout(r, 3000));
  }

  // Final Credit check
  const finalCredRes = await fetch('https://api.kie.ai/api/v1/chat/credit', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const finalCredData = await finalCredRes.json();
  console.log(`\n🎉 REEL 1 B-ROLL PACK GENERATED! Final balance: ${finalCredData.data} credits`);
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

