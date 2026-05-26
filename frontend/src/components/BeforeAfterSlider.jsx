import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Move, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

/**
 * Before / After スライダー比較コンポーネント。
 * - 中央のハンドルをドラッグで左右に比較
 * - ホイール / ピンチでズーム
 * - ズーム中はドラッグでパン
 */
export default function BeforeAfterSlider({ beforeSrc, afterSrc, className = '' }) {
  const containerRef = useRef(null);
  const [position, setPosition] = useState(50); // %
  const [draggingHandle, setDraggingHandle] = useState(false);

  // pan + zoom
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // pinch
  const pinchRef = useRef(null);

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // ── スライダーハンドルのドラッグ ────────────────────
  const updatePositionFromEvent = useCallback((clientX) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const pct = clamp((x / rect.width) * 100, 0, 100);
    setPosition(pct);
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

  // ── ズーム（ホイール） ────────────────────────────
  const onWheel = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const next = clamp(zoom + delta, 1, 6);
    setZoom(next);
    if (next === 1) setOffset({ x: 0, y: 0 });
  };

  // ── パン（ズーム中のみ） ──────────────────────────
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

  // ── ピンチズーム（タッチ） ────────────────────────
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.hypot(dx, dy), zoom };
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      const next = clamp(pinchRef.current.zoom * (d / pinchRef.current.dist), 1, 6);
      setZoom(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
    }
  };
  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const resetZoom = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`;

  return (
    <div
      className={`relative w-full select-none overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDownPan}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ aspectRatio: '16 / 10', cursor: zoom > 1 ? (panning ? 'grabbing' : 'grab') : 'default' }}
    >
      {/* After (背面、全面表示) */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-slate-900"
        style={{ transform, transformOrigin: 'center center', transition: panning ? 'none' : 'transform 0.05s linear' }}
      >
        <img
          src={afterSrc}
          alt="After"
          draggable={false}
          className="h-full w-full object-contain"
        />
      </div>

      {/* Before (前面、clip-path で左側だけ表示) */}
      <div
        className="absolute inset-0 flex items-center justify-center bg-slate-200"
        style={{
          transform,
          transformOrigin: 'center center',
          transition: panning ? 'none' : 'transform 0.05s linear',
          clipPath: `inset(0 ${100 - position}% 0 0)`,
          WebkitClipPath: `inset(0 ${100 - position}% 0 0)`,
        }}
      >
        <img
          src={beforeSrc}
          alt="Before"
          draggable={false}
          className="h-full w-full object-contain"
        />
      </div>

      {/* ラベル */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-900/75 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow">
        Before
      </div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-brand-600/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow">
        After
      </div>

      {/* スライダーライン + ハンドル */}
      <div
        className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_0_1px_rgba(26,86,219,0.4)]"
        style={{ left: `${position}%` }}
      >
        <button
          type="button"
          aria-label="比較スライダーをドラッグ"
          onMouseDown={(e) => {
            e.stopPropagation();
            setDraggingHandle(true);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            setDraggingHandle(true);
          }}
          className="absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white text-brand-700 shadow-lg ring-4 ring-brand-600/30 transition hover:scale-110"
        >
          <Move className="h-5 w-5" />
        </button>
      </div>

      {/* ズームコントロール */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full bg-white/95 px-1.5 py-1 shadow-md backdrop-blur">
        <button
          type="button"
          onClick={() => {
            const next = clamp(zoom - 0.5, 1, 6);
            setZoom(next);
            if (next === 1) setOffset({ x: 0, y: 0 });
          }}
          className="rounded-full p-1.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700"
          aria-label="縮小"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-bold text-slate-700">
          {zoom.toFixed(1)}x
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => clamp(z + 0.5, 1, 6))}
          className="rounded-full p-1.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700"
          aria-label="拡大"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="rounded-full p-1.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700"
          aria-label="リセット"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
