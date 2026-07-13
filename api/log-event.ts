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

  const { sessionId, model, prompt, cost, duration, status, error, traceId } = req.body;
  const timestamp = new Date().toISOString();

  // 1. Format and write to server/console stdout in structured JSON format
  console.log(JSON.stringify({
    message: `[GEMINI LOG] [Session: ${sessionId}] [Model: ${model}] [Status: ${status}] cost=$${Number(cost).toFixed(4)} duration=${Number(duration).toFixed(1)}s ${error ? `error="${error}"` : ''} prompt="${prompt}"`,
    severity: status === 'error' ? 'ERROR' : 'INFO',
    "logging.googleapis.com/trace": traceId ? `projects/pro-import-agent/traces/${traceId}` : undefined,
    labels: {
      sessionId,
      model,
      status
    }
  }));

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
        error,
        traceId
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
        error,
        traceId
      });

      fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write to gemini_sessions.json:', err);
    }
  }

  return res.status(200).json({ success: true });
}
