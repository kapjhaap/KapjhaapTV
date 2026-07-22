import React, { useState } from 'react';

interface KapjhaapLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const KapjhaapLogo: React.FC<KapjhaapLogoProps> = ({ className = '', size = 'md' }) => {
  const [imgError, setImgError] = useState(false);

  const heights = {
    sm: 'h-8 sm:h-9',
    md: 'h-10 sm:h-12',
    lg: 'h-14 sm:h-16',
  }[size];

  return (
    <div className={`inline-flex items-center group cursor-pointer ${className}`}>
      {!imgError ? (
        <img
          src="/logo.png"
          alt="KapjhaapTV Logo"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${heights} w-auto object-contain filter drop-shadow-[0_2px_12px_rgba(255,255,255,0.25)] transition-transform duration-200 group-hover:scale-105`}
        />
      ) : (
        <svg
          viewBox="0 0 620 180"
          className={`${heights} w-auto object-contain filter drop-shadow-[0_2px_12px_rgba(255,255,255,0.25)] transition-transform duration-200 group-hover:scale-105`}
          aria-label="Kapjhaap TV Logo"
        >
          <defs>
            <linearGradient id="silver-bright" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="25%" stopColor="#F8FAFC" />
              <stop offset="60%" stopColor="#E2E8F0" />
              <stop offset="85%" stopColor="#CBD5E1" />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>
            <linearGradient id="tv-silver" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="50%" stopColor="#CBD5E1" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>
            <linearGradient id="star-light-facet" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#E2E8F0" />
            </linearGradient>
            <linearGradient id="star-dark-facet" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#CBD5E1" />
              <stop offset="100%" stopColor="#64748B" />
            </linearGradient>
            <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.8" />
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#FFFFFF" floodOpacity="0.25" />
            </filter>
          </defs>
          <g filter="url(#logo-glow)">
            <text
              x="20"
              y="125"
              fill="url(#silver-bright)"
              stroke="#1E293B"
              strokeWidth="2"
              style={{
                fontFamily: "'Great Vibes', 'Dancing Script', 'Brush Script MT', cursive",
                fontSize: '115px',
                fontWeight: 700,
                letterSpacing: '1px',
              }}
            >
              Kapjhaap
            </text>
            <path
              d="M 230 138 Q 330 148 440 168 Q 330 142 235 136 Z"
              fill="url(#silver-bright)"
              stroke="#1E293B"
              strokeWidth="0.8"
            />
            <g transform="translate(195, 48) scale(0.65)">
              <path d="M 0,-30 L 7,-9 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 0,-30 L -7,-9 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M 28,-9 L 11,3 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 7,-9 L 28,-9 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M 17,24 L 0,12 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 11,3 L 17,24 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M -17,24 L -11,3 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 0,12 L -17,24 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M -28,-9 L -7,-9 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M -11,3 L -28,-9 L 0,0 Z" fill="url(#star-dark-facet)" />
            </g>
            <g transform="translate(365, 58) scale(0.58)">
              <path d="M 0,-30 L 7,-9 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 0,-30 L -7,-9 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M 28,-9 L 11,3 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 7,-9 L 28,-9 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M 17,24 L 0,12 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 11,3 L 17,24 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M -17,24 L -11,3 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M 0,12 L -17,24 L 0,0 Z" fill="url(#star-dark-facet)" />
              <path d="M -28,-9 L -7,-9 L 0,0 Z" fill="url(#star-light-facet)" />
              <path d="M -11,3 L -28,-9 L 0,0 Z" fill="url(#star-dark-facet)" />
            </g>
            <text
              x="455"
              y="118"
              fill="url(#tv-silver)"
              stroke="#0F172A"
              strokeWidth="1.5"
              style={{
                fontFamily: "'Montserrat', sans-serif",
                fontSize: '85px',
                fontWeight: 900,
                letterSpacing: '-2px',
              }}
            >
              TV
            </text>
          </g>
        </svg>
      )}
    </div>
  );
};

