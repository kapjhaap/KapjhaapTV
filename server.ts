import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Enable CORS preflight for all routes
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.sendStatus(204);
});

// Helper to rewrite relative and absolute URLs inside m3u8 playlists
function rewriteM3u8Playlist(m3u8Content: string, targetUrl: string, customHeadersJson?: string): string {
  const lines = m3u8Content.split(/\r?\n/);
  
  const wrapInProxy = (rawUri: string) => {
    try {
      const absUrl = new URL(rawUri, targetUrl).href;
      let proxyUrl = `/api/proxy?url=${encodeURIComponent(absUrl)}`;
      if (customHeadersJson) {
        proxyUrl += `&headers=${encodeURIComponent(customHeadersJson)}`;
      }
      return proxyUrl;
    } catch {
      return rawUri;
    }
  };

  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      // Handle tags that contain URI="..." attributes (e.g., #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA)
      return line.replace(/URI=["']([^"']+)["']/g, (_match, uri) => {
        return `URI="${wrapInProxy(uri)}"`;
      });
    } else {
      // Direct stream or sub-playlist URI line
      return wrapInProxy(trimmed);
    }
  });

  return rewrittenLines.join('\n');
}

// Stream proxy endpoint to bypass CORS and mixed content restrictions
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url as string;
  const customHeadersParam = req.query.headers as string;

  if (!targetUrl) {
    res.status(400).json({ error: 'Missing required query parameter "url"' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout per stream segment request

  try {
    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
    };

    if (customHeadersParam) {
      try {
        const parsed = JSON.parse(customHeadersParam);
        if (typeof parsed === 'object' && parsed !== null) {
          Object.assign(fetchHeaders, parsed);
        }
      } catch (e) {
        console.warn('Failed to parse custom headers parameter:', e);
      }
    }

    if (!fetchHeaders['Referer'] && !fetchHeaders['referer']) {
      try {
        const parsedTarget = new URL(targetUrl);
        fetchHeaders['Referer'] = `${parsedTarget.protocol}//${parsedTarget.host}/`;
      } catch {
        // ignore
      }
    }

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (!response.ok && response.status !== 206) {
      res.status(response.status).send(`Upstream server returned HTTP ${response.status}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || targetUrl;

    const isM3u8HeaderOrExt =
      contentType.toLowerCase().includes('mpegurl') ||
      contentType.toLowerCase().includes('m3u8') ||
      contentType.toLowerCase().includes('apple') ||
      targetUrl.toLowerCase().includes('.m3u8') ||
      finalUrl.toLowerCase().includes('.m3u8') ||
      targetUrl.includes('play') ||
      targetUrl.includes('live');

    if (isM3u8HeaderOrExt) {
      const textContent = await response.text();
      const isActualM3u8 = textContent.includes('#EXTM3U') || textContent.includes('#EXT-X-');

      if (isActualM3u8) {
        const rewritten = rewriteM3u8Playlist(textContent, finalUrl, customHeadersParam);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.send(rewritten);
        return;
      } else if (contentType.includes('json') || textContent.startsWith('{')) {
        res.setHeader('Content-Type', 'application/json');
        res.send(textContent);
        return;
      } else {
        res.setHeader('Content-Type', contentType || 'text/plain');
        res.send(textContent);
        return;
      }
    }

    // Binary TS segment / video segment streaming
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    } else if (targetUrl.endsWith('.ts') || finalUrl.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t');
    } else if (targetUrl.endsWith('.m4s') || targetUrl.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = response.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const acceptRanges = response.headers.get('accept-ranges');
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    res.status(response.status);

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    clearTimeout(timeout);
    res.status(502).json({
      error: 'Proxy request failed',
      message: err.name === 'AbortError' ? 'Upstream stream server timed out (10s)' : err.message,
    });
  }
});

// Stream health check endpoint
app.get('/api/check-stream', async (req, res) => {
  const targetUrl = req.query.url as string;
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
});

// Server setup with Vite middleware in development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ExoPlayer Proxy Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
