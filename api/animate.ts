import { GoogleGenAI } from '@google/genai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const clientApiKey = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const veoApiKey = process.env.GEMINI_VEO_API_KEY || clientApiKey;

  if (!veoApiKey) {
    return res.status(500).json({ 
      error: 'Конфигурация сервера не завершена: отсутствует GEMINI_VEO_API_KEY. Пожалуйста, введите ваш API-ключ Gemini в шапке сайта.' 
    });
  }

  const { imageUrl, prompt, negativePrompt, seed } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: 'Image URL is required' });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    // 0. Extract or generate traceId for Distributed Tracing
    const traceparent = req.headers.traceparent as string || '';
    const vercelTrace = req.headers['x-vercel-id'] as string || '';
    const rawTraceId = traceparent.split('-')[1] || vercelTrace || `tr${Math.random().toString(36).substring(2, 15)}`;
    // Google Cloud Trace requires traceId to be exactly 32-character hex string
    const traceId = rawTraceId.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').substring(0, 32);

    const logMessage = (msg: string, severity = 'INFO', extra = {}) => {
      console.log(JSON.stringify({
        message: `[Trace: ${traceId}] ${msg}`,
        severity,
        "logging.googleapis.com/trace": `projects/pro-import-agent/traces/${traceId}`,
        ...extra
      }));
    };

    logMessage(`[Veo API] Received video generation request for image: ${imageUrl}`);

    // 1. Download image and convert to Base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      throw new Error(`Failed to fetch image from URL: ${imageUrl}`);
    }
    const arrayBuffer = await imgResponse.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // 2. Initialize Google Gen AI client
    const ai = new GoogleGenAI({ apiKey: veoApiKey });

    // 3. Combine prompt and negative prompt
    const combinedPrompt = negativePrompt ? `${prompt} Negative prompt: ${negativePrompt}` : prompt;

    logMessage(`[Veo API] Triggering generation on Google. Seed=${seed}, Prompt length=${combinedPrompt.length}`);

    // 4. Trigger Long-Running Operation (LRO)
    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-001',
      prompt: combinedPrompt,
      image: {
        imageBytes: base64Image,
        mimeType: 'image/jpeg'
      },
      config: {
        aspectRatio: '9:16',
        durationSeconds: 6,
        personGeneration: 'allow_adult',
        ...(seed !== undefined && seed !== null ? { seed: Number(seed) } : {})
      }
    });

    logMessage(`[Veo API] Successfully started. Google OperationID: ${operation.name}`);

    return res.status(200).json({ operationId: operation.name, traceId });

  } catch (error: any) {
    const traceparent = req.headers.traceparent as string || '';
    const vercelTrace = req.headers['x-vercel-id'] as string || '';
    const rawTraceId = traceparent.split('-')[1] || vercelTrace || 'unknown';
    const traceId = rawTraceId.replace(/[^a-fA-F0-9]/g, '').padEnd(32, '0').substring(0, 32);

    console.log(JSON.stringify({
      message: `[Trace: ${traceId}] [Veo API Error]: ${error.message || error}`,
      severity: 'ERROR',
      "logging.googleapis.com/trace": `projects/pro-import-agent/traces/${traceId}`,
      error: error.stack || error
    }));

    return res.status(500).json({ 
      error: error.message || 'Internal server error during video generation startup' 
    });
  }
}
