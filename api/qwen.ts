import type { VercelRequest, VercelResponse } from '@vercel/node';

const REPLICATE_MODELS_URL = 'https://api.replicate.com/v1/models';
const QWEN_IMAGE_2_MODEL = 'qwen/qwen-image-2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: 'Replicate API token is not configured on the server.' });
  }

  const { input } = req.body;
  if (!input || !input.prompt) {
    return res.status(400).json({ error: 'input.prompt is required' });
  }

  try {
    const response = await fetch(`${REPLICATE_MODELS_URL}/${QWEN_IMAGE_2_MODEL}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({ input }),
    });

    const prediction = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: prediction?.detail || prediction?.error || 'Failed to create Qwen prediction.',
      });
    }

    return res.status(200).json(prediction);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
