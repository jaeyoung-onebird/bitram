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
        <linearGradient id="bitram-g" x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3182F6" />
          <stop offset="1" stopColor="#1B64DA" />
        </linearGradient>
        <linearGradient id="bitram-inner" x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5BA8FB" />
          <stop offset="1" stopColor="#3182F6" />
        </linearGradient>
      </defs>

      {/* Chip body - rounded square */}
      <rect x="10" y="10" width="44" height="44" rx="10" fill="url(#bitram-g)" />

      {/* Chip pins - top */}
      <g stroke="#5BA8FB" strokeWidth="2.5" strokeLinecap="round" opacity="0.7">
        <path d="M24 4v8" />
        <path d="M32 4v8" />
        <path d="M40 4v8" />
        {/* bottom */}
        <path d="M24 52v8" />
        <path d="M32 52v8" />
        <path d="M40 52v8" />
        {/* left */}
        <path d="M4 24h8" />
        <path d="M4 32h8" />
        <path d="M4 40h8" />
        {/* right */}
        <path d="M52 24h8" />
        <path d="M52 32h8" />
        <path d="M52 40h8" />
      </g>

      {/* Inner die area */}
      <rect x="18" y="18" width="28" height="28" rx="4" fill="#0D2B5E" opacity="0.3" />

      {/* Circuit traces */}
      <g stroke="#B3D4FC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
        <path d="M20 22h4l4 4" />
        <path d="M44 42h-4l-4-4" />
      </g>

      {/* B monogram - bold, clean */}
      <path
        d="M26 21h8c3.2 0 5.5 1.8 5.5 4.5 0 1.8-1 3.2-2.6 3.9 2.1.7 3.4 2.4 3.4 4.5 0 3.2-2.7 5.1-6.3 5.1H26V21zm7.2 7.5c1.6 0 2.6-.9 2.6-2.2 0-1.3-1-2.1-2.6-2.1H30v4.3h3.2zm.5 8.3c2 0 3.2-1 3.2-2.5s-1.2-2.5-3.2-2.5H30v5h3.7z"
        fill="white"
        opacity="0.95"
      />
    </svg>
  );
}

export function BitramWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-black tracking-tight text-slate-800 dark:text-slate-100">
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
