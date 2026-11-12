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
  console.log(`[Upload] Uploading ${filePath} to KIE temp CDN...`);
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
      uploadPath: 'nana-banana/runs',
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

async function pollTask(taskId, apiKey, timeoutSec = 300) {
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
        // Try parsing resultJson
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
  const modelType = args[0] || 'kling-2.6'; // 'kling-2.6' or 'kling-3.0'
  const inputImage = args[1] || 'runs/GMC-DS-006_creative/frame1_clean.png';
  const outputPath = args[2] || `runs/GMC-DS-006_creative/${modelType.replace(/[/.]/g, '_')}_test.mp4`;

  const apiKey = getApiKey();

  // 1. Credit check
  const credRes = await fetch('https://api.kie.ai/api/v1/chat/credit', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const credData = await credRes.json();
  console.log(`[Credits] Current balance: ${credData.data} credits`);

  // 2. Upload input image
  const uploadedUrl = await uploadFile(inputImage, apiKey);

  // 3. Prepare task payload adhering to creative-ad-auditor
  const prompt = [
    "Ultra-slow cinematic Steadicam forward push-in shot along the central Z-axis moving towards the nursery wallpaper mural.",
    "The camera glides forward steadily at a snail's pace, maintaining rock-solid optical stability.",
    "GEOMETRIC & FURNITURE LOCK: The natural solid wood slatted crib, oak parquet floor, and room architecture remain 100% rigid, frozen, and geometrically locked with zero distortion, zero bending, and zero shifting parts.",
    "INANIMATE 2D INK LOCK: The savannah landscape and illustrated elephants on the feature wall are strictly flat printed ink on matte non-woven paper.",
    "Completely static 2D artwork, zero biological animation, zero head turns, zero leg movement, zero morphing illustrations.",
    "Warm gentle morning sunlight grazes across the wallpaper texture creating authentic soft ambient shadows."
  ].join(" ");

  let payload;
  if (modelType.startsWith('kling-3.0')) {
    payload = {
      model: 'kling-3.0-omni/image-to-video',
      input: {
        prompt,
        image_urls: [uploadedUrl],
        duration: 4,
        resolution: '1080p',
        audio: false,
        customize_multi_shots: false,
        aspect_ratio: 'auto'
      }
    };
  } else {
    // kling-2.6/image-to-video
    payload = {
      model: 'kling-2.6/image-to-video',
      input: {
        prompt,
        image_urls: [uploadedUrl],
        sound: false,
        duration: '5'
      }
    };
  }

  console.log(`[Task] Submitting generation for model ${payload.model}...`);
  console.log(`[Task] Payload input:`, JSON.stringify(payload.input, null, 2));

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
  console.log(`[Task] Finished! Cost: ${result.creditsConsumed || 'N/A'} credits in ${result.costTime || 'N/A'}s.`);
  console.log(`[Task] Video URL: ${result.url}`);

  // 5. Download
  await downloadFile(result.url, outputPath);
  console.log(`[Complete] Video generation finished successfully: ${outputPath}`);

  // 6. Automated Structured Telemetry & Session Logging
  const sessionId = process.env.SESSION_ID || 'gmc-DS-006';
  const durationSec = result.costTime || 0;
  const costUsd = ((result.creditsConsumed || 55) * 0.005); // 1 credit = $0.005 wholesale
  const eventRecord = {
    timestamp: new Date().toISOString(),
    sessionId,
    model: payload.model,
    prompt,
    cost: Number(costUsd.toFixed(4)),
    creditsConsumed: result.creditsConsumed || 55,
    duration: durationSec,
    durationSeconds: Number(payload.input.duration || 5),
    status: 'success',
    resolution: '1072x1928',
    aspectRatio: '9:16',
    taskId,
    videoUrl: result.url,
    outputFile: outputPath
  };

  // 6a. Structured Cloud Logging stdout
  console.log(JSON.stringify({
    message: `[KIE KLING LOG] [Session: ${sessionId}] [Model: ${payload.model}] [Status: success] cost=$${costUsd.toFixed(4)} duration=${durationSec}s taskId=${taskId}`,
    severity: 'INFO',
    labels: {
      sessionId,
      model: payload.model,
      status: 'success',
      taskId
    }
  }));

  // 6b. Append to local gemini_sessions.json
  const sessionLogPath = path.join(process.cwd(), 'gemini_sessions.json');
  try {
    let sessData = {};
    if (fs.existsSync(sessionLogPath)) {
      sessData = JSON.parse(fs.readFileSync(sessionLogPath, 'utf8') || '{}');
    }
    if (!sessData[sessionId]) {
      sessData[sessionId] = { createdTime: new Date().toISOString(), events: [] };
    }
    sessData[sessionId].events.push(eventRecord);
    fs.writeFileSync(sessionLogPath, JSON.stringify(sessData, null, 2), 'utf8');
    console.log(`[Logging] Recorded to ${sessionLogPath} (session: ${sessionId})`);
  } catch (logErr) {
    console.error(`[Logging Warning] Failed to update gemini_sessions.json:`, logErr.message);
  }
}

main().catch(err => {
  console.error('[Error]', err.message);
  process.exit(1);
});

