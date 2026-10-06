import { useCallback, useEffect, useRef, useState } from 'react';
import type { Viewport } from '../types';
import { clamp } from '../util';

export function useViewport(ref: React.RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const el = ref.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const v = viewportRef.current;
    return {
      x: (sx - rect.left - v.x) / v.scale,
      y: (sy - rect.top - v.y) / v.scale,
    };
  }, [ref]);

  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setViewport((v) => {
      const scale = clamp(v.scale * factor, 0.1, 5);
      const k = scale / v.scale;
      const px = sx - rect.left;
      const py = sy - rect.top;
      return {
        scale,
        x: px - (px - v.x) * k,
        y: py - (py - v.y) * k,
      };
    });
  }, [ref]);

  const centerOn = useCallback((worldX: number, worldY: number, scale?: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setViewport((v) => {
      const s = scale ?? v.scale;
      return {
        scale: s,
        x: rect.width / 2 - worldX * s,
        y: rect.height / 2 - worldY * s,
      };
    });
  }, [ref]);

  const fit = useCallback((w: number, h: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = clamp(Math.min(rect.width / w, rect.height / h) * 0.95, 0.1, 5);
    setViewport({
      scale,
      x: (rect.width - w * scale) / 2,
      y: (rect.height - h * scale) / 2,
    });
  }, [ref]);

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX, e.clientY, factor);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref, zoomAt]);

  return { viewport, setViewport, screenToWorld, zoomAt, centerOn, fit, viewportRef };
}
