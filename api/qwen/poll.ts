import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Prediction ID is required' });
  }

  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: 'Replicate API token is not configured on the server.' });
  }

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    const prediction = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: prediction?.detail || 'Failed to check prediction status',
      });
    }

    return res.status(200).json(prediction);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
