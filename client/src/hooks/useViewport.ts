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

  /**
   * Pinch to zoom. Tracked here so the gesture math sits with the rest of the
   * viewport handling; the board only reports which pointers are down.
   */
  type PinchPoint = { id: number; x: number; y: number };
  type PinchState = {
    points: PinchPoint[];
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number } | null;
    moved: boolean;
  };
  const pinchRef = useRef<PinchState | null>(null);

  const pinchBegin = useCallback((id: number, clientX: number, clientY: number) => {
    const p = pinchRef.current;
    if (!p) {
      pinchRef.current = {
        points: [{ id, x: clientX, y: clientY }],
        startDist: 0,
        startScale: viewportRef.current.scale,
        startMid: null,
        moved: false,
      };
      return;
    }
    if (p.points.some((q) => q.id === id)) return;
    p.points.push({ id, x: clientX, y: clientY });
    if (p.points.length === 2) {
      const [a, b] = p.points;
      p.startDist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      p.startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      p.moved = false;
    }
  }, []);

  /** Returns true while a pinch is active, so the board can ignore drawing. */
  const pinchMove = useCallback(
    (id: number, clientX: number, clientY: number) => {
      const p = pinchRef.current;
      if (!p || p.points.length < 2) return false;
      const pt = p.points.find((q) => q.id === id);
      if (!pt) return false;
      pt.x = clientX;
      pt.y = clientY;
      const [a, b] = p.points;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (!dist || !p.startDist) return false;
      p.moved = true;
      const target = clamp((dist / p.startDist) * p.startScale, 0.1, 5);
      const mid = p.startMid || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return false;
      const v = viewportRef.current;
      const px = mid.x - rect.left;
      const py = mid.y - rect.top;
      const k = target / v.scale;
      setViewport({
        scale: target,
        x: px - (px - v.x) * k,
        y: py - (py - v.y) * k,
      });
      return true;
    },
    [ref, setViewport],
  );

  /** True if the gesture that just ended was a pinch, not a single drag. */
  const pinchEnd = useCallback((id: number) => {
    const p = pinchRef.current;
    if (!p) return false;
    p.points = p.points.filter((q) => q.id !== id);
    if (p.points.length < 2) {
      const wasPinch = p.moved;
      pinchRef.current = null;
      return wasPinch;
    }
    return false;
  }, []);

  return {
    viewport,
    setViewport,
    screenToWorld,
    zoomAt,
    centerOn,
    fit,
    viewportRef,
    pinchBegin,
    pinchMove,
    pinchEnd,
  };
}
