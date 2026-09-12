import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readErrorBody, parsePrediction } from '../../shared/upscaleContract';

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

  const { id } = req.query;
  const apiToken = req.headers.authorization?.replace('Bearer ', '');

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Prediction ID is required' });
  }

  // The id lands in the request path — keep it to the shape Replicate actually issues.
  if (!/^[a-z0-9]{1,64}$/i.test(id)) {
    return res.status(400).json({ error: 'Prediction ID is malformed' });
  }

  if (!apiToken) {
    return res.status(401).json({ error: 'Replicate API token is required' });
  }

  try {
    // Poll Replicate for status
    const response = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await readErrorBody(response, 'Failed to check prediction status');
      return res.status(response.status).json({ error });
    }

    const prediction = parsePrediction(await response.json());
    return res.status(200).json(prediction);

  } catch (error: any) {
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}
