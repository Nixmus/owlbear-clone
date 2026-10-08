import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import Icon from './Icon';
import { can, type Role } from '../permissions';
import type { Drawing, FogShape, Token, Tool } from '../types';
import { useViewport } from '../hooks/useViewport';
import { clamp, nanoid } from '../util';
import type { Vec } from '../util';

interface Props {
  tool: Tool;
  color: string;
  strokeWidth: number;
  fogOccludes: boolean;
  brushSize: number;
  gmFogTransparent: boolean;
}

type Drag =
  | { type: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { type: 'token'; id: string; offsetX: number; offsetY: number; moved: boolean }
  | { type: 'resize'; id: string; startSize: number; startX: number; startY: number }
  | { type: 'draw'; points: number[] }
  | { type: 'fog'; start: Vec; current: Vec }
  | { type: 'ruler'; start: Vec; current: Vec }
  | { type: 'erase'; current: Vec }
  | { type: 'marquee' }
  | null;

export default function Board({ tool, color, strokeWidth, fogOccludes, brushSize, gmFogTransparent }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const { viewport, setViewport, screenToWorld, centerOn, fit } = useViewport(boardRef);

  const state = useStore((s) => s.state);
  const self = useStore((s) => s.self);
  const cursors = useStore((s) => s.cursors);
  const pings = useStore((s) => s.pings);
  const previewSceneId = useStore((s) => s.previewSceneId);
  const dispatch = useStore((s) => s.dispatch);
  const send = useStore((s) => s.send);
  const logEvent = useStore((s) => s.logEvent);

  // The GM can preview a non-active scene locally without changing it for others.
  const activeScene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const scene =
    (previewSceneId && state.scenes.find((s) => s.id === previewSceneId)) || activeScene;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  // notify the app (Inspector) about the current selection
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vtt:selection', { detail: selectedId }));
  }, [selectedId]);

  const [drag, setDrag] = useState<Drag>(null);
  const [draftPoints, setDraftPoints] = useState<number[] | null>(null);
  const [draftFog, setDraftFog] = useState<{ a: Vec; b: Vec; mode: 'reveal' | 'hide' } | null>(null);
  const [ruler, setRuler] = useState<{ a: Vec; b: Vec } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const lastCursorSent = useRef(0);

  const sceneTokens = useMemo(
    () => state.tokens.filter((t) => t.sceneId === scene?.id),
    [state.tokens, scene?.id],
  );
  const sceneDrawings = useMemo(
    () => state.drawings.filter((d) => d.sceneId === scene?.id),
    [state.drawings, scene?.id],
  );
  const sceneFog = useMemo(
    () => state.fog.filter((f) => f.sceneId === scene?.id),
    [state.fog, scene?.id],
  );

  const isGM = self.role === 'gm';
  const role = (self.role as Role) || 'player';
  const selected = sceneTokens.find((t) => t.id === selectedId) || null;

  /* ---------------- fit initial view ---------------- */
  useEffect(() => {
    if (scene) fit(scene.width, scene.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.id]);

  /* ---------------- focus requests (move camera) ---------------- */
  useEffect(() => {
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number; sceneId: string }>).detail;
      if (!d || d.sceneId !== scene?.id) return;
      centerOn(d.x, d.y);
    };
    window.addEventListener('vtt:focus', onFocus);
    return () => window.removeEventListener('vtt:focus', onFocus);
  }, [scene?.id, centerOn]);

  /* ---------------- ping wheel state ---------------- */
  const [wheel, setWheel] = useState<{ screenX: number; screenY: number; worldX: number; worldY: number } | null>(null);
  const [pingCooldownUntil, setPingCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  function sendPing(kind: 'ping' | 'focus') {
    if (!wheel || !scene) return;
    if (!isGM && Date.now() < pingCooldownUntil) return;
    send({
      type: 'ping',
      x: wheel.worldX,
      y: wheel.worldY,
      sceneId: scene.id,
      kind,
    });
    // Show it locally too
    useStore.getState().addPing(self.id, {
      x: wheel.worldX,
      y: wheel.worldY,
      sceneId: scene.id,
      kind,
    });
    if (!isGM) setPingCooldownUntil(Date.now() + 5000);
    setWheel(null);
  }

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.code === 'Space') {
        setSpaceDown(true);
        e.preventDefault();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const t = state.tokens.find((x) => x.id === selectedId);
        const mine = t && (!t.owner || t.owner === self.id);
        if (t && !t.locked && (can(role, 'token.deleteAny') || mine)) {
          dispatch({ kind: 'token.remove', id: selectedId });
        }
        setSelectedId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        if (can(role, 'draw')) dispatch({ kind: 'drawing.remove', id: selectedDrawingId });
        setSelectedDrawingId(null);
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setSelectedDrawingId(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [selectedId, selectedDrawingId, state.tokens, dispatch, role, self.id]);

  /* ---------------- pointer ---------------- */
  const panning = tool === 'pan' || spaceDown;

  function worldAt(e: React.PointerEvent | PointerEvent): Vec {
    return screenToWorld(e.clientX, e.clientY);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!scene) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const w = worldAt(e);

    if (panning) {
      setDrag({ type: 'pan', startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y });
      return;
    }

    switch (tool) {
      case 'select': {
        // clicked on empty board -> deselect
        setSelectedId(null);
        setSelectedDrawingId(null);
        setDrag({ type: 'marquee' });
        break;
      }
      case 'ruler':
        if (!can(role, 'measure')) break;
        setDrag({ type: 'ruler', start: w, current: w });
        setRuler({ a: w, b: w });
        break;
      case 'fog-reveal':
      case 'fog-hide': {
        if (!can(role, 'fog.edit')) break;
        const mode = tool === 'fog-reveal' ? 'reveal' : 'hide';
        // stroke mode with brush: paint a small square immediately
        setDrag({ type: 'fog', start: w, current: w });
        setDraftFog({ a: w, b: w, mode });
        break;
      }
      case 'pen':
      case 'line':
      case 'rect':
      case 'circle':
        if (!can(role, 'draw')) break;
        setDrag({ type: 'draw', points: [w.x, w.y, w.x, w.y] });
        setDraftPoints([w.x, w.y, w.x, w.y]);
        break;
      case 'eraser': {
        if (!can(role, 'draw')) break;
        // erase while dragging too
        eraseAt(w);
        setDrag({ type: 'erase', current: w });
        break;
      }
      case 'ping': {
        // open the radial ping wheel at this point
        const rect = boardRef.current?.getBoundingClientRect();
        if (rect) {
          setWheel({
            screenX: e.clientX - rect.left,
            screenY: e.clientY - rect.top,
            worldX: w.x,
            worldY: w.y,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const w = worldAt(e);

    // broadcast our cursor (throttled)
    const now = performance.now();
    if (now - lastCursorSent.current > 60 && scene) {
      lastCursorSent.current = now;
      send({ type: 'cursor', x: w.x, y: w.y, sceneId: scene.id });
    }

    if (!drag) return;

    switch (drag.type) {
      case 'pan':
        setViewport((v) => ({
          ...v,
          x: drag.vx + (e.clientX - drag.startX),
          y: drag.vy + (e.clientY - drag.startY),
        }));
        break;
      case 'token': {
        const token = state.tokens.find((t) => t.id === drag.id);
        if (!token || token.locked) return;
        const step = scene.gridSize;
        let nx = w.x - drag.offsetX;
        let ny = w.y - drag.offsetY;
        if (e.shiftKey) {
          nx = Math.round(nx / step) * step;
          ny = Math.round(ny / step) * step;
        }
        dispatch({ kind: 'token.update', id: drag.id, patch: { x: nx, y: ny } });
        setDrag({ ...drag, moved: true });
        break;
      }
      case 'resize': {
        const size = clamp(drag.startSize + (w.x - drag.startX) / scene.gridSize, 0.25, 20);
        dispatch({ kind: 'token.update', id: drag.id, patch: { size } });
        break;
      }
      case 'draw': {
        const pts = [...drag.points];
        if (tool === 'pen') {
          pts.push(w.x, w.y);
        } else {
          pts[2] = w.x;
          pts[3] = w.y;
        }
        setDraftPoints(pts);
        setDrag({ ...drag, points: pts });
        break;
      }
      case 'fog':
        setDraftFog({ a: drag.start, b: w, mode: draftFog?.mode || 'reveal' });
        break;
      case 'ruler':
        setDrag({ ...drag, current: w });
        setRuler({ a: drag.start, b: w });
        break;
      case 'erase': {
        eraseAt(w);
        setDrag({ ...drag, current: w });
        break;
      }
      default:
        break;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    switch (drag.type) {
      case 'token': {
        const t = state.tokens.find((x) => x.id === drag.id);
        if (t && drag.moved) logEvent({ kind: 'token.move', text: `${self.name} movió "${t.name}"` });
        break;
      }
      case 'draw': {
        if (!draftPoints || draftPoints.length < 4) break;
        const drawing: Drawing = {
          id: nanoid(),
          sceneId: scene.id,
          kind: tool as Drawing['kind'],
          color,
          width: strokeWidth,
          points: draftPoints,
        };
        dispatch({ kind: 'drawing.add', drawing });
        break;
      }
      case 'fog': {
        if (!draftFog) break;
        const shape = fogShapeFromDraft(draftFog, scene.id, brushSize);
        if (shape) dispatch({ kind: 'fog.add', shape });
        break;
      }
      case 'ruler':
        // keep ruler visible until next action; nothing to persist
        break;
      default:
        break;
    }
    setDrag(null);
    setDraftPoints(null);
    setDraftFog(null);
    void e;
  }

  function onTokenPointerDown(e: React.PointerEvent, token: Token) {
    if (panning || tool !== 'select') return;
    e.stopPropagation();
    if (token.hidden && !isGM) return;
    // Players may only move their own (or unowned) tokens.
    const mine = !token.owner || token.owner === self.id;
    const canMove = can(role, 'token.moveAny') || mine;
    if (!canMove || token.locked) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelectedId(token.id);
    const w = worldAt(e);
    setDrag({
      type: 'token',
      id: token.id,
      offsetX: w.x - token.x,
      offsetY: w.y - token.y,
      moved: false,
    });
  }

  /* ---------------- helpers ---------------- */
  function eraseAt(w: Vec) {
    const r = 24 / viewport.scale + strokeWidth;
    for (const d of sceneDrawings) {
      if (drawingHit(d, w, r)) {
        dispatch({ kind: 'drawing.remove', id: d.id });
      }
    }
  }

  function fogShapeFromDraft(
    d: { a: Vec; b: Vec; mode: 'reveal' | 'hide' },
    sceneId: string,
    radius: number,
  ): FogShape | null {
    const x = Math.min(d.a.x, d.b.x);
    const y = Math.min(d.a.y, d.b.y);
    const w = Math.abs(d.b.x - d.a.x);
    const h = Math.abs(d.b.y - d.a.y);
    // treat as brush dot if drag is tiny
    if (w < 4 && h < 4) {
      return {
        id: nanoid(),
        sceneId,
        mode: d.mode,
        points: [d.a.x - radius, d.a.y - radius, d.a.x + radius, d.a.y + radius],
      };
    }
    return { id: nanoid(), sceneId, mode: d.mode, points: [x, y, x + w, y + h] };
  }

  /* ---------------- grid ---------------- */
  const gridPath = useMemo(() => {
    if (!scene || scene.gridType === 'none') return null;
    const { gridSize: g, width, height } = scene;
    if (scene.gridType === 'hex') {
      const r = g / 2;
      const hStep = r * 1.5;
      const vStep = Math.sqrt(3) * r;
      const parts: string[] = [];
      for (let x = 0, col = 0; x < width + g; x += hStep, col++) {
        for (let y = (col % 2 ? 0 : vStep / 2); y < height + vStep; y += vStep) {
          const pts: string[] = [];
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 180) * (60 * i - 30);
            pts.push(`${x + r * Math.cos(a)},${y + r * Math.sin(a)}`);
          }
          parts.push(`M${pts.join('L')}Z`);
        }
      }
      return parts.join(' ');
    }
    const parts: string[] = [];
    for (let x = 0; x <= width; x += g) parts.push(`M${x} 0V${height}`);
    for (let y = 0; y <= height; y += g) parts.push(`M0 ${y}H${width}`);
    return parts.join(' ');
  }, [scene?.gridType, scene?.gridSize, scene?.width, scene?.height]);

  if (!scene) return <div className="board" ref={boardRef} />;

  const fogActive = sceneFog.length > 0;

  return (
    <div
      className="board"
      ref={boardRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      style={{
        cursor: panning ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
        touchAction: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="world"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
        }}
      >
        {/* Map */}
        <div
          className="map-layer"
          style={{ width: scene.width, height: scene.height, background: scene.backgroundColor }}
        >
          {scene.mapUrl && showMap && (
            <img
              className="map-img"
              src={scene.mapUrl}
              width={scene.width}
              height={scene.height}
              draggable={false}
              alt=""
            />
          )}
        </div>

        {/* Grid */}
        {gridPath && (
          <svg className="grid-svg" width={scene.width} height={scene.height}>
            <path d={gridPath} stroke={scene.gridColor} fill="none" strokeWidth={1} />
          </svg>
        )}

        {/* Drawings */}
        <svg
          className="grid-svg"
          width={scene.width}
          height={scene.height}
          style={{ overflow: 'visible', pointerEvents: tool === 'select' ? 'auto' : 'none' }}
        >
          {sceneDrawings.map((d) => (
            <g
              key={d.id}
              onPointerDown={(e) => {
                if (tool !== 'select') return;
                e.stopPropagation();
                setSelectedDrawingId(d.id);
                setSelectedId(null);
              }}
              style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}
            >
              {/* invisible thick hit area for easier clicking */}
              <DrawingShape d={d} hit />
              <DrawingShape d={d} selected={d.id === selectedDrawingId} />
            </g>
          ))}
          {draftPoints && (
            <DrawingShape
              d={{
                id: 'draft',
                sceneId: scene.id,
                kind: tool as Drawing['kind'],
                color: color + 'cc',
                width: strokeWidth,
                points: draftPoints,
              }}
            />
          )}

          {/* Ruler */}
          {ruler && drag?.type === 'ruler' && (
            <RulerShape a={ruler.a} b={ruler.b} gridSize={scene.gridSize} />
          )}
        </svg>

        {/* Tokens */}
        {sceneTokens.map((t) => (
          <TokenView
            key={t.id}
            token={t}
            gridSize={scene.gridSize}
            selected={t.id === selectedId}
            isGM={isGM}
            selfId={self.id}
            onPointerDown={(e) => onTokenPointerDown(e, t)}
          />
        ))}

        {/* Fog of war */}
        {fogActive && (
          <FogLayer
            scene={scene}
            shapes={sceneFog}
            draft={draftFog}
            fogOccludes={fogOccludes}
            seeThrough={isGM && gmFogTransparent}
          />
        )}

        {/* Selection resize handle */}
        {selected && (
          <div
            className="resize-handle"
            style={{
              left: selected.x + selected.size * scene.gridSize + 2,
              top: selected.y + selected.size * scene.gridSize + 2,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const w = worldAt(e);
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag({ type: 'resize', id: selected.id, startSize: selected.size, startX: w.x, startY: w.y });
            }}
          />
        )}
      </div>

      {/* Remote cursors */}
      {Object.entries(cursors).map(([id, c]) => {
        if (id === self.id || c.sceneId !== scene.id) return null;
        if (Date.now() - c.ts > 12000) return null;
        const sx = c.x * viewport.scale + viewport.x;
        const sy = c.y * viewport.scale + viewport.y;
        return (
          <div key={id} className="remote-cursor" style={{ left: sx, top: sy, background: c.color }}>
            <span className="label" style={{ color: c.color }}>
              {c.name}
            </span>
          </div>
        );
      })}

      {/* Pings */}
      {Object.entries(pings).map(([id, p]) => {
        if (p.sceneId !== scene.id) return null;
        const age = Date.now() - p.ts;
        if (age > 2000) return null;
        const sx = p.x * viewport.scale + viewport.x;
        const sy = p.y * viewport.scale + viewport.y;
        return (
          <div key={id} className="ping" style={{ left: sx, top: sy, color: p.color }}>
            <span className="ping-ring" />
            <span className="ping-label">{p.kind === 'focus' ? 'Enfocar: ' : ''}{p.name}</span>
          </div>
        );
      })}

      <div className="bottom-left">
        <div className="panel">
          <button className="btn sm" onClick={() => centerOn(scene.width / 2, scene.height / 2)}>
            Center
          </button>
          <button className="btn sm" onClick={() => fit(scene.width, scene.height)}>
            Fit
          </button>
          <button
            className={`btn sm ${showMap ? '' : 'primary'}`}
            onClick={() => setShowMap((v) => !v)}
            title="Toggle map image"
          >
            {showMap ? 'Map' : 'No map'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {Math.round(viewport.scale * 100)}%
          </span>
        </div>
      </div>

      <div className="viewport-readout">
        {scene.name} · {scene.width}×{scene.height} · grid {scene.gridSize}px
      </div>

      {drag?.type === 'ruler' && ruler && (
        <RulerHud ruler={ruler} gridSize={scene.gridSize} />
      )}

      {wheel && (
        <PingWheel
          x={wheel.screenX}
          y={wheel.screenY}
          isGM={isGM}
          cooldownMs={Math.max(0, pingCooldownUntil - now)}
          onPing={() => sendPing('ping')}
          onFocus={() => sendPing('focus')}
          onClose={() => setWheel(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Radial menu (like League of Legends) opened where the user pressed. */
function PingWheel({
  x,
  y,
  isGM,
  cooldownMs,
  onPing,
  onFocus,
  onClose,
}: {
  x: number;
  y: number;
  isGM: boolean;
  cooldownMs: number;
  onPing: () => void;
  onFocus: () => void;
  onClose: () => void;
}) {
  const locked = !isGM && cooldownMs > 0;
  return (
    <div className="ping-wheel-backdrop" onClick={onClose}>
      <div
        className="ping-wheel"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="ping-option ping-option-ping"
          disabled={locked}
          onClick={onPing}
          title="Señalar"
        >
          <span className="ping-option-icon">◎</span>
          <span>Señalar</span>
        </button>
        <button className="ping-option ping-option-focus" onClick={onFocus} title="Enfocar a todos">
          <span className="ping-option-icon">➤</span>
          <span>Enfocar</span>
        </button>
        {locked && (
          <div className="ping-cooldown">{Math.ceil(cooldownMs / 1000)}s</div>
        )}
      </div>
    </div>
  );
}

/** True if the point `p` is within `r` of the drawing's geometry. */
export function drawingHit(d: Drawing, p: Vec, r: number): boolean {
  if (d.points.length < 4) return false;
  const [x1, y1, x2, y2] = d.points;
  switch (d.kind) {
    case 'rect': {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      const nx = Math.max(rx, Math.min(p.x, rx + rw));
      const ny = Math.max(ry, Math.min(p.y, ry + rh));
      return Math.hypot(p.x - nx, p.y - ny) <= r;
    }
    case 'circle': {
      const rad = Math.hypot(x2 - x1, y2 - y1);
      const dist = Math.hypot(p.x - x1, p.y - y1);
      return Math.abs(dist - rad) <= r || dist <= rad;
    }
    case 'line':
      return pointSegDist(p, { x: x1, y: y1 }, { x: x2, y: y2 }) <= r;
    case 'pen': {
      for (let i = 0; i + 3 < d.points.length; i += 2) {
        const a = { x: d.points[i], y: d.points[i + 1] };
        const b = { x: d.points[i + 2], y: d.points[i + 3] };
        if (pointSegDist(p, a, b) <= r) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

function pointSegDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function DrawingShape({ d, selected, hit }: { d: Drawing; selected?: boolean; hit?: boolean }) {
  if (d.points.length < 4) return null;
  const [x1, y1, x2, y2] = d.points;
  const common = {
    stroke: hit ? 'transparent' : selected ? 'var(--accent)' : d.color,
    strokeWidth: hit ? Math.max(d.width, 16) : selected ? d.width + 2 : d.width,
    fill: 'none',
    strokeLinecap: 'round' as const,
    pointerEvents: hit ? ('stroke' as const) : ('none' as const),
  };
  switch (d.kind) {
    case 'pen': {
      let path = `M${d.points[0]} ${d.points[1]}`;
      for (let i = 2; i < d.points.length; i += 2) path += `L${d.points[i]} ${d.points[i + 1]}`;
      return <path d={path} {...common} strokeLinejoin="round" />;
    }
    case 'line':
      return <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />;
    case 'rect':
      return (
        <rect
          x={Math.min(x1, x2)}
          y={Math.min(y1, y2)}
          width={Math.abs(x2 - x1)}
          height={Math.abs(y2 - y1)}
          rx={4}
          {...common}
        />
      );
    case 'circle': {
      const r = Math.hypot(x2 - x1, y2 - y1);
      return <circle cx={x1} cy={y1} r={r} {...common} />;
    }
    default:
      return null;
  }
}

function RulerShape({ a, b, gridSize }: { a: Vec; b: Vec; gridSize: number }) {
  const cells = Math.hypot(b.x - a.x, b.y - a.y) / gridSize;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffd166" strokeWidth={3} strokeDasharray="8 6" />
      <circle cx={a.x} cy={a.y} r={6} fill="#ffd166" />
      <circle cx={b.x} cy={b.y} r={6} fill="#ffd166" />
      <g transform={`translate(${mid.x} ${mid.y})`}>
        <rect x={-34} y={-16} width={68} height={26} rx={6} fill="#000c" />
        <text x={0} y={2} textAnchor="middle" fill="#ffd166" fontSize={15} fontWeight={700}>
          {cells.toFixed(1)} u
        </text>
      </g>
    </g>
  );
}

function RulerHud({ ruler, gridSize }: { ruler: { a: Vec; b: Vec }; gridSize: number }) {
  const cells = Math.hypot(ruler.b.x - ruler.a.x, ruler.b.y - ruler.a.y) / gridSize;
  return (
    <div className="viewport-readout" style={{ right: 'auto', left: '50%', transform: 'translateX(-50%)' }}>
      {cells.toFixed(2)} casillas ({Math.round(cells * 5)} ft)
    </div>
  );
}

function FogLayer({
  scene,
  shapes,
  draft,
  fogOccludes,
  seeThrough,
}: {
  scene: { id: string; width: number; height: number };
  shapes: FogShape[];
  draft: { a: Vec; b: Vec; mode: 'reveal' | 'hide' } | null;
  fogOccludes: boolean;
  seeThrough?: boolean;
}) {
  const id = `fogmask-${scene.id}`;
  const rects = shapes.map((s) => ({ ...s, r: pointsToRect(s.points) })).filter((s) => s.r);
  const draftRect = draft ? pointsToRect([draft.a.x, draft.a.y, draft.b.x, draft.b.y]) ?? dotRect(draft.a) : null;

  // The GM can reveal the map "under" the fog (see-through) to prepare scenes.
  const fill = seeThrough ? '#0b0b0f2e' : fogOccludes ? '#0b0b0f' : '#0b0b0fbb';

  return (
    <svg className="grid-svg" width={scene.width} height={scene.height} style={{ pointerEvents: 'none' }}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={scene.width} height={scene.height}>
          <rect x={0} y={0} width={scene.width} height={scene.height} fill="white" />
          {rects.map((s) =>
            s.mode === 'reveal' ? (
              <rect key={s.id} x={s.r!.x} y={s.r!.y} width={s.r!.w} height={s.r!.h} fill="black" />
            ) : (
              <rect key={s.id} x={s.r!.x} y={s.r!.y} width={s.r!.w} height={s.r!.h} fill="white" />
            ),
          )}
          {draftRect && (
            <rect
              x={draftRect.x}
              y={draftRect.y}
              width={draftRect.w}
              height={draftRect.h}
              fill={draft?.mode === 'reveal' ? 'black' : 'white'}
            />
          )}
        </mask>
      </defs>
      <rect x={0} y={0} width={scene.width} height={scene.height} fill={fill} mask={`url(#${id})`} />
    </svg>
  );
}

function pointsToRect(p: number[]): { x: number; y: number; w: number; h: number } | null {
  if (p.length < 4) return null;
  const x = Math.min(p[0], p[2]);
  const y = Math.min(p[1], p[3]);
  return { x, y, w: Math.abs(p[2] - p[0]), h: Math.abs(p[3] - p[1]) };
}

function dotRect(a: Vec) {
  const r = 18;
  return { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 };
}

function TokenView({
  token,
  gridSize,
  selected,
  isGM,
  selfId,
  onPointerDown,
}: {
  token: Token;
  gridSize: number;
  selected: boolean;
  isGM: boolean;
  selfId: string;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const px = token.size * gridSize;
  const dim = token.hidden && !isGM;
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: token.x,
        top: token.y,
        width: px,
        height: px,
        opacity: token.hidden && isGM ? 0.4 : 1,
        cursor: token.locked ? 'not-allowed' : 'move',
        pointerEvents: dim ? 'none' : 'auto',
        display: dim ? 'none' : 'block',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          overflow: 'hidden',
          border: `${selected ? 3 : 2}px solid ${selected ? 'var(--accent)' : token.color}`,
          background: token.imageUrl ? '#000' : token.color,
          boxShadow: '0 3px 10px #0009',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {token.imageUrl ? (
          <img
            src={token.imageUrl}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: px * 0.4, fontWeight: 800, color: '#10131c' }}>
            {token.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      {token.locked && (
        <div
          className="token-badge"
          style={{ position: 'absolute', top: -8, right: -6 }}
          title="Locked"
        >
          <Icon name="lock" size={12} />
        </div>
      )}
      {token.hidden && isGM && (
        <div
          className="token-badge"
          style={{ position: 'absolute', bottom: -6, left: -6 }}
          title="Hidden from players"
        >
          <Icon name="eyeoff" size={12} />
        </div>
      )}
      {(token.conditions.length > 0 || token.name) && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '100%',
            transform: 'translateX(-50%)',
            fontSize: 11,
            background: '#000c',
            padding: '1px 6px',
            borderRadius: 6,
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {token.conditions.length > 0 && (
            <span style={{ color: 'var(--warn)' }}>{token.conditions.join(', ')} </span>
          )}
          {token.name}
        </div>
      )}
      {token.owner && token.owner === selfId && (
        <div
          className="token-badge"
          style={{ position: 'absolute', top: -7, left: -7 }}
          title="Your token"
        >
          <Icon name="crown" size={11} />
        </div>
      )}
    </div>
  );
}

/** Human-readable label for a condition (no emoji). */
export function conditionIcon(c: string): string {
  return c;
}
