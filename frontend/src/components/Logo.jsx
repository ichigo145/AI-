import React from 'react';

/**
 * Vision Up ロゴ。レンズ + 解像度上向き矢印モチーフ。
 */
export default function Logo({ size = 36, withText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow"
      >
        <defs>
          <linearGradient id="vu-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#1A56DB" />
            <stop offset="0.55" stopColor="#3A66ED" />
            <stop offset="1" stopColor="#06B6D4" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#vu-grad)" />
        {/* lens ring */}
        <circle cx="32" cy="32" r="16" stroke="#ffffff" strokeWidth="3" opacity="0.95" />
        {/* aperture / up arrow */}
        <path
          d="M32 22 L41 32 L36 32 L36 42 L28 42 L28 32 L23 32 Z"
          fill="#ffffff"
        />
        {/* sparkle */}
        <circle cx="48" cy="18" r="2.2" fill="#ffffff" opacity="0.9" />
        <circle cx="52" cy="26" r="1.2" fill="#ffffff" opacity="0.7" />
      </svg>
      {withText && (
        <div className="leading-tight">
          <div className="font-display text-xl font-black tracking-tight text-ink">
            Vision Up
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">
            High-Res Engine
          </div>
        </div>
      )}
    </div>
  );
}
