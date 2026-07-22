import React, { useState } from 'react';
import { X, Play, CheckCircle2, AlertCircle, RefreshCw, Key, Sparkles } from 'lucide-react';
import { Channel } from '../types';

interface StreamTesterModalProps {
  onClose: () => void;
  onAddChannel: (channel: Channel) => void;
}

export const StreamTesterModal: React.FC<StreamTesterModalProps> = ({
  onClose,
  onAddChannel,
}) => {
  const [name, setName] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [category, setCategory] = useState<'Sports' | 'News' | 'Entertainment' | 'Custom'>('Custom');
  const [referer, setReferer] = useState('');
  const [userAgent, setUserAgent] = useState('');

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    status?: number;
    contentType?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  const handleTestStream = async () => {
    if (!streamUrl.trim()) return;

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/check-stream?url=${encodeURIComponent(streamUrl.trim())}`);
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        ok: false,
        error: err.message || 'Failed to connect to proxy check server.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamUrl.trim() || !name.trim()) return;

    const customHeaders: Record<string, string> = {};
    if (referer.trim()) customHeaders['Referer'] = referer.trim();
    if (userAgent.trim()) customHeaders['User-Agent'] = userAgent.trim();

    const newChan: Channel = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      streamUrl: streamUrl.trim(),
      category,
      isCustom: true,
      httpHeaders: Object.keys(customHeaders).length > 0 ? customHeaders : undefined,
      description: 'User added custom stream',
    };

    onAddChannel(newChan);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-gray-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Add & Test Custom Stream</h3>
              <p className="text-xs text-gray-400">Play any M3U8 stream with automatic CORS bypass</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Stream Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-gray-300">Stream Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. My Sports HD"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/60 text-white text-xs p-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-black/60 text-white text-xs p-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none"
              >
                <option value="Sports">Sports</option>
                <option value="News">News</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          {/* Stream M3U8 URL */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-300">M3U8 / HLS Stream URL *</label>
            <div className="flex gap-2">
              <input
                type="url"
                required
                placeholder="https://example.com/live/index.m3u8"
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                className="flex-1 bg-black/60 text-white text-xs p-2.5 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleTestStream}
                disabled={testing || !streamUrl.trim()}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
              >
                {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-red-400" />} Test URL
              </button>
            </div>
          </div>

          {/* Test Result Feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs space-y-1 animate-fade-in ${
                testResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                )}
                {testResult.ok ? 'Stream Reachable & Valid' : 'Stream Check Failed'}
              </div>

              {testResult.ok && (
                <div className="text-[11px] space-y-0.5 text-gray-300">
                  <div>Latency: <span className="font-bold text-emerald-400">{testResult.latencyMs}ms</span></div>
                  <div>Content Type: <span className="font-mono text-gray-300">{testResult.contentType || 'unknown'}</span></div>
                </div>
              )}

              {testResult.error && <div className="text-[11px] text-red-400">{testResult.error}</div>}
            </div>
          )}

          {/* Optional HTTP Custom Headers */}
          <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 space-y-3">
            <div className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" /> Custom Headers (Optional)
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400">Referer Header</label>
                <input
                  type="text"
                  placeholder="https://origin-site.com"
                  value={referer}
                  onChange={(e) => setReferer(e.target.value)}
                  className="w-full bg-black/60 text-white text-xs p-2 rounded-lg border border-white/10 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-gray-400">User-Agent Header</label>
                <input
                  type="text"
                  placeholder="Mozilla/5.0 (Windows NT 10.0...)"
                  value={userAgent}
                  onChange={(e) => setUserAgent(e.target.value)}
                  className="w-full bg-black/60 text-white text-xs p-2 rounded-lg border border-white/10 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all shadow-lg shadow-red-600/30"
            >
              Add & Play Stream
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
