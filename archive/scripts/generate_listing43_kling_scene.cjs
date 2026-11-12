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
      uploadPath: 'nana-banana/listing43',
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

async function main() {
  const args = process.argv.slice(2);
  const sceneNum = args[0] || '1'; // '1' (Card 08 scallop) or '2' (Card 07 fullwall)

  const apiKey = getApiKey();

  // 1. Credit check
  const credRes = await fetch('https://api.kie.ai/api/v1/chat/credit', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const credData = await credRes.json();
  console.log(`[Credits] Current balance: ${credData.data} credits`);

  const baseDir = 'C:/Users/Mikhail/Desktop/Обои/Листинг 43/Fun Haus  Playful Interior  Dopamine Decor  Retro Kid';

  let inputImage, outputPath, prompt;

  if (sceneNum === '1') {
    inputImage = path.join(baseDir, 'funhaus_08_9x16_scallop_border_video_master.png');
    outputPath = path.join(baseDir, 'kling_scene1_scallop_flight.mp4');
    prompt = [
      "Ultra-slow cinematic Steadicam forward push-in shot along the central Z-axis moving towards the playful wallpaper wall.",
      "The camera glides forward steadily at a snail's pace, maintaining rock-solid optical stability.",
      "GEOMETRIC & FURNITURE LOCK: The vintage pastel blue metal bed, wooden flower craft table, wax crayons, and room architecture remain 100% rigid, frozen, and geometrically locked with zero distortion, zero bending, and zero shifting parts.",
      "INANIMATE 2D INK LOCK: The dusty rose and cream striped wallpaper and decorative red scalloped border trim on the wall are strictly flat printed ink on matte non-woven paper.",
      "Completely static 2D artwork, zero morphing illustrations, zero waving edges.",
      "Warm gentle morning sunlight grazes across the wallpaper texture creating authentic soft ambient shadows."
    ].join(" ");
  } else {
    inputImage = path.join(baseDir, 'funhaus_07_9x16_fullwall_video_master.png');
    outputPath = path.join(baseDir, 'kling_scene2_fullwall_flight.mp4');
    prompt = [
      "Ultra-slow cinematic Steadicam forward push-in shot along the central Z-axis moving towards the full-height striped wallpaper wall.",
      "The camera glides forward steadily at a snail's pace, maintaining rock-solid optical stability.",
      "GEOMETRIC & FURNITURE LOCK: The low natural solid birch toddler bed, wooden shelf, stack of circular donut poufs, and parquet floor remain 100% rigid, frozen, and geometrically locked with zero distortion and zero shifting parts.",
      "INANIMATE 2D INK LOCK: The dusty rose and cream vertical striped wallpaper covering the entire wall is strictly flat printed ink on matte non-woven paper.",
      "Completely static 2D pattern, zero biological animation, zero morphing lines.",
      "Warm morning sunlight grazes softly across the textured wallpaper mural."
    ].join(" ");
  }

  console.log('='.repeat(75));
  console.log(`🎬 GENERATING SCENE ${sceneNum} (Kling 2.6 Full HD)`);
  console.log(`Input:  ${inputImage}`);
  console.log(`Output: ${outputPath}`);
  console.log('='.repeat(75));

  // 2. Upload
  const uploadedUrl = await uploadFile(inputImage, apiKey);

  // 3. Payload
  const payload = {
    model: 'kling-2.6/image-to-video',
    input: {
      prompt,
      image_urls: [uploadedUrl],
      sound: false,
      duration: '5'
    }
  };

  console.log(`[Task] Submitting generation for model ${payload.model}...`);
  console.log(`[Task] Prompt: ${prompt.slice(0, 160)}...`);

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

  // 4. Poll
  const result = await pollTask(taskId, apiKey, 360);
  console.log(`[Task] Finished! Cost: ${result.creditsConsumed || 55} credits in ${result.costTime || 'N/A'}s.`);
  console.log(`[Task] Video URL: ${result.url}`);

  // 5. Download
  await downloadFile(result.url, outputPath);
  console.log(`[Complete] Saved ${outputPath}`);

  // 6. Logging
  const sessionLogPath = path.join(process.cwd(), 'gemini_sessions.json');
  try {
    let sessData = {};
    if (fs.existsSync(sessionLogPath)) {
      sessData = JSON.parse(fs.readFileSync(sessionLogPath, 'utf8') || '{}');
    }
    const sessionId = 'listing-43-funhaus';
    if (!sessData[sessionId]) {
      sessData[sessionId] = { createdTime: new Date().toISOString(), events: [] };
    }
    sessData[sessionId].events.push({
      timestamp: new Date().toISOString(),
      sessionId,
      model: payload.model,
      prompt,
      cost: 0.275,
      creditsConsumed: result.creditsConsumed || 55,
      duration: result.costTime || 0,
      durationSeconds: 5,
      status: 'success',
      resolution: '1072x1928',
      aspectRatio: '9:16',
      taskId,
      videoUrl: result.url,
      outputFile: outputPath
    });
    fs.writeFileSync(sessionLogPath, JSON.stringify(sessData, null, 2), 'utf8');
    console.log(`[Logging] Recorded to ${sessionLogPath}`);
  } catch (e) {
    console.error(`[Logging Warning] ${e.message}`);
  }
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

