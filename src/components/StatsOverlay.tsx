import React from 'react';
import { Activity, Wifi, Film, ShieldCheck, Cpu, HardDrive } from 'lucide-react';
import { StreamStats, ProxyMode } from '../types';

interface StatsOverlayProps {
  stats: StreamStats;
  proxyMode: ProxyMode;
  channelName: string;
  streamUrl: string;
  onClose: () => void;
}

export const StatsOverlay: React.FC<StatsOverlayProps> = ({
  stats,
  proxyMode,
  channelName,
  streamUrl,
  onClose,
}) => {
  return (
    <div className="absolute top-4 left-4 z-40 bg-black/85 backdrop-blur-md text-xs font-mono border border-white/10 rounded-xl p-4 text-gray-200 max-w-md w-full shadow-2xl animate-fade-in pointer-events-auto">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="font-bold tracking-wider text-white">EXOPLAYER STATS FOR NERDS</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-base px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-center py-1 border-b border-white/5">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-blue-400" /> Channel
          </span>
          <span className="font-semibold text-white truncate max-w-[200px]">{channelName}</span>
        </div>

        <div className="flex justify-between items-center py-1 border-b border-white/5">
          <span className="text-gray-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Proxy Routing
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
              proxyMode === 'cors_proxy'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
            }`}
          >
            {proxyMode === 'cors_proxy' ? 'CORS Proxy Active' : 'Direct Stream'}
          </span>
        </div>

        <div className="flex justify-between items-center py-1 border-b border-white/5">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-purple-400" /> Bandwidth / Bitrate
          </span>
          <span className="text-emerald-400 font-semibold">
            {stats.bandwidth ? `${(stats.bandwidth / 1000000).toFixed(2)} Mbps` : 'Auto / Live'}
          </span>
        </div>

        <div className="flex justify-between items-center py-1 border-b border-white/5">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-cyan-400" /> Resolution & Quality
          </span>
          <span className="text-cyan-300 font-semibold">
            {stats.resolution || 'Auto Detect'} ({stats.currentLevel >= 0 ? `Level ${stats.currentLevel + 1}/${stats.levelsCount}` : 'Adaptive'})
          </span>
        </div>

        <div className="flex justify-between items-center py-1 border-b border-white/5">
          <span className="text-gray-400 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-rose-400" /> Buffer Health
          </span>
          <span className="text-amber-300 font-semibold">{stats.bufferedAhead.toFixed(1)}s ahead</span>
        </div>

        <div className="flex justify-between items-center py-1 border-b border-white/5">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" /> Frames / Latency
          </span>
          <span className="text-gray-300">
            {stats.droppedFrames} dropped / {stats.totalFrames} total ({stats.latencySec ? `${stats.latencySec.toFixed(1)}s latency` : 'Live'})
          </span>
        </div>

        <div className="pt-2">
          <div className="text-[10px] text-gray-400 mb-1">Source Stream Endpoint:</div>
          <div className="bg-black/60 p-2 rounded text-[10px] text-gray-300 break-all select-all border border-white/5 font-mono max-h-16 overflow-y-auto">
            {streamUrl}
          </div>
        </div>
      </div>
    </div>
  );
};
