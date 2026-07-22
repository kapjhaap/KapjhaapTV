import React, { useState } from 'react';
import { Search, Tv, CheckCircle, AlertCircle, Clock, Film } from 'lucide-react';
import { Channel } from '../types';

interface ChannelSidebarProps {
  channels: Channel[];
  selectedChannel: Channel;
  onSelectChannel: (channel: Channel) => void;
  favorites: string[];
  onToggleFavorite: (channelId: string) => void;
  onOpenCustomModal?: () => void;
  onOpenHealthModal?: () => void;
  channelStatuses?: Record<string, { ok: boolean; latencyMs?: number }>;
}

export const ChannelSidebar: React.FC<ChannelSidebarProps> = ({
  channels,
  selectedChannel,
  onSelectChannel,
  favorites,
  onToggleFavorite,
  channelStatuses = {},
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Favorites', 'Sports', 'News', 'Entertainment', 'Custom'];

  const filteredChannels = channels.filter((channel) => {
    const matchesSearch =
      channel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (channel.description && channel.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedCategory === 'Favorites') {
      return favorites.includes(channel.id);
    }

    if (selectedCategory !== 'All') {
      return channel.category === selectedCategory;
    }

    return true;
  });

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-900/90 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">
      {/* Header Bar */}
      <div className="p-3 border-b border-white/10 bg-gray-950/60 flex-shrink-0">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search channels or streams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-black/50 text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-white/10 focus:border-red-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Channel List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {filteredChannels.length === 0 ? (
          <div className="text-center py-12 px-4 space-y-3">
            <Film className="w-10 h-10 text-gray-600 mx-auto" />
            <p className="text-sm font-medium text-gray-400">No channels found</p>
            <p className="text-xs text-gray-500">Try adjusting your search terms or category filter.</p>
          </div>
        ) : (
          filteredChannels.map((channel) => {
            const isSelected = selectedChannel.id === channel.id;
            const isFav = favorites.includes(channel.id);
            const status = channelStatuses[channel.id];

            return (
              <div
                key={channel.id}
                onClick={() => onSelectChannel(channel)}
                className={`group relative flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-red-950/60 to-red-900/40 border-red-500/60 text-white shadow-lg shadow-red-950/50'
                    : 'bg-black/40 hover:bg-white/5 border-white/5 text-gray-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Category / Icon Badge */}
                  <div
                    className={`p-2.5 rounded-lg flex-shrink-0 transition-colors ${
                      isSelected ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400 group-hover:text-white'
                    }`}
                  >
                    <Tv className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-xs text-white truncate max-w-[140px] sm:max-w-[180px]">
                        {channel.name}
                      </h3>

                      {/* Ping Status Indicator */}
                      {status && (
                        <span
                          className="flex items-center gap-0.5 text-[10px]"
                          title={status.ok ? `Online (${status.latencyMs}ms)` : 'Offline / Error'}
                        >
                          {status.ok ? (
                            <CheckCircle className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-red-400" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action Controls */}
                <div className="flex items-center gap-2">
                  {isSelected && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30">
                      <Clock className="w-2.5 h-2.5 animate-spin" /> PLAYING
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
