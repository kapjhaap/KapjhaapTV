export interface Channel {
  id: string;
  name: string;
  streamUrl: string;
  backupUrls?: string[];
  forceHlsWrap?: boolean;
  forceVideoOnly?: boolean;
  useDirectStream?: boolean;
  category: 'Sports' | 'News' | 'Entertainment' | 'Custom';
  logo?: string;
  isCustom?: boolean;
  httpHeaders?: Record<string, string>;
  description?: string;
}

export type AspectRatio = '16:9' | '4:3' | 'cover' | 'contain' | 'fill' | '21:9';

export type ProxyMode = 'cors_proxy' | 'direct' | 'custom_proxy';

export interface QualityLevel {
  id: number;
  height: number;
  width: number;
  bitrate: number;
  name: string;
}

export interface StreamStats {
  bandwidth: number;
  resolution: string;
  codec: string;
  bufferedAhead: number;
  droppedFrames: number;
  totalFrames: number;
  currentLevel: number;
  levelsCount: number;
  latencySec: number;
  isLive: boolean;
  loadTimeMs: number;
}

export interface AudioTrack {
  id: number;
  name: string;
  lang: string;
}
