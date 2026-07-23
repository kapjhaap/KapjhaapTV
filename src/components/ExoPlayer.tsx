import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings2,
  Activity,
  RotateCcw,
  RotateCw,
  FastForward,
  Rewind,
  Sparkles,
  Layers,
  Radio,
  Tv2,
  AlertTriangle,
  PictureInPicture,
  ShieldAlert,
} from 'lucide-react';
import { Channel, AspectRatio, ProxyMode, StreamStats, QualityLevel, AudioTrack } from '../types';
import { StatsOverlay } from './StatsOverlay';

interface ExoPlayerProps {
  channel: Channel;
  proxyMode?: ProxyMode;
  onSelectNextChannel?: () => void;
  onSelectPrevChannel?: () => void;
}

export const ExoPlayer: React.FC<ExoPlayerProps> = ({
  channel,
  proxyMode = 'cors_proxy',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Connection & Retry tracking
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const networkRetryCountRef = useRef<number>(0);
  const mediaRetryCountRef = useRef<number>(0);
  const activeSourceIndexRef = useRef<number>(0);

  // Player States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showStats, setShowStats] = useState<boolean>(false);

  // Timeline & Buffer Progress States
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedRanges, setBufferedRanges] = useState<{ start: number; end: number }[]>([]);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Quality & Track States
  const [qualities, setQualities] = useState<QualityLevel[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = Auto
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);

  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(-1);
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);

  const [showAspectMenu, setShowAspectMenu] = useState<boolean>(false);

  // Stream Stats State
  const [stats, setStats] = useState<StreamStats>({
    bandwidth: 0,
    resolution: '',
    codec: '',
    bufferedAhead: 0,
    droppedFrames: 0,
    totalFrames: 0,
    currentLevel: -1,
    levelsCount: 0,
    latencySec: 0,
    isLive: true,
    loadTimeMs: 0,
  });

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format time (HH:MM:SS or MM:SS)
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0 || !isFinite(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Skip time (+5s or -5s)
  const skipTime = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const dur = video.duration;
    let targetTime = video.currentTime + seconds;
    if (isFinite(dur) && dur > 0) {
      targetTime = Math.max(0, Math.min(dur, targetTime));
    } else {
      targetTime = Math.max(0, targetTime);
    }
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  }, []);

  // Update real-time playback & buffered timeline ranges
  const updateProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);
    if (isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
    } else if (video.seekable && video.seekable.length > 0) {
      const end = video.seekable.end(video.seekable.length - 1);
      setDuration(end);
    }

    const ranges: { start: number; end: number }[] = [];
    const buf = video.buffered;
    for (let i = 0; i < buf.length; i++) {
      ranges.push({
        start: buf.start(i),
        end: buf.end(i),
      });
    }
    setBufferedRanges(ranges);
  }, []);

  // Handle Seek on progress bar click or drag
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = e.currentTarget;
    if (!video || !bar) return;

    const rect = bar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = clickX / rect.width;

    if (isFinite(video.duration) && video.duration > 0) {
      const newTime = percent * video.duration;
      video.currentTime = newTime;
      setCurrentTime(newTime);
    } else if (video.seekable && video.seekable.length > 0) {
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      const seekableDur = end - start;
      if (seekableDur > 0) {
        const newTime = start + percent * seekableDur;
        video.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  };

  // Handle Mouse Hover over progress bar to display timestamp preview
  const handleMouseMoveBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = e.currentTarget;
    if (!video || !bar) return;

    const rect = bar.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = clickX / rect.width;
    setHoverPosition(percent * 100);

    if (isFinite(video.duration) && video.duration > 0) {
      setHoverTime(percent * video.duration);
    } else if (video.seekable && video.seekable.length > 0) {
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      setHoverTime(start + percent * (end - start));
    } else {
      setHoverTime(null);
    }
  };

  const getChannelSources = useCallback(() => {
    const sourceSet = new Set<string>();
    [channel.streamUrl, ...(channel.backupUrls || [])].forEach((url) => {
      const trimmed = url?.trim();
      if (trimmed) sourceSet.add(trimmed);
    });
    return Array.from(sourceSet);
  }, [channel.streamUrl, channel.backupUrls]);

  const shouldWrapSourceAsHls = (rawUrl: string) => {
    if (channel.forceHlsWrap) return true;
    try {
      const parsed = new URL(rawUrl);
      return parsed.pathname.toLowerCase().endsWith('.ts') || parsed.searchParams.get('extension') === 'ts';
    } catch {
      return /\.ts($|\?)/i.test(rawUrl) || /[?&]extension=ts(&|$)/i.test(rawUrl);
    }
  };

  // Generate resolved video URL based on proxy mode
  const getPlayableUrl = useCallback((rawUrl: string) => {
    if (channel.useDirectStream) {
      return rawUrl;
    }

    if (proxyMode === 'cors_proxy') {
      let proxyEndpoint = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
      if (channel.httpHeaders) {
        proxyEndpoint += `&headers=${encodeURIComponent(JSON.stringify(channel.httpHeaders))}`;
      }
      if (shouldWrapSourceAsHls(rawUrl)) {
        proxyEndpoint += '&wrap=hls';
      }
      if (channel.forceVideoOnly) {
        proxyEndpoint += '&videoOnly=1';
      }
      return proxyEndpoint;
    }
    return rawUrl;
  }, [channel.forceHlsWrap, channel.forceVideoOnly, channel.httpHeaders, channel.useDirectStream, proxyMode]);

  // Load stream in HLS.js or native HTML5 video
  const loadStream = useCallback(function loadChannelStream(sourceIndex = 0) {
    const video = videoRef.current;
    if (!video) return;

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current);
    }
    networkRetryCountRef.current = 0;
    mediaRetryCountRef.current = 0;
    activeSourceIndexRef.current = sourceIndex;

    setHasError(false);
    setErrorMessage('');
    setIsBuffering(true);
    setQualities([]);
    setAudioTracks([]);
    setCurrentQuality(-1);
    setCurrentAudioTrack(-1);

    const sources = getChannelSources();
    const rawSourceUrl = sources[sourceIndex] || sources[0] || channel.streamUrl;
    const streamUrl = getPlayableUrl(rawSourceUrl);
    const hasBackupSource = sources.length > 1 && sourceIndex < sources.length - 1;
    const isWrappedTsSource = shouldWrapSourceAsHls(rawSourceUrl);
    const loadStartedAt = Date.now();

    // Clean up existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.removeAttribute('src');
    video.load();

    const tryNextSource = (message: string) => {
      if (sources.length > 1 && sourceIndex < sources.length - 1) {
        setErrorMessage(`${message} Trying backup source ${sourceIndex + 2}/${sources.length}...`);
        reloadTimeoutRef.current = setTimeout(() => loadChannelStream(sourceIndex + 1), 900);
        return true;
      }
      return false;
    };

    // Guard timeout to prevent infinite "Connecting..." spinning on dead endpoints.
    connectionTimeoutRef.current = setTimeout(() => {
      if (tryNextSource('Primary stream connection timed out.')) {
        return;
      }

      setHasError(true);
      setIsBuffering(false);
      setErrorMessage(
        'Stream connection timed out. The stream server may be offline, overloaded, restricted, or using an expired token.'
      );
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    }, 25000);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 300,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1.2,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 800,
        manifestLoadingMaxRetryTimeout: 8000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 800,
        levelLoadingMaxRetryTimeout: 8000,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 800,
        fragLoadingMaxRetryTimeout: 10000,
        appendErrorMaxRetry: 4,
        startFragPrefetch: true,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        setIsBuffering(false);
        setHasError(false);
        setStats((prev) => ({
          ...prev,
          isLive: true,
          loadTimeMs: Date.now() - loadStartedAt,
          levelsCount: data.levels.length,
        }));

        const parsedQualities: QualityLevel[] = data.levels.map((lvl, index) => ({
          id: index,
          height: lvl.height,
          width: lvl.width,
          bitrate: lvl.bitrate,
          name: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
        }));

        setQualities(parsedQualities);
        setCurrentQuality(-1);

        video
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn('Autoplay muted attempt:', err);
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          });
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        const tracks: AudioTrack[] = data.audioTracks.map((tr, index) => ({
          id: index,
          name: tr.name || `Track ${index + 1}`,
          lang: tr.lang || 'default',
        }));
        setAudioTracks(tracks);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level);
        if (hls.levels[data.level]) {
          const lvl = hls.levels[data.level];
          setStats((prev) => ({
            ...prev,
            resolution: `${lvl.width || '?'}x${lvl.height || '?'}`,
            currentLevel: data.level,
            bandwidth: lvl.bitrate,
          }));
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
        }
        networkRetryCountRef.current = 0;
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('HLS Event Error:', data);
        if (
          !data.fatal &&
          (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            data.details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL)
        ) {
          hls.startLoad();
          return;
        }

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              networkRetryCountRef.current += 1;
              if (networkRetryCountRef.current <= 5) {
                console.log(`Network error, retry ${networkRetryCountRef.current}/5...`);
                hls.startLoad();
              } else {
                if (tryNextSource(`Unable to load stream segments (HTTP ${data.response?.code || 'network error'}).`)) {
                  hls.destroy();
                  return;
                }

                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                setHasError(true);
                setErrorMessage(
                  `Unable to load live stream segments (HTTP ${data.response?.code || 'network error'}). The stream token, origin server, or media path may be unavailable.`
                );
                setIsBuffering(false);
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              mediaRetryCountRef.current += 1;
              if (isWrappedTsSource && hasBackupSource) {
                if (tryNextSource('Browser decoder rejected this wrapped transport stream.')) {
                  hls.destroy();
                  return;
                }
              } else if (mediaRetryCountRef.current === 1) {
                console.log('Fatal media error encountered, trying media recovery...');
                hls.recoverMediaError();
              } else if (hasBackupSource) {
                if (tryNextSource('Stream decoder could not recover this source.')) {
                  hls.destroy();
                  return;
                }
              } else if (mediaRetryCountRef.current === 2) {
                console.log('Retrying media recovery with swapped audio codec...');
                hls.swapAudioCodec();
                hls.recoverMediaError();
              } else {
                if (tryNextSource('Stream decoder could not recover this source.')) {
                  hls.destroy();
                  return;
                }
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                setHasError(true);
                setErrorMessage('Stream decoder could not recover. This source may use unsupported codecs or malformed segments.');
                setIsBuffering(false);
                hls.destroy();
              }
              break;
            default:
              if (tryNextSource(data.details ? `Stream error: ${data.details}.` : 'Stream failed.')) {
                hls.destroy();
                return;
              }

              if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
              setHasError(true);
              setErrorMessage(
                data.details
                  ? `Stream decoding error: ${data.details}`
                  : 'Unable to stream channel. Stream may be offline or restricted.'
              );
              setIsBuffering(false);
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        setIsBuffering(false);
        setStats((prev) => ({ ...prev, loadTimeMs: Date.now() - loadStartedAt }));
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }, { once: true });
      video.addEventListener('error', () => {
        if (tryNextSource('Native HLS playback failed.')) {
          return;
        }
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        setHasError(true);
        setErrorMessage('Native HLS playback failed for this stream.');
        setIsBuffering(false);
      }, { once: true });
    } else {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      setHasError(true);
      setErrorMessage('HLS video playback is not supported in this browser.');
      setIsBuffering(false);
    }
  }, [channel.streamUrl, getChannelSources, getPlayableUrl]);

  useEffect(() => {
    loadStream(0);
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [loadStream]);

  // Periodic stats updating & progress check
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const hls = hlsRef.current;
      if (!video) return;

      updateProgress();

      let bufferedSec = 0;
      if (video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
            bufferedSec = video.buffered.end(i) - video.currentTime;
            break;
          }
        }
      }

      const quality = (video as any).getVideoPlaybackQuality?.() || {};

      setStats((prev) => ({
        ...prev,
        bufferedAhead: bufferedSec,
        droppedFrames: quality.droppedVideoFrames || 0,
        totalFrames: quality.totalVideoFrames || 0,
        levelsCount: qualities.length,
        bandwidth: hls?.bandwidthEstimate || prev.bandwidth,
      }));
    }, 500);

    return () => clearInterval(interval);
  }, [qualities.length, updateProgress]);

  // Play/Pause toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch((err) => console.error('Play failed:', err));
    }
  };

  // Mute / Volume toggle
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    const video = videoRef.current;
    if (video) {
      video.volume = newVol;
      setVolume(newVol);
      setIsMuted(newVol === 0);
      video.muted = newVol === 0;
    }
  };

  // Switch Quality Level
  const selectQuality = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentQuality(levelIndex);
    setShowQualityMenu(false);
  };

  // Switch Audio Track
  const selectAudioTrack = (trackId: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.audioTrack = trackId;
    setCurrentAudioTrack(trackId);
    setShowAudioMenu(false);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    const container = playerContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP failed:', err);
    }
  };

  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowQualityMenu(false);
    setShowAudioMenu(false);
    setShowAspectMenu(false);
  }, []);

  const scheduleControlsAutoHide = useCallback((forceHide = false) => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (forceHide || isPlaying) hideControls();
    }, 3500);
  }, [hideControls, isPlaying]);

  const revealControls = useCallback((forceAutoHide = false) => {
    setShowControls(true);
    scheduleControlsAutoHide(forceAutoHide);
  }, [scheduleControlsAutoHide]);

  const toggleControlsVisibility = useCallback(() => {
    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      hideControls();
      return;
    }

    revealControls(true);
  }, [hideControls, revealControls, showControls]);

  // Auto-hide controls overlay
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      revealControls(false);
    }
  };

  const handleMouseLeave = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) hideControls();
  };

  const handleVideoPointerUp = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') {
      toggleControlsVisibility();
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          skipTime(-5);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          skipTime(5);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 's':
          setShowStats((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, skipTime]);

  // Compute CSS objectFit based on selected aspect ratio
  const getVideoObjectFit = (): React.CSSProperties => {
    switch (aspectRatio) {
      case '4:3':
      case '16:9':
      case '21:9':
        return { objectFit: 'contain' };
      case 'contain':
        return { objectFit: 'contain' };
      case 'cover':
        return { objectFit: 'cover' };
      case 'fill':
        return { objectFit: 'fill' };
      default:
        return { objectFit: 'contain' };
    }
  };

  // Calculate percentages for YouTube progress bar
  const maxDur = duration > 0 ? duration : 1;
  const playedPercent = Math.min(100, Math.max(0, (currentTime / maxDur) * 100));

  return (
    <div
      ref={playerContainerRef}
      onPointerMove={handlePointerMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full h-full bg-black rounded-2xl overflow-hidden group select-none shadow-2xl flex items-center justify-center border border-white/10"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        onPointerUp={handleVideoPointerUp}
        onTimeUpdate={updateProgress}
        onProgress={updateProgress}
        onLoadedMetadata={updateProgress}
        onDurationChange={updateProgress}
        onWaiting={() => setIsBuffering(true)}
        onStalled={() => hlsRef.current?.startLoad()}
        onPlaying={() => {
          setIsBuffering(false);
          if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        }}
        style={getVideoObjectFit()}
        className={`w-full h-full cursor-pointer transition-all duration-300 ${
          aspectRatio === '4:3' ? 'aspect-[4/3] max-w-[80%]' : aspectRatio === '21:9' ? 'aspect-[21/9]' : ''
        }`}
        playsInline
      />

      {/* ExoPlayer Stats for Nerds Overlay */}
      {showStats && (
        <StatsOverlay
          stats={stats}
          proxyMode={proxyMode}
          channelName={channel.name}
          streamUrl={channel.streamUrl}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Buffering Spinner */}
      {isBuffering && !hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs z-20 pointer-events-none">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
            <Sparkles className="w-6 h-6 text-red-500 animate-pulse" />
          </div>
          <span className="mt-3 text-xs font-semibold tracking-wider text-gray-300 uppercase animate-pulse">
            Connecting Stream...
          </span>
        </div>
      )}

      {/* Error Card Overlay */}
      {hasError && (
        <div className="absolute inset-0 z-30 bg-gray-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="p-4 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 mb-3 shadow-lg shadow-red-500/10">
            <AlertTriangle className="w-9 h-9 animate-bounce" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1.5">{channel.name} Unreachable</h3>
          <p className="text-xs text-gray-400 max-w-md mb-5 leading-relaxed">{errorMessage}</p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={loadStream}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold text-xs flex items-center gap-2 shadow-lg shadow-red-600/30 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retry Stream
            </button>
          </div>
        </div>
      )}

      {/* ExoPlayer HUD Control Layer */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/30 to-black/80 transition-opacity duration-300 pointer-events-none ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Overlay */}
        <div className="flex items-center justify-between w-full pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-md">
              <Tv2 className="w-4 h-4 text-red-500" />
              <span className="font-bold text-sm text-white tracking-wide truncate max-w-[200px] sm:max-w-xs">
                {channel.name}
              </span>
            </div>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /> LIVE
            </span>
          </div>
        </div>

        {/* Center Controls: Skip -5s, Play/Pause, Skip +5s */}
        <div className="flex items-center justify-center gap-6 sm:gap-8 pointer-events-auto">
          <button
            onClick={() => skipTime(-5)}
            className="p-3.5 sm:p-4 rounded-full bg-black/60 hover:bg-black/90 text-white hover:text-red-400 backdrop-blur-md border border-white/20 transition-all transform hover:scale-110 active:scale-95 flex flex-col items-center justify-center group shadow-xl"
            title="Rewind 5 seconds (Left Arrow / J)"
          >
            <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] font-extrabold tracking-tighter -mt-0.5">5s</span>
          </button>

          <button
            onClick={togglePlay}
            className="p-5 sm:p-6 rounded-full bg-red-600/90 text-white hover:bg-red-500 transition-all transform hover:scale-110 shadow-2xl shadow-red-600/50 backdrop-blur-md border border-red-400/30 active:scale-95"
            title={isPlaying ? 'Pause (Space / K)' : 'Play (Space / K)'}
          >
            {isPlaying ? <Pause className="w-8 h-8 sm:w-9 sm:h-9 fill-current" /> : <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-current ml-1" />}
          </button>

          <button
            onClick={() => skipTime(5)}
            className="p-3.5 sm:p-4 rounded-full bg-black/60 hover:bg-black/90 text-white hover:text-red-400 backdrop-blur-md border border-white/20 transition-all transform hover:scale-110 active:scale-95 flex flex-col items-center justify-center group shadow-xl"
            title="Forward 5 seconds (Right Arrow / L)"
          >
            <RotateCw className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] font-extrabold tracking-tighter -mt-0.5">5s</span>
          </button>
        </div>

        {/* Bottom Navigation */}
        <div className="space-y-2 pointer-events-auto">
          {/* YouTube-Style Stream Progress & Real-Time Buffer Loading Bar */}
          <div
            onClick={handleSeek}
            onMouseMove={handleMouseMoveBar}
            onMouseLeave={() => setHoverTime(null)}
            className="relative w-full h-4 cursor-pointer group/bar flex items-center transition-all select-none"
          >
            {/* Background Track */}
            <div className="w-full h-1.5 group-hover/bar:h-2.5 bg-white/30 rounded-full overflow-hidden relative transition-all">
              {/* Real-time Buffered / Stream Loaded Bars (YouTube grey/white buffer indicator) */}
              {bufferedRanges.map((range, index) => {
                const startPct = Math.min(100, Math.max(0, (range.start / maxDur) * 100));
                const endPct = Math.min(100, Math.max(0, (range.end / maxDur) * 100));
                const widthPct = Math.max(0, endPct - startPct);

                return (
                  <div
                    key={index}
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                    className="absolute top-0 bottom-0 bg-white/50 rounded-full transition-all duration-300"
                    title={`Stream loaded: ${formatTime(range.start)} - ${formatTime(range.end)}`}
                  />
                );
              })}

              {/* Played Progress Bar */}
              <div
                style={{ width: `${playedPercent}%` }}
                className="absolute top-0 bottom-0 left-0 bg-red-600 rounded-full shadow-md shadow-red-600/50"
              />
            </div>

            {/* Hover Vertical Line */}
            {hoverTime !== null && (
              <div
                style={{ left: `${hoverPosition}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
              />
            )}

            {/* Hover Time Tooltip */}
            {hoverTime !== null && (
              <div
                style={{ left: `${hoverPosition}%` }}
                className="absolute -top-8 -translate-x-1/2 px-2 py-0.5 bg-black/90 text-white border border-white/20 rounded text-[11px] font-mono shadow-xl pointer-events-none"
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Scrubber Knob (Red Dot) */}
            <div
              style={{ left: `${playedPercent}%` }}
              className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-red-600 border-2 border-white rounded-full shadow-lg scale-100 transition-transform pointer-events-none"
            />
          </div>

          {/* Control Buttons Toolbar */}
          <div className="flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={togglePlay}
                className="p-1.5 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>



              <div className="flex items-center gap-2 group/vol ml-1">
                <button
                  onClick={toggleMute}
                  className="p-1.5 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-14 sm:w-20 accent-red-500 h-1 bg-white/30 rounded-lg cursor-pointer"
                />
              </div>

              {/* Real-time Time / Stream Status Indicator */}
              <div className="ml-2 font-mono text-[11px] text-gray-300 flex items-center gap-1.5">
                <span>{formatTime(currentTime)}</span>
                <span className="text-gray-500">/</span>
                <span>{duration > 0 && isFinite(duration) ? formatTime(duration) : 'LIVE'}</span>
              </div>
            </div>

            {/* Right Side Options */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {audioTracks.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowAudioMenu((prev) => !prev);
                      setShowQualityMenu(false);
                      setShowAspectMenu(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-gray-200 hover:text-white transition-colors flex items-center gap-1"
                    title="Audio Tracks"
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">AUDIO</span>
                  </button>

                  {showAudioMenu && (
                    <div className="absolute bottom-10 right-0 z-50 bg-gray-900/95 backdrop-blur-md border border-white/10 rounded-xl p-1.5 w-36 shadow-2xl text-xs space-y-1">
                      {audioTracks.map((tr) => (
                        <button
                          key={tr.id}
                          onClick={() => selectAudioTrack(tr.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors ${
                            currentAudioTrack === tr.id
                              ? 'bg-red-600 text-white font-bold'
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          {tr.name} ({tr.lang})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={togglePiP}
                className="p-1.5 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block"
                title="Picture in Picture"
              >
                <PictureInPicture className="w-4 h-4" />
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-1.5 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Toggle Fullscreen (F)"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
