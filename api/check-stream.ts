import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const targetUrl = (req.query.url as string) || '';
  if (!targetUrl) {
    res.status(400).json({ error: 'Missing url parameter' });
    return;
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    res.json({
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      latencyMs: latency,
      proxiedUrl: `/api/proxy?url=${encodeURIComponent(targetUrl)}`,
    });
  } catch (err: any) {
    res.json({
      ok: false,
      error: err.name === 'AbortError' ? 'Timeout (6s)' : err.message,
      latencyMs: Date.now() - startTime,
    });
  }
}
