import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  upscaleRequestSchema,
  toReplicateInput,
  formatIssues,
  readErrorBody,
  parsePrediction,
} from '../shared/upscaleContract.js';

const TOPAZ_API_URL = 'https://api.replicate.com/v1/models/topazlabs/image-upscale/predictions';
const REAL_ESRGAN_API_URL = 'https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions';

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

  // Get token from Authorization header instead of body
  const apiToken = req.headers.authorization?.replace('Bearer ', '');

  if (!apiToken) {
    return res.status(401).json({ error: 'Replicate API token is required in Authorization header' });
  }

  // Validate here so a bad field comes back named, instead of as an opaque 422
  // proxied from Replicate. (Replicate rejects unknown enums for free, so this
  // saves a round-trip and the debugging, not the prediction cost.)
  const parsed = upscaleRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    const issues = formatIssues(parsed.error);
    return res.status(400).json({
      error: `Invalid upscale request — ${issues.join('; ')}`,
      issues,
    });
  }

  try {
    // Select Replicate endpoint according to model
    const apiUrl = parsed.data.model === 'real-esrgan' ? REAL_ESRGAN_API_URL : TOPAZ_API_URL;

    // Start prediction on Replicate
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=5'
      },
      body: JSON.stringify({ input: toReplicateInput(parsed.data) })
    });

    if (!response.ok) {
      const error = await readErrorBody(response, 'Failed to start upscale');
      return res.status(response.status).json({ error });
    }

    // Gate the response too: a changed shape should fail here with a clear
    // message, not somewhere in the browser three calls later.
    const prediction = parsePrediction(await response.json());
    return res.status(200).json(prediction);

  } catch (error: any) {
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}
