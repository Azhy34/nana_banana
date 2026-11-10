#!/usr/bin/env node

/**
 * ComfyUI Local Pipeline Runner for Nana Banana
 * Controls local ComfyUI instance (http://127.0.0.1:8188) via REST & WebSocket.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SERVER = process.env.COMFY_SERVER_URL || 'http://127.0.0.1:8188';

async function checkHealth(serverUrl = DEFAULT_SERVER) {
  try {
    const res = await fetch(`${serverUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data;
  } catch (_) {
    return false;
  }
}

async function uploadImage(imagePath, serverUrl = DEFAULT_SERVER) {
  const fileBytes = fs.readFileSync(imagePath);
  const fileName = path.basename(imagePath);

  const formData = new FormData();
  formData.append('image', new Blob([fileBytes]), fileName);
  formData.append('overwrite', 'true');

  const res = await fetch(`${serverUrl}/upload/image`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Failed to upload image to ComfyUI: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.name; // Name of image saved in ComfyUI input folder
}

async function runWorkflow({ workflowPath, overrides = {}, outputPath, serverUrl = DEFAULT_SERVER }) {
  const stats = await checkHealth(serverUrl);
  if (!stats) {
    throw new Error(`ComfyUI is not reachable at ${serverUrl}. Make sure ComfyUI is running!`);
  }
  console.log(`[ComfyUI] Connected to ${serverUrl} (v${stats.system?.comfyui_version || 'unknown'})`);

  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`);
  }

  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const promptGraph = workflow.prompt || workflow; // Support both raw API JSON and prompt-wrapped JSON

  // Apply overrides: e.g. { "6": { inputs: { text: "new prompt" } }, "10": { inputs: { image: "uploaded.png" } } }
  for (const [nodeId, override] of Object.entries(overrides)) {
    if (promptGraph[nodeId]) {
      if (override.inputs) {
        promptGraph[nodeId].inputs = {
          ...promptGraph[nodeId].inputs,
          ...override.inputs
        };
      }
    }
  }

  const clientId = crypto.randomUUID();
  const wsUrl = serverUrl.replace(/^http/, 'ws') + `/ws?clientId=${clientId}`;

  console.log(`[ComfyUI] Connecting WebSocket to ${wsUrl}...`);
  const ws = new WebSocket(wsUrl);

  return new Promise((resolve, reject) => {
    let promptId = null;

    ws.onopen = async () => {
      console.log(`[ComfyUI] Submitting prompt to queue...`);
      try {
        const res = await fetch(`${serverUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptGraph,
            client_id: clientId
          })
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`ComfyUI /prompt rejected: ${err}`);
        }
        const data = await res.json();
        promptId = data.prompt_id;
        console.log(`[ComfyUI] Task queued! Prompt ID: ${promptId}`);
      } catch (e) {
        ws.close();
        reject(e);
      }
    };

    ws.onmessage = async (event) => {
      try {
        if (typeof event.data !== 'string') return;
        const msg = JSON.parse(event.data);

        if (msg.type === 'executing') {
          const node = msg.data.node;
          if (node) {
            console.log(`[ComfyUI] Executing Node ${node} (${promptGraph[node]?.class_type || ''})...`);
          } else if (msg.data.prompt_id === promptId) {
            console.log(`[ComfyUI] Execution completed! Fetching outputs...`);
            ws.close();

            // Fetch outputs from /history
            const histRes = await fetch(`${serverUrl}/history/${promptId}`);
            const histData = await histRes.json();
            const taskHist = histData[promptId];

            if (!taskHist || !taskHist.outputs) {
              return resolve({ success: true, promptId, outputs: [] });
            }

            const outputFiles = [];
            for (const [nodeId, nodeOut] of Object.entries(taskHist.outputs)) {
              if (nodeOut.images && nodeOut.images.length > 0) {
                for (const img of nodeOut.images) {
                  const imgUrl = `${serverUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                  console.log(`[ComfyUI] Found image output from Node ${nodeId}: ${img.filename}`);

                  if (outputPath) {
                    const imgRes = await fetch(imgUrl);
                    const buf = await imgRes.arrayBuffer();
                    fs.writeFileSync(outputPath, Buffer.from(buf));
                    console.log(`✓ Saved output to ${outputPath}`);
                  }
                  outputFiles.push({ filename: img.filename, url: imgUrl });
                }
              }
            }

            resolve({ success: true, promptId, outputFiles });
          }
        } else if (msg.type === 'progress') {
          const { value, max } = msg.data;
          process.stdout.write(`\r[ComfyUI] Progress: ${value}/${max} steps (${Math.round((value / max) * 100)}%)`);
        } else if (msg.type === 'execution_error') {
          ws.close();
          reject(new Error(`ComfyUI Execution Error: ${JSON.stringify(msg.data)}`));
        }
      } catch (err) {
        ws.close();
        reject(err);
      }
    };

    ws.onerror = (err) => {
      reject(new Error(`WebSocket error: ${err.message || 'connection failed'}`));
    };
  });
}

// CLI Mode
if (require.main === module) {
  (async () => {
    const stats = await checkHealth();
    if (!stats) {
      console.log(`❌ ComfyUI is not running on ${DEFAULT_SERVER}.`);
      console.log(`Please start Comfy Desktop or run ComfyUI via run_cpu.bat / run_amd_gpu.bat.`);
    } else {
      console.log(`✓ ComfyUI is ONLINE on ${DEFAULT_SERVER}!`);
      console.log(`Python: ${stats.system?.python_version || 'N/A'}`);
      console.log(`OS: ${stats.system?.os || 'N/A'}`);
    }
  })();
}

module.exports = {
  checkHealth,
  uploadImage,
  runWorkflow
};

