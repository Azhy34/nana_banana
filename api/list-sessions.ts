import type { VercelRequest, VercelResponse } from '@vercel/node';
import { list } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    console.error('MISSING BLOB_READ_WRITE_TOKEN');
    return res.status(500).json({ 
      error: 'Server is not configured: missing BLOB_READ_WRITE_TOKEN.' 
    });
  }

  try {
    // 1. List all session files in the Vercel Blob store
    const { blobs } = await list({
      prefix: 'sessions/',
      token: blobToken
    });

    const sessions: Record<string, any> = {};

    // 2. Fetch and compile each session JSON in parallel
    await Promise.all(
      blobs.map(async (blob) => {
        try {
          const filename = blob.pathname.split('/').pop() || '';
          const sessionId = filename.replace('.json', '');

          const response = await fetch(blob.url);
          if (response.ok) {
            sessions[sessionId] = await response.json();
          }
        } catch (fetchErr) {
          console.error(`Failed to fetch blob contents for ${blob.url}:`, fetchErr);
        }
      })
    );

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      totalSessions: Object.keys(sessions).length,
      sessions
    });
  } catch (error: any) {
    console.error('Failed to list sessions from Vercel Blob:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
