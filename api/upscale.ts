import type { VercelRequest, VercelResponse } from '@vercel/node';

const REPLICATE_API_URL = 'https://api.replicate.com/v1/models/topazlabs/image-upscale/predictions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS for your domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, upscaleFactor, enhanceModel, faceEnhance, apiToken } = req.body;

  if (!apiToken) {
    return res.status(400).json({ error: 'API token is required' });
  }

  if (!image) {
    return res.status(400).json({ error: 'Image is required' });
  }

  try {
    // Start prediction on Replicate
    const response = await fetch(REPLICATE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=5'
      },
      body: JSON.stringify({
        input: {
          image,
          upscale_factor: upscaleFactor,
          enhance_model: enhanceModel,
          output_format: 'png',
          face_enhancement: faceEnhance,
          subject_detection: 'All'
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({ 
        error: error.detail || 'Failed to start upscale' 
      });
    }

    const prediction = await response.json();
    return res.status(200).json(prediction);

  } catch (error: any) {
    return res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}