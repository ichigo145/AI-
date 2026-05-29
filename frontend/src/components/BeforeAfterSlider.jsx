import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Move, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

/**
 * Before / After スライダー比較コンポーネント (v2)。
 * - 中央のハンドルをドラッグで左右に比較
 * - ホイール / ピンチでズーム (比較枠内のみ。ページズームはブロック)
 * - ズーム中はドラッグでパン
 * - タッチ操作中はページ全体のスクロール / ピンチをキャンセル
 */
export default function BeforeAfterSlider({ beforeSrc, afterSrc, className = '' }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50);
  const [draggingHandle, setDraggingHandle] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const pinchRef = useRef(null);
  const touchStartedInside = useRef(false);

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // ── スライダーハンドルのドラッグ ─────────────────
  const updatePositionFromEvent = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    setPosition(clamp((x / rect.width) * 100, 0, 100));
  }, []);

  useEffect(() => {
    if (!draggingHandle) return;
    const onMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      updatePositionFromEvent(cx);
    };
    const onUp = () => setDraggingHandle(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [draggingHandle, updatePositionFromEvent]);

  // ── ホイールズーム (ブラウザのページズームを抑制) ─
  // React の onWheel は passive: true がデフォルトのため、
  // preventDefault が効かない。addEventListener で passive: false 指定。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      // Ctrl + ホイール や trackpad pinch を含めて常に preventDefault
      e.preventDefault();
      const delta = -e.deltaY * 0.0018;
      setZoom((z) => {
        const next = clamp(z + delta, 1, 6);
        if (next === 1) setOffset({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── パン (ズーム中のみ) ─────────────────────────
  const onMouseDownPan = (e) => {
    if (zoom <= 1 || draggingHandle) return;
    e.preventDefault();
    setPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  useEffect(() => {
    if (!panning) return;
    const onMove = (e) => {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
    };
    const onUp = () => setPanning(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panning]);

  // ── ピンチズーム (タッチ) - ページ全体のピンチを抑制 ─
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      touchStartedInside.current = true;
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.hypot(dx, dy);
        const next = clamp(pinchRef.current.zoom * (d / pinchRef.current.dist), 1, 6);
        setZoom(next);
        if (next === 1) setOffset({ x: 0, y: 0 });
      } else if (zoom > 1 && e.touches.length === 1) {
        // 1本指パン
        e.preventDefault();
      }
    };
    const onTouchEnd = () => {
      pinchRef.current = null;
      touchStartedInside.current = false;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [zoom]);

  // ── iOS Safari の gesturestart などをブロック ─────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const block = (e) => e.preventDefault();
    el.addEventListener('gesturestart', block);
    el.addEventListener('gesturechange', block);
    el.addEventListener('gestureend', block);
    return () => {
      el.removeEventListener('gesturestart', block);
      el.removeEventListener('gesturechange', block);
      el.removeEventListener('gestureend', block);
    };
  }, []);

  const resetZoom = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDownPan}
      className={`compare-zone relative w-full select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}
      style={{
        aspectRatio: '16 / 10',
        cursor: zoom > 1 ? (panning ? 'grabbing' : 'grab') : 'default',
      }}
    >
      {/* After */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-slate-900"
        style={{
          transform,
          transformOrigin: 'center center',
          transition: panning ? 'none' : 'transform 0.06s linear',
        }}
      >
        {afterSrc && (
          <img src={afterSrc} alt="After" draggable={false} className="h-full w-full object-contain" />
        )}
      </div>

      {/* Before (clip-path で左側のみ) */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-slate-200"
        style={{
          transform,
          transformOrigin: 'center center',
          transition: panning ? 'none' : 'transform 0.06s linear',
          clipPath: `inset(0 ${100 - position}% 0 0)`,
          WebkitClipPath: `inset(0 ${100 - position}% 0 0)`,
        }}
      >
        {beforeSrc && (
          <img src={beforeSrc} alt="Before" draggable={false} className="h-full w-full object-contain" />
        )}
      </div>

      <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
        Before
      </div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-brand-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
        After
      </div>

      {/* スライダーライン */}
      <div
        className="absolute inset-y-0 z-10 w-px -translate-x-1/2 bg-white"
        style={{ left: `${position}%`, boxShadow: '0 0 0 1px rgba(26, 86, 219, 0.3)' }}
      >
        <button
          type="button"
          aria-label="比較スライダー"
          onMouseDown={(e) => {
            e.stopPropagation();
            setDraggingHandle(true);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setDraggingHandle(true);
          }}
          className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-brand-700 shadow-md ring-1 ring-brand-200 transition hover:scale-105"
        >
          <Move className="h-4 w-4" />
        </button>
      </div>

      {/* ズームコントロール */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-lg bg-white/95 px-1 py-1 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            const next = clamp(zoom - 0.5, 1, 6);
            setZoom(next);
            if (next === 1) setOffset({ x: 0, y: 0 });
          }}
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"
          aria-label="縮小"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[2.6rem] text-center text-[11px] font-bold tabular-nums text-slate-700">
          {zoom.toFixed(1)}×
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => clamp(z + 0.5, 1, 6))}
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"
          aria-label="拡大"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"
          aria-label="リセット"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
