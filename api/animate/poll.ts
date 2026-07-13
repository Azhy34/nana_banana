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

  const authHeader = req.headers.authorization;
  const clientApiKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const veoApiKey = process.env.GEMINI_VEO_API_KEY || clientApiKey;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!veoApiKey) {
    return res.status(500).json({ error: 'GEMINI_VEO_API_KEY is not configured. Пожалуйста, введите ваш API-ключ Gemini в шапке сайта.' });
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
    const operation = await ai.operations.getVideosOperation({
      operation: { name: operationId } as any
    });

    if (operation.done) {
      if (operation.error) {
        logMessage(`[Veo Poll] Operation failed on Google side: ${operation.error.message || operation.error}`, 'ERROR', { error: operation.error });
        return res.status(500).json({ 
          error: (operation.error.message as string) || 'Video generation failed on Google servers' 
        });
      }

      const generatedVideo = operation.response?.generatedVideos?.[0];
      if (!generatedVideo || !generatedVideo.video) {
        return res.status(500).json({ error: 'No video output returned from completed operation' });
      }

      logMessage(`[Veo Poll] Video generated on Google. File URI: ${generatedVideo.video.uri || 'N/A'}`);

      // 1. Get the video buffer
      let videoBuffer: Buffer;
      if (generatedVideo.video.videoBytes) {
        videoBuffer = Buffer.from(generatedVideo.video.videoBytes, 'base64');
      } else if (generatedVideo.video.uri) {
        // Fetch the file content using :download?alt=media and the API key
        let fetchUrl = generatedVideo.video.uri;
        if (fetchUrl.startsWith('http')) {
          const baseUrl = fetchUrl.split('?')[0];
          const queryParams = fetchUrl.split('?')[1] || '';
          
          let downloadUrl = baseUrl;
          if (!downloadUrl.endsWith(':download')) {
            downloadUrl = `${downloadUrl}:download`;
          }
          
          const separator = queryParams ? `?${queryParams}&` : '?';
          fetchUrl = `${downloadUrl}${separator}alt=media&key=${veoApiKey}`;
        }
        
        logMessage(`[Veo Poll] Fetching video bytes from: ${fetchUrl.split('key=')[0]}key=[REDACTED]`);
        
        const fetchRes = await fetch(fetchUrl, {
          headers: {
            'x-goog-api-key': veoApiKey
          }
        });
        if (!fetchRes.ok) {
          const errorText = await fetchRes.text();
          throw new Error(`Failed to fetch video content from Google API: ${fetchRes.statusText} - ${errorText}`);
        }
        const arrayBuf = await fetchRes.arrayBuffer();
        videoBuffer = Buffer.from(arrayBuf);
      } else {
        throw new Error('No video data or URI available in the response');
      }

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
