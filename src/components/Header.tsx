import React from 'react';
import { KapjhaapLogo } from './KapjhaapLogo';

interface HeaderProps {
  onOpenCustomModal?: () => void;
  onOpenHealthModal?: () => void;
  channelCount?: number;
}

export const Header: React.FC<HeaderProps> = () => {
  return (
    <header className="w-full bg-gray-950/80 border-b border-white/10 backdrop-blur-xl px-4 sm:px-6 py-2.5 flex items-center justify-between sticky top-0 z-40">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-3">
        <KapjhaapLogo size="md" />
        <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-mono font-bold text-gray-300">
          V2.18
        </span>
      </div>
    </header>
  );
};
