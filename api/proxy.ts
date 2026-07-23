import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable, Transform } from 'stream';

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

function buildSyntheticLivePlaylist(targetUrl: string, customHeadersJson?: string, videoOnly = false): string {
  const mediaSequence = Math.floor(Date.now() / 6000);
  let segmentUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}&segment=${mediaSequence}`;
  if (customHeadersJson) {
    segmentUrl += `&headers=${encodeURIComponent(customHeadersJson)}`;
  }
  if (videoOnly) {
    segmentUrl += '&videoOnly=1';
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

function crc32Mpeg(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) : (crc << 1);
      crc >>>= 0;
    }
  }
  return crc >>> 0;
}

function packetPayloadOffset(packet: Buffer) {
  const adaptationControl = (packet[3] >> 4) & 3;
  if (adaptationControl !== 1 && adaptationControl !== 3) return -1;
  let offset = 4;
  if (adaptationControl === 3) offset += 1 + packet[4];
  return offset < 188 ? offset : -1;
}

function getPsiPayload(packet: Buffer) {
  let offset = packetPayloadOffset(packet);
  if (offset < 0) return null;
  if (packet[1] & 0x40) {
    offset += 1 + packet[offset];
  }
  return offset < 188 ? packet.subarray(offset) : null;
}

function rewritePmtPacket(packet: Buffer, videoPid: number, videoStreamType: number) {
  const payload = getPsiPayload(packet);
  if (!payload || payload[0] !== 0x02) return packet;

  const sectionLength = ((payload[1] & 0x0f) << 8) | payload[2];
  const programNumber = (payload[3] << 8) | payload[4];
  const versionByte = payload[5];
  const sectionNumber = payload[6];
  const lastSectionNumber = payload[7];
  const programInfoLength = ((payload[10] & 0x0f) << 8) | payload[11];
  const programInfo = Array.from(payload.subarray(12, 12 + programInfoLength));
  const streamStart = 12 + programInfoLength;
  const streamEnd = 3 + sectionLength - 4;
  let videoInfo: number[] = [];

  for (let i = streamStart; i < streamEnd;) {
    const streamType = payload[i];
    const elementaryPid = ((payload[i + 1] & 0x1f) << 8) | payload[i + 2];
    const esInfoLength = ((payload[i + 3] & 0x0f) << 8) | payload[i + 4];
    if (elementaryPid === videoPid && streamType === videoStreamType) {
      videoInfo = Array.from(payload.subarray(i + 5, i + 5 + esInfoLength));
      break;
    }
    i += 5 + esInfoLength;
  }

  const newSectionLength = 9 + programInfo.length + 5 + videoInfo.length + 4;
  const section = [
    0x02,
    0xb0 | ((newSectionLength >> 8) & 0x0f),
    newSectionLength & 0xff,
    (programNumber >> 8) & 0xff,
    programNumber & 0xff,
    versionByte,
    sectionNumber,
    lastSectionNumber,
    0xe0 | ((videoPid >> 8) & 0x1f),
    videoPid & 0xff,
    0xf0 | ((programInfo.length >> 8) & 0x0f),
    programInfo.length & 0xff,
    ...programInfo,
    videoStreamType,
    0xe0 | ((videoPid >> 8) & 0x1f),
    videoPid & 0xff,
    0xf0 | ((videoInfo.length >> 8) & 0x0f),
    videoInfo.length & 0xff,
    ...videoInfo,
  ];
  const crc = crc32Mpeg(section);
  section.push((crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);

  const out = Buffer.alloc(188, 0xff);
  packet.copy(out, 0, 0, 4);
  out[1] |= 0x40;
  out[3] = (out[3] & 0xcf) | 0x10;
  out[4] = 0x00;
  Buffer.from(section).copy(out, 5);
  return out;
}

function createVideoOnlyTsTransform() {
  let carry = Buffer.alloc(0);
  let pmtPid: number | null = null;
  let videoPid: number | null = null;
  let videoStreamType: number | null = null;

  return new Transform({
    transform(chunk, _encoding, callback) {
      const input = Buffer.concat([carry, chunk]);
      const output: Buffer[] = [];
      let offset = 0;

      while (offset < input.length && input[offset] !== 0x47) offset += 1;

      for (; offset + 188 <= input.length; offset += 188) {
        const packet = input.subarray(offset, offset + 188);
        if (packet[0] !== 0x47) continue;

        const pid = ((packet[1] & 0x1f) << 8) | packet[2];
        if (pid === 0) {
          const payload = getPsiPayload(packet);
          if (payload && payload[0] === 0x00) {
            const sectionLength = ((payload[1] & 0x0f) << 8) | payload[2];
            for (let i = 8; i < 3 + sectionLength - 4; i += 4) {
              const program = (payload[i] << 8) | payload[i + 1];
              if (program !== 0) pmtPid = ((payload[i + 2] & 0x1f) << 8) | payload[i + 3];
            }
          }
          output.push(Buffer.from(packet));
          continue;
        }

        if (pmtPid !== null && pid === pmtPid) {
          const payload = getPsiPayload(packet);
          if (payload && payload[0] === 0x02) {
            const sectionLength = ((payload[1] & 0x0f) << 8) | payload[2];
            const programInfoLength = ((payload[10] & 0x0f) << 8) | payload[11];
            for (let i = 12 + programInfoLength; i < 3 + sectionLength - 4;) {
              const streamType = payload[i];
              const elementaryPid = ((payload[i + 1] & 0x1f) << 8) | payload[i + 2];
              const esInfoLength = ((payload[i + 3] & 0x0f) << 8) | payload[i + 4];
              if ([0x1b, 0x24, 0x02].includes(streamType)) {
                videoPid = elementaryPid;
                videoStreamType = streamType;
                break;
              }
              i += 5 + esInfoLength;
            }
            if (videoPid !== null && videoStreamType !== null) {
              output.push(rewritePmtPacket(packet, videoPid, videoStreamType));
            }
          }
          continue;
        }

        if (videoPid !== null && pid === videoPid) {
          output.push(Buffer.from(packet));
        }
      }

      carry = input.subarray(offset);
      callback(null, output.length ? Buffer.concat(output) : undefined);
    },
  });
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const targetUrl = (req.query.url as string) || '';
  const customHeadersParam = (req.query.headers as string) || '';

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
    const isSyntheticSegment = typeof req.query.segment === 'string';

    if (req.query.wrap === 'hls') {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.status(200).send(buildSyntheticLivePlaylist(targetUrl, customHeadersParam, req.query.videoOnly === '1'));
      return;
    }

    if (isSyntheticSegment) {
      fetchHeaders['Connection'] = 'close';
    }

    if (!fetchHeaders['Referer'] && !fetchHeaders['referer']) {
      fetchHeaders['Referer'] = `${parsedTarget.protocol}//${parsedTarget.host}/`;
    }
    if (req.headers.range) {
      fetchHeaders['Range'] = Array.isArray(req.headers.range)
        ? req.headers.range[0]
        : req.headers.range;
    }

    const response = await fetch(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: fetchHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok && response.status !== 206) {
      res.status(response.status).send(`Upstream server returned HTTP ${response.status}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const finalUrl = response.url || targetUrl;
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges');

    if (shouldInspectAsPlaylist(contentType, targetUrl, finalUrl) && req.method !== 'HEAD') {
      const textContent = await response.text();
      const isActualM3u8 = textContent.includes('#EXTM3U') || textContent.includes('#EXT-X-');

      if (isActualM3u8) {
        const rewritten = rewriteM3u8Playlist(textContent, finalUrl, customHeadersParam);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.status(200).send(rewritten);
        return;
      } else if (contentType.includes('json') || textContent.startsWith('{')) {
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(textContent);
        return;
      } else {
        res.setHeader('Content-Type', contentType || 'text/plain');
        res.status(200).send(textContent);
        return;
      }
    }

    // Binary TS / video segment streaming
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
      const outputStream = isSyntheticSegment && req.query.videoOnly === '1'
        ? nodeStream.pipe(createVideoOnlyTsTransform())
        : nodeStream;
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
      outputStream.pipe(res as any);
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
}
