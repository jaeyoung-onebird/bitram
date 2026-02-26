import React from "react";

export function BitramMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bg-grad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5BA8FB" />
          <stop offset="50%" stopColor="#3182F6" />
          <stop offset="100%" stopColor="#1B5FD4" />
        </linearGradient>
        <linearGradient id="shine" x1="10" y1="10" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="shadow" x="-30%" y="-10%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#1B5FD4" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Drop shadow glow */}
      <ellipse cx="32" cy="58" rx="18" ry="4" fill="#3182F6" opacity="0.35" />

      {/* Chip body */}
      <rect x="10" y="9" width="44" height="44" rx="10" fill="url(#bg-grad)" filter="url(#shadow)" />

      {/* Shine overlay */}
      <rect x="10" y="9" width="44" height="44" rx="10" fill="url(#shine)" />

      {/* Chip pins - top */}
      <g stroke="#A8C8F8" strokeWidth="2.2" strokeLinecap="round" opacity="0.85">
        <line x1="23" y1="4" x2="23" y2="10" />
        <line x1="32" y1="4" x2="32" y2="10" />
        <line x1="41" y1="4" x2="41" y2="10" />
        {/* bottom */}
        <line x1="23" y1="53" x2="23" y2="59" />
        <line x1="32" y1="53" x2="32" y2="59" />
        <line x1="41" y1="53" x2="41" y2="59" />
        {/* left */}
        <line x1="4" y1="22" x2="10" y2="22" />
        <line x1="4" y1="31" x2="10" y2="31" />
        <line x1="4" y1="40" x2="10" y2="40" />
        {/* right */}
        <line x1="54" y1="22" x2="60" y2="22" />
        <line x1="54" y1="31" x2="60" y2="31" />
        <line x1="54" y1="40" x2="60" y2="40" />
      </g>

      {/* Inner die area */}
      <rect x="17" y="16" width="30" height="30" rx="5" fill="#0D2B6E" opacity="0.25" />

      {/* B monogram */}
      <path
        d="M25 19h9.5c3.6 0 6 2 6 5 0 2-1.1 3.5-2.9 4.3 2.4.8 3.9 2.7 3.9 5.1 0 3.6-2.9 5.6-7 5.6H25V19zm8 8.5c1.8 0 3-1 3-2.5s-1.2-2.4-3-2.4h-4.2v4.9H33zm.6 9.3c2.3 0 3.7-1.2 3.7-2.9 0-1.7-1.4-2.9-3.7-2.9h-4.8v5.8h4.8z"
        fill="white"
        opacity="0.97"
      />
    </svg>
  );
}

export function BitramWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-black tracking-tight text-slate-800 dark:text-white">
        BIT<span className="text-blue-500">RAM</span>
      </span>
    </span>
  );
}

export default function BitramLogo({
  className,
  markClassName = "h-7 w-7",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className || ""}`}>
      <BitramMark className={markClassName} />
      <BitramWordmark className="text-lg" />
    </span>
  );
}
