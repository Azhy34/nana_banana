import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

const kieProxySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('credits'),
  }),
  z.object({
    action: z.literal('upload'),
    base64Data: z.string().min(1),
    fileName: z.string().min(1),
    uploadPath: z.string().default('nana-banana/refs'),
  }),
  z.object({
    action: z.literal('createTask'),
    model: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal('recordInfo'),
    taskId: z.string().min(1),
  }),
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const kieKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!kieKey) {
    return res.status(401).json({ error: 'KIE API key is required in Authorization: Bearer <key>' });
  }

  const parsed = kieProxySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid KIE proxy request', issues: parsed.error.issues });
  }

  const headers = {
    Authorization: `Bearer ${kieKey}`,
    'Content-Type': 'application/json',
  };

  try {
    const data = parsed.data;
    if (data.action === 'credits') {
      const upstream = await fetch('https://api.kie.ai/api/v1/chat/credit', { headers });
      const json = await upstream.json();
      return res.status(upstream.status).json(json);
    }

    if (data.action === 'upload') {
      const upstream = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base64Data: data.base64Data,
          uploadPath: data.uploadPath,
          fileName: data.fileName,
        }),
      });
      const json = await upstream.json();
      return res.status(upstream.status).json(json);
    }

    if (data.action === 'createTask') {
      const upstream = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: data.model, input: data.input }),
      });
      const json = await upstream.json();
      return res.status(upstream.status).json(json);
    }

    const upstream = await fetch(
      `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(data.taskId)}`,
      { headers },
    );
    const json = await upstream.json();
    return res.status(upstream.status).json(json);
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'KIE upstream request failed' });
  }
}
