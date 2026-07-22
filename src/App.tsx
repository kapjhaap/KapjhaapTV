import React, { useState, useEffect } from 'react';
import { INITIAL_CHANNELS } from './data/channels';
import { Channel, ProxyMode } from './types';
import { Header } from './components/Header';
import { ExoPlayer } from './components/ExoPlayer';
import { ChannelSidebar } from './components/ChannelSidebar';
import { StreamTesterModal } from './components/StreamTesterModal';
import { ChannelHealthModal } from './components/ChannelHealthModal';
import { Sparkles, Shield, Cpu, Instagram } from 'lucide-react';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(() => {
    const savedCustom = localStorage.getItem('exoplayer_custom_channels');
    if (savedCustom) {
      try {
        const parsed = JSON.parse(savedCustom);
        return [...INITIAL_CHANNELS, ...parsed];
      } catch {
        return INITIAL_CHANNELS;
      }
    }
    return INITIAL_CHANNELS;
  });

  const [selectedChannel, setSelectedChannel] = useState<Channel>(() => {
    return channels[0] || INITIAL_CHANNELS[0];
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    const saved = localStorage.getItem('exoplayer_favorites');
    return saved ? JSON.parse(saved) : ['bein-sports', 't-sports-60fps'];
  });

  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [showHealthModal, setShowHealthModal] = useState<boolean>(false);

  // Toggle favorite
  const handleToggleFavorite = (channelId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      localStorage.setItem('exoplayer_favorites', JSON.stringify(next));
      return next;
    });
  };

  // Add custom channel
  const handleAddChannel = (newChannel: Channel) => {
    setChannels((prev) => {
      const updated = [newChannel, ...prev];
      const customOnly = updated.filter((c) => c.isCustom);
      localStorage.setItem('exoplayer_custom_channels', JSON.stringify(customOnly));
      return updated;
    });
    setSelectedChannel(newChannel);
  };

  // Select next / previous channel for channel surfing
  const handleSelectNextChannel = () => {
    const currentIndex = channels.findIndex((c) => c.id === selectedChannel.id);
    if (currentIndex !== -1 && currentIndex < channels.length - 1) {
      setSelectedChannel(channels[currentIndex + 1]);
    } else {
      setSelectedChannel(channels[0]);
    }
  };

  const handleSelectPrevChannel = () => {
    const currentIndex = channels.findIndex((c) => c.id === selectedChannel.id);
    if (currentIndex > 0) {
      setSelectedChannel(channels[currentIndex - 1]);
    } else {
      setSelectedChannel(channels[channels.length - 1]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans antialiased selection:bg-red-600 selection:text-white">
      {/* Top Header */}
      <Header
        onOpenCustomModal={() => setShowCustomModal(true)}
        onOpenHealthModal={() => setShowHealthModal(true)}
        channelCount={channels.length}
      />

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Video Player Container */}
        <div className="lg:col-span-8 xl:col-span-8 flex flex-col space-y-4">
          <div className="w-full aspect-video min-h-[300px] sm:min-h-[420px] lg:min-h-[500px]">
            <ExoPlayer
              channel={selectedChannel}
              proxyMode="cors_proxy"
              onSelectNextChannel={handleSelectNextChannel}
              onSelectPrevChannel={handleSelectPrevChannel}
            />
          </div>
        </div>

        {/* Right Sidebar Channel Navigation - Compact Box matching player height */}
        <div className="lg:col-span-4 xl:col-span-4 h-[480px] lg:h-[500px] flex flex-col min-h-0">
          <ChannelSidebar
            channels={channels}
            selectedChannel={selectedChannel}
            onSelectChannel={setSelectedChannel}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onOpenCustomModal={() => setShowCustomModal(true)}
            onOpenHealthModal={() => setShowHealthModal(true)}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-[1700px] mx-auto px-4 py-4 mt-auto border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
        <p className="font-sans">
          © 2026 KapjhaapTV by Imran. All rights reserved.
        </p>

        <a
          href="https://www.instagram.com/kapjhaap"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-amber-500/10 border border-pink-500/20 hover:border-pink-500/50 text-gray-300 hover:text-white transition-all group shadow-sm hover:shadow-pink-500/10"
        >
          <Instagram className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform" />
          <span className="text-xs font-medium">Contact us on Instagram</span>
        </a>
      </footer>

      {/* Custom Stream Modal */}
      {showCustomModal && (
        <StreamTesterModal
          onClose={() => setShowCustomModal(false)}
          onAddChannel={handleAddChannel}
        />
      )}

      {/* Channel Health Scan Modal */}
      {showHealthModal && (
        <ChannelHealthModal
          channels={channels}
          onSelectChannel={setSelectedChannel}
          onClose={() => setShowHealthModal(false)}
        />
      )}
    </div>
  );
}
