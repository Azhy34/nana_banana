import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (!blobToken) {
    console.error('MISSING BLOB_READ_WRITE_TOKEN');
    return res.status(500).json({ 
      error: 'Конфигурация сервера не завершена: отсутствует BLOB_READ_WRITE_TOKEN. Пожалуйста, убедитесь, что вы нажали Connect в Vercel Storage и сделали Redeploy.' 
    });
  }

  try {
    const { type, payload } = req.body;

    if (type === 'blob.generate-client-token') {
      // Manual token generation for better reliability in simple Node.js functions
      const clientToken = await generateClientTokenFromReadWriteToken({
        pathname: payload.pathname,
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        token: blobToken,
      });

      return res.status(200).json({
        type: 'blob.generate-client-token',
        clientToken,
      });
    }

    // handleUpload completed event (optional, but good to have)
    if (type === 'blob.upload-completed') {
      return res.status(200).json({ type, response: 'ok' });
    }

    return res.status(400).json({ error: 'Invalid event type' });
  } catch (error: any) {
    console.error('Blob API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during blob token generation' });
  }
}
