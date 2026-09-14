import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put, list } from '@vercel/blob';
import fs from 'fs';
import path from 'path';

const DETAIL_FIELDS = [
  'negativePrompt', 'aspectRatio', 'durationSeconds', 'personGeneration', 'seed', 'resolution', 'interactionId',
  'operationName', 'raiMediaFilteredCount', 'raiMediaFilteredReasons', 'errorCode', 'errorStatus',
  // Upscale (Replicate / Topaz)
  'predictionId', 'upscaleFactor', 'enhanceModel', 'outputFormat', 'subjectDetection',
  'inputWidth', 'inputHeight', 'outputWidth', 'outputHeight', 'billingUnits', 'predictTimeSeconds', 'stage',
] as const;

// Short names kept from the original stdout message format.
const SUMMARY_LABELS: Record<string, string> = { operationName: 'operation', raiMediaFilteredCount: 'raiFiltered' };

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

  // Optional fields are persisted only if listed here (mirrors GeminiLogDetails in types.ts).
  const details = Object.fromEntries(
    DETAIL_FIELDS.filter((key) => req.body[key] !== undefined && req.body[key] !== null).map((key) => [key, req.body[key]])
  );
  const { negativePrompt } = details;

  // 1. Format and write to server/console stdout in structured JSON format
  const detailsSummary = Object.entries(details)
    .map(([key, value]) => {
      if (key === 'negativePrompt') return null;
      if (key === 'raiMediaFilteredReasons') return Array.isArray(value) && value.length ? `raiReasons="${value.join('; ')}"` : null;
      if (key === 'durationSeconds') return `duration=${value}s`;
      return `${SUMMARY_LABELS[key] ?? key}=${value}`;
    })
    .filter(Boolean)
    .join(' ');

  console.log(JSON.stringify({
    message: `[GEMINI LOG] [Session: ${sessionId}] [Model: ${model}] [Status: ${status}] cost=$${Number(cost).toFixed(4)} duration=${Number(duration).toFixed(1)}s ${error ? `error="${error}"` : ''} prompt="${prompt}"${negativePrompt ? ` negativePrompt="${negativePrompt}"` : ''}${detailsSummary ? ` ${detailsSummary}` : ''}`,
    severity: status === 'error' ? 'ERROR' : 'INFO',
    "logging.googleapis.com/trace": traceId ? `projects/pro-import-agent/traces/${traceId}` : undefined,
    labels: {
      sessionId,
      model,
      status
    }
  }));

  const eventRecord = {
    timestamp,
    model,
    prompt,
    cost,
    duration,
    status,
    error,
    traceId,
    ...details,
  };

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

      sessionLogs.events.push(eventRecord);

      // Write back to Vercel Blob (overwriting the old one)
      await put(`sessions/${sessionId}.json`, JSON.stringify(sessionLogs, null, 2), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false, // Prevents hash suffix so we can overwrite
        allowOverwrite: true,   // Required by Vercel Blob SDK to overwrite
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

      data[sessionId].events.push(eventRecord);

      fs.writeFileSync(logFilePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to write to gemini_sessions.json:', err);
    }
  }

  return res.status(200).json({ success: true });
}
