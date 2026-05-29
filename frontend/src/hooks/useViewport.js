import { useEffect, useState } from 'react';

/**
 * デバイス判定 hook。
 * - User-Agent と画面幅の両方から判定し、より正確に分類する。
 * - リサイズに追随。
 */
export function useViewport() {
  const detect = () => {
    if (typeof window === 'undefined') {
      return { isMobile: false, isIOS: false, isAndroid: false, isTouch: false, width: 1024 };
    }
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
    const isAndroid = /Android/i.test(ua);
    const uaMobile = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(ua);
    const w = window.innerWidth;
    const isMobile = uaMobile || w < 768;
    const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
    return { isMobile, isIOS, isAndroid, isTouch, width: w };
  };

  const [vp, setVp] = useState(detect);

  useEffect(() => {
    let raf = null;
    const handler = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(detect()));
    };
    window.addEventListener('resize', handler);
    window.addEventListener('orientationchange', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', handler);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return vp;
}
