import { GoogleGenAI } from '@google/genai';
import { put } from '@vercel/blob';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const veoApiKey = process.env.GEMINI_VEO_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!veoApiKey) {
    return res.status(500).json({ error: 'GEMINI_VEO_API_KEY is not configured.' });
  }

  if (!blobToken) {
    return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN is not configured.' });
  }

  const { operationId, traceId: queryTraceId } = req.query;
  // Ensure exactly 32-character hex traceId for Google Cloud Trace compatibility
  const rawTraceId = queryTraceId as string || 'poll-unknown';
  const traceId = rawTraceId.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').substring(0, 32);

  const logMessage = (msg: string, severity = 'INFO', extra = {}) => {
    console.log(JSON.stringify({
      message: `[Trace: ${traceId}] ${msg}`,
      severity,
      "logging.googleapis.com/trace": `projects/pro-import-agent/traces/${traceId}`,
      ...extra
    }));
  };

  if (!operationId || typeof operationId !== 'string') {
    return res.status(400).json({ error: 'Operation ID is required' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: veoApiKey });

    // Poll the operation status from Google
    logMessage(`[Veo Poll] Checking operation: ${operationId}`);
    const operation = await ai.operations.get({ name: operationId });

    if (operation.done) {
      if (operation.error) {
        logMessage(`[Veo Poll] Operation failed on Google side: ${operation.error.message || operation.error}`, 'ERROR', { error: operation.error });
        return res.status(500).json({ 
          error: operation.error.message || 'Video generation failed on Google servers' 
        });
      }

      const generatedVideo = operation.response?.generatedVideos?.[0];
      if (!generatedVideo) {
        return res.status(500).json({ error: 'No video output returned from completed operation' });
      }

      logMessage(`[Veo Poll] Video generated on Google. File URI: ${generatedVideo.video.uri}`);

      // 1. Download the video file from Google
      const videoBuffer = await ai.files.download({ file: generatedVideo.video });

      // 2. Upload the buffer to Vercel Blob to get a public URL
      const filename = `veo-${Date.now()}-${operationId.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
      const blob = await put(`veo-generations/${filename}`, videoBuffer, {
        access: 'public',
        contentType: 'video/mp4',
        token: blobToken
      });

      logMessage(`[Veo Poll] Video successfully uploaded to Vercel Blob: ${blob.url}`);

      return res.status(200).json({ 
        status: 'done', 
        videoUrl: blob.url 
      });
    }

    // Still processing
    logMessage(`[Veo Poll] Operation is still processing...`);
    return res.status(200).json({ status: 'processing' });

  } catch (error: any) {
    console.log(JSON.stringify({
      message: `[Trace: ${traceId}] [Veo Poll Error]: ${error.message || error}`,
      severity: 'ERROR',
      "logging.googleapis.com/trace": `projects/pro-import-agent/traces/${traceId}`,
      error: error.stack || error
    }));
    return res.status(500).json({ 
      error: error.message || 'Internal server error during video status polling' 
    });
  }
}
