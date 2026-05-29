import React from 'react';

/**
 * Vision Up — Brand mark (rebrand v2).
 *
 * デザイン:
 *   - ディープブルーのグラデーション角丸正方形 + 白の "V" モノグラム
 *   - シアンの上向きインジケータ ＋ 解像度を示すドット 3 つ
 *   - サイズ可変、テキスト付き/なし切り替え可能
 */
export default function Logo({ size = 36, withText = true, variant = 'default' }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      {withText && (
        <div className="leading-tight">
          <div
            className={`font-display tracking-tight text-ink ${
              size >= 40 ? 'text-2xl' : 'text-lg'
            } font-black`}
          >
            Vision Up
          </div>
          {variant === 'default' && (
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              High-Res Engine
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LogoMark({ size = 36 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Vision Up"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="vu-bg-2" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1B3F8F" />
          <stop offset="0.55" stopColor="#1A56DB" />
          <stop offset="1" stopColor="#0E2E7A" />
        </linearGradient>
        <linearGradient id="vu-mono-2" x1="320" y1="240" x2="704" y2="784" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE7FE" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1024" height="1024" rx="230" ry="230" fill="url(#vu-bg-2)" />
      <g fill="url(#vu-mono-2)">
        <path d="M 304 296 L 432 296 L 540 612 L 484 612 Z" />
        <path d="M 720 296 L 592 296 L 484 612 L 540 612 Z" />
        <path d="M 484 612 L 540 612 L 528 660 L 496 660 Z" />
      </g>
      <g fill="#22D3EE">
        <path d="M 512 700 L 588 776 L 548 776 L 548 820 L 476 820 L 476 776 L 436 776 Z" />
      </g>
      <g fill="#FFFFFF" opacity="0.85">
        <circle cx="780" cy="244" r="14" />
        <circle cx="824" cy="208" r="9" />
        <circle cx="852" cy="180" r="6" />
      </g>
    </svg>
  );
}
