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
  const networkRetryCountRef = useRef<number>(0);

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

  // Generate resolved video URL based on proxy mode
  const getPlayableUrl = useCallback(() => {
    let rawUrl = channel.streamUrl;
    if (proxyMode === 'cors_proxy') {
      let proxyEndpoint = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
      if (channel.httpHeaders) {
        proxyEndpoint += `&headers=${encodeURIComponent(JSON.stringify(channel.httpHeaders))}`;
      }
      return proxyEndpoint;
    }
    return rawUrl;
  }, [channel.streamUrl, channel.httpHeaders, proxyMode]);

  // Load stream in HLS.js or native HTML5 video
  const loadStream = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }
    networkRetryCountRef.current = 0;

    setHasError(false);
    setErrorMessage('');
    setIsBuffering(true);

    const streamUrl = getPlayableUrl();

    // Clean up existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Set 10-second guard connection timeout to prevent infinite "Connecting..." spinning
    connectionTimeoutRef.current = setTimeout(() => {
      if (isBuffering || !isPlaying) {
        setHasError(true);
        setIsBuffering(false);
        setErrorMessage(
          'Stream connection timed out (10s). The stream server or IP endpoint may be offline, restricted, or token expired.'
        );
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      }
    }, 10000);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 300,
        manifestLoadingTimeOut: 8000,
        manifestLoadingMaxRetry: 2,
        levelLoadingTimeOut: 8000,
        fragLoadingTimeOut: 8000,
        fragLoadingMaxRetry: 3,
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

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('HLS Event Error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              networkRetryCountRef.current += 1;
              if (networkRetryCountRef.current <= 2) {
                console.log(`Network error, retry ${networkRetryCountRef.current}/2...`);
                hls.startLoad();
              } else {
                if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
                setHasError(true);
                setErrorMessage(
                  `Unable to load live stream network segments (HTTP ${data.response?.code || 'Error'}). The stream token or IP server may be offline.`
                );
                setIsBuffering(false);
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Fatal media error encountered, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
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
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });
    } else {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      setHasError(true);
      setErrorMessage('HLS video playback is not supported in this browser.');
      setIsBuffering(false);
    }
  }, [getPlayableUrl]);

  useEffect(() => {
    loadStream();
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [loadStream]);

  // Periodic stats updating
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const hls = hlsRef.current;
      if (!video) return;

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
    }, 1000);

    return () => clearInterval(interval);
  }, [qualities.length]);

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

  // Auto-hide controls overlay
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowQualityMenu(false);
        setShowAudioMenu(false);
        setShowAspectMenu(false);
      }
    }, 3500);
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
  }, [isPlaying, isMuted]);

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

  return (
    <div
      ref={playerContainerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative w-full h-full bg-black rounded-2xl overflow-hidden group select-none shadow-2xl flex items-center justify-center border border-white/10"
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        onClick={togglePlay}
        onWaiting={() => setIsBuffering(true)}
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

        {/* Center Big Play/Pause Button on Hover */}
        <div className="flex items-center justify-center pointer-events-auto">
          <button
            onClick={togglePlay}
            className="p-5 rounded-full bg-red-600/90 text-white hover:bg-red-500 transition-all transform hover:scale-110 shadow-2xl shadow-red-600/50 backdrop-blur-md border border-red-400/30 active:scale-95"
          >
            {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
          </button>
        </div>

        {/* Bottom Navigation & Controls */}
        <div className="space-y-3 pointer-events-auto">
          {/* Live Progress Bar */}
          <div className="relative w-full h-1.5 bg-white/20 hover:h-2.5 rounded-full transition-all cursor-pointer group/bar">
            <div className="absolute top-0 left-0 bottom-0 bg-red-600 rounded-full w-full shadow-lg shadow-red-600/50" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md scale-0 group-hover/bar:scale-100 transition-transform" />
          </div>

          {/* Control Buttons Toolbar */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="p-2 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              <div className="flex items-center gap-2 group/vol">
                <button
                  onClick={toggleMute}
                  className="p-2 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
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
                  className="w-16 sm:w-20 accent-red-500 h-1 bg-white/30 rounded-lg cursor-pointer"
                />
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
                className="p-2 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors hidden sm:block"
                title="Picture in Picture"
              >
                <PictureInPicture className="w-4 h-4" />
              </button>

              <button
                onClick={toggleFullscreen}
                className="p-2 text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
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
