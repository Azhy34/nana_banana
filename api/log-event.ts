import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, model, prompt, cost, duration, status, error } = req.body;
  const timestamp = new Date().toISOString();

  // 1. Format and write to server/console stdout
  console.log(`\n=== [GEMINI LOG] [${timestamp}] ===`);
  console.log(`Session:  ${sessionId}`);
  console.log(`Model:    ${model}`);
  console.log(`Status:   ${status}`);
  console.log(`Cost:     $${Number(cost).toFixed(4)}`);
  console.log(`Duration: ${Number(duration).toFixed(1)}s`);
  if (error) console.log(`Error:    ${error}`);
  console.log(`Prompt:   "${prompt}"`);
  console.log(`=========================================\n`);

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  // 2. Persist to Vercel Blob (Cloud Storage) if available
  if (blobToken) {
    try {
      // Find if there is an existing blob for this session
      const { blobs } = await list({
        prefix: `sessions/${sessionId}.json`,
        token: blobToken
      });

      let sessionLogs = { createdTime: timestamp, events: [] as any[] };
      if (blobs.length > 0) {
        const response = await fetch(blobs[0].url);
        if (response.ok) {
          sessionLogs = await response.json();
        }
      }

      sessionLogs.events.push({
        timestamp,
        model,
        prompt,
        cost,
        duration,
        status,
        error
      });

      // Write back to Vercel Blob (overwriting the old one)
      await put(`sessions/${sessionId}.json`, JSON.stringify(sessionLogs, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false, // Prevents hash suffix so we can overwrite
        token: blobToken
      });
    } catch (blobErr) {
      console.error('Failed to log to Vercel Blob:', blobErr);
    }
  }

  // 3. Persist to local JSON file during development fallback
  const isDev = process.env.NODE_ENV === 'development' || !process.env.VERCEL;
  if (isDev) {
    try {
      const logFilePath = path.join(process.cwd(), 'gemini_sessions.json');
      let data: Record<string, any> = {};

      if (fs.existsSync(logFilePath)) {
        const fileContent = fs.readFileSync(logFilePath, 'utf8');
        data = JSON.parse(fileContent || '{}');
      }

      if (!data[sessionId]) {
        data[sessionId] = {
          createdTime: timestamp,
          events: []
        };
      }

      data[sessionId].events.push({
        timestamp,
        model,
        prompt,
        cost,
        duration,
        status,
        error
      });

      fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write to gemini_sessions.json:', err);
    }
  }

  return res.status(200).json({ success: true });
}
