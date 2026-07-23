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

const DEFAULT_STREAM_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
};

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const SYNTHETIC_SEGMENT_MS = 6200;

function mergeCustomHeaders(customHeadersParam?: string): Record<string, string> {
  const headers = { ...DEFAULT_STREAM_HEADERS };

  if (!customHeadersParam) return headers;

  try {
    const parsed = JSON.parse(customHeadersParam);
    if (typeof parsed === 'object' && parsed !== null) {
      Object.entries(parsed).forEach(([key, value]) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && typeof value === 'string') {
          headers[key] = value;
        }
      });
    }
  } catch (e) {
    console.warn('Failed to parse custom headers parameter:', e);
  }

  return headers;
}

function getUrlPathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function hasKnownMediaExtension(url: string): boolean {
  return /\.(ts|m2ts|m4s|mp4|m4v|aac|ac3|eac3|mp3|webvtt|vtt|key|bin|jpg|jpeg|png|gif)$/i.test(getUrlPathname(url));
}

function shouldInspectAsPlaylist(contentType: string, targetUrl: string, finalUrl: string): boolean {
  const lowerType = contentType.toLowerCase();
  const playlistType =
    lowerType.includes('mpegurl') ||
    lowerType.includes('m3u8') ||
    lowerType.includes('vnd.apple');
  const playlistUrl =
    /\.(m3u8|m3u)$/i.test(getUrlPathname(targetUrl)) ||
    /\.(m3u8|m3u)$/i.test(getUrlPathname(finalUrl));
  const textLike = lowerType.startsWith('text/') || lowerType.includes('json') || lowerType.includes('xml');

  return playlistType || playlistUrl || (textLike && !hasKnownMediaExtension(targetUrl) && !hasKnownMediaExtension(finalUrl));
}

function setProxyCorsHeaders(res: express.Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
}

function buildSyntheticLivePlaylist(targetUrl: string, customHeadersJson?: string): string {
  const mediaSequence = Math.floor(Date.now() / 6000);
  let segmentUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}&segment=${mediaSequence}`;
  if (customHeadersJson) {
    segmentUrl += `&headers=${encodeURIComponent(customHeadersJson)}`;
  }

  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:6',
    `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`,
    '#EXTINF:6.0,',
    segmentUrl,
    '',
  ].join('\n');
}

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

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      res.status(400).json({ error: 'Only http and https stream URLs are supported' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Invalid stream URL' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const fetchHeaders = mergeCustomHeaders(customHeadersParam);

    if (req.query.wrap === 'hls') {
      setProxyCorsHeaders(res);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(buildSyntheticLivePlaylist(targetUrl, customHeadersParam));
      return;
    }

    if (!fetchHeaders['Referer'] && !fetchHeaders['referer']) {
      fetchHeaders['Referer'] = `${parsedTarget.protocol}//${parsedTarget.host}/`;
    }
    if (!fetchHeaders['Origin'] && !fetchHeaders['origin']) {
      fetchHeaders['Origin'] = `${parsedTarget.protocol}//${parsedTarget.host}`;
    }

    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const response = await fetch(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    setProxyCorsHeaders(res);

    if (!response.ok && response.status !== 206) {
      res.status(response.status).send(`Upstream server returned HTTP ${response.status}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || targetUrl;
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges');
    const isSyntheticSegment = typeof req.query.segment === 'string';

    if (shouldInspectAsPlaylist(contentType, targetUrl, finalUrl) && req.method !== 'HEAD') {
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

    if (contentLength && !isSyntheticSegment) res.setHeader('Content-Length', contentLength);

    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader(
      'Cache-Control',
      isSyntheticSegment ? 'no-cache, no-store, must-revalidate' : 'public, max-age=10, stale-while-revalidate=30'
    );

    res.status(response.status);

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as any);
      if (isSyntheticSegment) {
        const segmentTimer = setTimeout(() => {
          nodeStream.destroy();
          if (!res.writableEnded) res.end();
        }, SYNTHETIC_SEGMENT_MS);
        res.on('close', () => {
          clearTimeout(segmentTimer);
          nodeStream.destroy();
        });
        nodeStream.on('end', () => clearTimeout(segmentTimer));
        nodeStream.on('error', () => clearTimeout(segmentTimer));
      }
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    clearTimeout(timeout);
    res.status(502).json({
      error: 'Proxy request failed',
      message: err.name === 'AbortError' ? 'Upstream stream server timed out' : err.message,
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
