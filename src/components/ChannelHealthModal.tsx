import React, { useState, useEffect } from 'react';
import { X, RefreshCw, CheckCircle2, AlertCircle, Play, Radio, Activity, Zap } from 'lucide-react';
import { Channel } from '../types';

interface ChannelHealthModalProps {
  channels: Channel[];
  onSelectChannel: (channel: Channel) => void;
  onClose: () => void;
}

interface ChannelStatusResult {
  ok: boolean;
  status?: number;
  contentType?: string;
  latencyMs?: number;
  error?: string;
  checking?: boolean;
}

export const ChannelHealthModal: React.FC<ChannelHealthModalProps> = ({
  channels,
  onSelectChannel,
  onClose,
}) => {
  const [statuses, setStatuses] = useState<Record<string, ChannelStatusResult>>({});
  const [isScanning, setIsScanning] = useState(false);

  const runFullScan = async () => {
    setIsScanning(true);
    const initialStatuses: Record<string, ChannelStatusResult> = {};
    channels.forEach((c) => {
      initialStatuses[c.id] = { ok: false, checking: true };
    });
    setStatuses(initialStatuses);

    // Scan in batches of 4 to prevent overwhelming network
    const batchSize = 4;
    for (let i = 0; i < channels.length; i += batchSize) {
      const batch = channels.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (channel) => {
          try {
            const res = await fetch(`/api/check-stream?url=${encodeURIComponent(channel.streamUrl)}`);
            const data = await res.json();
            setStatuses((prev) => ({
              ...prev,
              [channel.id]: { ...data, checking: false },
            }));
          } catch (err: any) {
            setStatuses((prev) => ({
              ...prev,
              [channel.id]: { ok: false, error: err.message, checking: false },
            }));
          }
        })
      );
    }

    setIsScanning(false);
  };

  useEffect(() => {
    runFullScan();
  }, []);

  const totalChannels = channels.length;
  const statusValues = Object.values(statuses) as ChannelStatusResult[];
  const onlineCount = statusValues.filter((s) => s.ok).length;
  const errorCount = statusValues.filter((s) => !s.checking && !s.ok).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-gray-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                Live Channel Health Diagnostic
              </h3>
              <p className="text-xs text-gray-400">
                Ping check across all {totalChannels} stream endpoints
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runFullScan}
              disabled={isScanning}
              className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
              {isScanning ? 'Testing...' : 'Rescan All'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats summary bar */}
        <div className="grid grid-cols-3 gap-2 p-3 bg-black/40 border-b border-white/10 text-center text-xs">
          <div className="p-2 rounded-xl bg-white/5 border border-white/5">
            <div className="text-gray-400 font-medium">Total Channels</div>
            <div className="text-base font-bold text-white mt-0.5">{totalChannels}</div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="text-emerald-400 font-medium">Online & Reachable</div>
            <div className="text-base font-bold text-emerald-300 mt-0.5">{onlineCount}</div>
          </div>
          <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="text-red-400 font-medium">Offline / Token Expired</div>
            <div className="text-base font-bold text-red-300 mt-0.5">{errorCount}</div>
          </div>
        </div>

        {/* Channel Health Grid List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 no-scrollbar">
          {channels.map((channel) => {
            const st = statuses[channel.id] || { checking: true };

            return (
              <div
                key={channel.id}
                className="flex items-center justify-between p-3 rounded-xl bg-black/40 hover:bg-white/5 border border-white/5 transition-all text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-white/5 text-gray-400 flex-shrink-0">
                    <Radio className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="font-semibold text-white truncate max-w-[200px] sm:max-w-[280px]">
                      {channel.name}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono truncate max-w-[200px] sm:max-w-[320px]">
                      {channel.streamUrl}
                    </div>
                  </div>
                </div>

                {/* Status & Action */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {st.checking ? (
                    <span className="flex items-center gap-1.5 text-gray-400 font-medium">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" /> Ping...
                    </span>
                  ) : st.ok ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                        <Zap className="w-3 h-3" /> {st.latencyMs}ms
                      </span>
                      <button
                        onClick={() => {
                          onSelectChannel(channel);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-all flex items-center gap-1 shadow-md shadow-red-600/30"
                      >
                        <Play className="w-3 h-3 fill-current" /> Watch
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Offline
                      </span>
                      <button
                        onClick={() => {
                          onSelectChannel(channel);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 text-[11px] transition-colors"
                      >
                        Try Anyway
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
