import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import Icon from './Icon';
import { can, type Role } from '../permissions';
import type { Blocker, Decal, Drawing, EraseStroke, FogShape, Token, Tool } from '../types';
import { useViewport } from '../hooks/useViewport';
import { clamp, nanoid } from '../util';
import type { Vec } from '../util';

/** Upper bound on stamps per fog stroke, so a long drag cannot flood state. */
const MAX_FOG_STAMPS = 400;

interface Props {
  tool: Tool;
  color: string;
  strokeWidth: number;
  /** Diameter of the eraser in world units. */
  eraserSize: number;
  fogOccludes: boolean;
  brushSize: number;
  gmFogTransparent: boolean;
  fogOpacity: number;
  /** Image picked for the decal tool; null means nothing to place yet. */
  decalImage: { url: string; w: number; h: number } | null;
  decalSize: number;
  decalOpacity: number;
  fogLighting: boolean;
  fogLightRadius: number;
  /** When on, players only see their own tokens. The GM is unaffected. */
  ownTokensOnly: boolean;
  /**
   * When set to a kind, the brush and the line draw walls/doors/windows
   * instead of plain drawings. 'none' keeps normal drawing behaviour.
   */
  blockerKind: 'none' | Blocker['kind'];
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number;
}

type Drag =
  | { type: 'pan'; startX: number; startY: number; vx: number; vy: number }
  | { type: 'token'; id: string; offsetX: number; offsetY: number; moved: boolean }
  | { type: 'resize'; id: string; startSize: number; startX: number; startY: number }
  | { type: 'decal-move'; id: string; offX: number; offY: number }
  | {
      type: 'decal-resize';
      id: string;
      startW: number;
      startH: number;
      startX: number;
      startY: number;
      ratio: number;
    }
  | { type: 'draw'; points: number[] }
  | { type: 'fog'; mode: 'reveal' | 'hide'; stamps: number[]; last: Vec }
  | {
      type: 'fog-shape';
      mode: 'reveal' | 'hide';
      round: boolean;
      start: Vec;
      current: Vec;
    }
  | { type: 'ruler'; start: Vec; current: Vec }
  | { type: 'erase'; points: number[] }
  | { type: 'marquee' }
  | null;

export default function Board({
  tool,
  color,
  strokeWidth,
  eraserSize,
  fogOccludes,
  brushSize,
  gmFogTransparent,
  fogOpacity,
  decalImage,
  decalSize,
  decalOpacity,
  fogLighting,
  fogLightRadius,
  ownTokensOnly,
  blockerKind,
  fillEnabled,
  fillColor,
  fillOpacity,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const {
    viewport,
    setViewport,
    screenToWorld,
    centerOn,
    fit,
    zoomAt,
    pinchBegin,
    pinchMove,
    pinchEnd,
  } = useViewport(boardRef);
  // While a pinch is in progress the board must not treat the moving finger as
  // a drawing stroke, otherwise zooming leaves ink behind.
  const pinchingRef = useRef(false);

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
  const [selectedDecalId, setSelectedDecalId] = useState<string | null>(null);
  const [selectedBlockerId, setSelectedBlockerId] = useState<string | null>(null);

  // notify the app (Inspector) about the current selection
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vtt:selection', { detail: selectedId }));
  }, [selectedId]);

  const [drag, setDrag] = useState<Drag>(null);
  const [draftPoints, setDraftPoints] = useState<number[] | null>(null);
  const [draftErase, setDraftErase] = useState<number[] | null>(null);
  const [draftFog, setDraftFog] = useState<{ mode: 'reveal' | 'hide'; points: number[] } | null>(null);
  const [draftShape, setDraftShape] = useState<{
    mode: 'reveal' | 'hide';
    round: boolean;
    a: Vec;
    b: Vec;
  } | null>(null);
  const [ruler, setRuler] = useState<{ a: Vec; b: Vec } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const lastCursorSent = useRef(0);

  // Declared before the selectors below, which depend on it.
  const isGM = self.role === 'gm';

  const sceneBlockers = useMemo(
    () => (state.blockers || []).filter((b) => b.sceneId === scene?.id),
    [state.blockers, scene?.id],
  );
  const selectedBlocker = sceneBlockers.find((b) => b.id === selectedBlockerId) || null;

  /** True if moving this token to (x, y) would cross a closed blocker. */
  const isTokenBlocked = useCallback(
    (token: Token, x: number, y: number, gridSize: number) => {
      // Open doors and windows are walkable, so they stop blocking movement.
      const solid = sceneBlockers.filter((b) => b.kind === 'wall' || !b.open);
      if (!solid.length) return false;
      const half = (token.size * gridSize) / 2;
      // The centre path plus the two side edges, so the body cannot slip past.
      for (const off of [0, -half, half]) {
        const x1 = token.x + half;
        const y1 = token.y + half + off;
        const x2 = x + half;
        const y2 = y + half + off;
        for (const b of solid) {
          for (const s of segments(b.points)) {
            if (segmentsIntersect(x1, y1, x2, y2, s.ax, s.ay, s.bx, s.by)) return true;
          }
        }
      }
      return false;
    },
    [sceneBlockers],
  );

  const sceneTokens = useMemo(() => {
    const inScene = state.tokens.filter((t) => t.sceneId === scene?.id);
    // With lighting on and "own tokens only" enabled, players see just their
    // own characters; the GM always sees everything.
    if (!ownTokensOnly || isGM) return inScene;
    return inScene.filter(
      (t) => !t.owner || t.owner === self.id || (!!t.userId && t.userId === self.userId),
    );
  }, [state.tokens, scene?.id, ownTokensOnly, isGM, self.id]);
  const sceneDrawings = useMemo(
    () => state.drawings.filter((d) => d.sceneId === scene?.id),
    [state.drawings, scene?.id],
  );

  const sceneDecals = useMemo(
    () => (state.decals || []).filter((d) => d.sceneId === scene?.id),
    [state.decals, scene?.id],
  );
  const selectedDecal = sceneDecals.find((d) => d.id === selectedDecalId) || null;

  const sceneErasers = useMemo(
    () => (state.erasers || []).filter((e) => e.sceneId === scene?.id),
    [state.erasers, scene?.id],
  );

  // Lighting mode: one light per token. `r` is the maximum vision distance, the
  // distance where the fog becomes fully opaque again.
  const lights = useMemo(() => {
    if (!fogLighting) return [];
    return sceneTokens
      .filter((t) => !t.hidden)
      .map((t) => ({
        x: t.x + (t.size * scene!.gridSize) / 2,
        y: t.y + (t.size * scene!.gridSize) / 2,
        r: Math.max(fogLightRadius, t.size * scene!.gridSize),
      }));
  }, [fogLighting, sceneTokens, scene?.gridSize, fogLightRadius]);

  // Erasers that hide a given stroke: only those created after it, and only
  // when their bounding boxes actually overlap. The cheap box test keeps this
  // from building a mask for every stroke on the map.
  const erasersHiding = useCallback(
    (d: Drawing): EraseStroke[] => {
      const box = pointsBox(d.points, (d.width || 0) / 2);
      if (!box) return [];
      const dSeq = d.seq ?? 0;
      const out: EraseStroke[] = [];
      for (const e of sceneErasers) {
        if ((e.seq ?? 0) <= dSeq) continue;
        const eb = pointsBox(e.points, (e.width || 0) / 2);
        if (!eb) continue;
        if (box.maxX < eb.minX || box.minX > eb.maxX) continue;
        if (box.maxY < eb.minY || box.minY > eb.maxY) continue;
        out.push(e);
      }
      return out;
    },
    [sceneErasers],
  );
  const sceneFog = useMemo(
    () => state.fog.filter((f) => f.sceneId === scene?.id),
    [state.fog, scene?.id],
  );

  // Radius of the eraser in world units. The slider sets its diameter; the
  // `12 / scale` term is only a floor so it stays grabbable when zoomed out.
  // It is baked into the stroke when the eraser is released, so every player
  // sees the same hole regardless of their zoom.
  const eraserRadius = Math.max(eraserSize / 2, 12 / (viewport.scale || 1));

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
        const mine = t && (!t.owner || t.owner === self.id || (!!t.userId && t.userId === self.userId));
        if (t && !t.locked && (can(role, 'token.deleteAny') || mine)) {
          dispatch({ kind: 'token.remove', id: selectedId });
        }
        setSelectedId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        if (can(role, 'draw')) dispatch({ kind: 'drawing.remove', id: selectedDrawingId });
        setSelectedDrawingId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockerId) {
        if (can(role, 'scene.manage')) dispatch({ kind: 'blocker.remove', id: selectedBlockerId });
        setSelectedBlockerId(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDecalId) {
        if (can(role, 'scene.manage')) dispatch({ kind: 'decal.remove', id: selectedDecalId });
        setSelectedDecalId(null);
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setSelectedDrawingId(null);
        setSelectedDecalId(null);
        setSelectedBlockerId(null);
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
  }, [
    selectedId,
    selectedDrawingId,
    selectedDecalId,
    selectedBlockerId,
    state.tokens,
    dispatch,
    role,
    self.id,
  ]);

  /* ---------------- pointer ---------------- */
  const panning = tool === 'pan' || spaceDown;

  // screenToWorld is a stable useCallback, so wrapping it keeps the token
  // memo effective across re-renders.
  const worldAt = useCallback(
    (e: React.PointerEvent | PointerEvent): Vec => screenToWorld(e.clientX, e.clientY),
    [screenToWorld],
  );

  function onPointerDown(e: React.PointerEvent) {
    if (!scene) return;
    // Track every pointer so a second finger can start a pinch. A fresh press
    // always means the previous gesture finished, so the guard resets here.
    pinchingRef.current = false;
    pinchBegin(e.pointerId, e.clientX, e.clientY);
    if (pinchingRef.current) return;
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
        // Paint a first stamp right away so a tap leaves a dab.
        setDrag({ type: 'fog', mode, stamps: [w.x, w.y, w.x, w.y], last: { x: w.x, y: w.y } });
        setDraftFog({ mode, points: [w.x, w.y, w.x, w.y] });
        break;
      }
      case 'fog-rect-reveal':
      case 'fog-rect-hide':
      case 'fog-circle-reveal':
      case 'fog-circle-hide': {
        if (!can(role, 'fog.edit')) break;
        // Shapes are one rectangle / circle covering the whole drag.
        const mode = tool.endsWith('-reveal') ? 'reveal' : 'hide';
        const round = tool.startsWith('fog-circle');
        setDrag({ type: 'fog-shape', mode, round, start: w, current: w });
        setDraftShape({ mode, round, a: w, b: w });
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
      case 'decal': {
        if (!can(role, 'scene.manage')) break;
        if (!decalImage) break;
        // Place centred on the click, keeping the image's aspect ratio. `w` here is
        // the click position (a Vec), so the size gets its own names.
        const dw = Math.max(8, decalSize);
        const dh = dw * (decalImage.h / Math.max(1, decalImage.w));
        const decal: Decal = {
          id: nanoid(),
          sceneId: scene.id,
          url: decalImage.url,
          x: w.x - dw / 2,
          y: w.y - dh / 2,
          w: dw,
          h: dh,
          opacity: decalOpacity,
        };
        dispatch({ kind: 'decal.add', decal });
        setSelectedDecalId(decal.id);
        break;
      }
      case 'eraser': {
        if (!can(role, 'draw')) break;
        // The eraser paints an "erase stroke" (see the mask below) rather than
        // deleting the drawings it touches.
        setDrag({ type: 'erase', points: [w.x, w.y, w.x, w.y] });
        setDraftErase([w.x, w.y, w.x, w.y]);
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
    if (pinchMove(e.pointerId, e.clientX, e.clientY)) {
      pinchingRef.current = true;
      return;
    }
    if (pinchingRef.current) return;
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
        // Do not let a token cross a wall or a closed door/window. The centre
        // and both edges of the token are tested, so it cannot squeeze through.
        // The GM is exempt: they build the map and must be able to place a
        // token anywhere. The server enforces the same rule for players.
        if (!isGM && isTokenBlocked(token, nx, ny, scene.gridSize)) return;
        dispatch({ kind: 'token.update', id: drag.id, patch: { x: nx, y: ny } });
        // Only flip `moved` once. Calling setDrag on every pointermove
        // re-renders the whole board for nothing while dragging.
        if (!drag.moved) setDrag({ ...drag, moved: true });
        break;
      }
      case 'resize': {
        const size = clamp(drag.startSize + (w.x - drag.startX) / scene.gridSize, 0.25, 20);
        dispatch({ kind: 'token.update', id: drag.id, patch: { size } });
        break;
      }
      case 'decal-move': {
        dispatch({
          kind: 'decal.update',
          id: drag.id,
          patch: { x: w.x - drag.offX, y: w.y - drag.offY },
        });
        break;
      }
      case 'decal-resize': {
        const dx = w.x - drag.startX;
        const dy = w.y - drag.startY;
        // Distance along the drag direction, projected on the diagonal, keeps
        // the image proportional no matter which way the handle is pulled.
        const along = dx + dy;
        const factor = Math.max(0.05, 1 + along / (drag.startW || 1));
        const ratio = drag.ratio;
        const nw = clamp(drag.startW * factor, 8, 20000);
        dispatch({
          kind: 'decal.update',
          id: drag.id,
          patch: { w: nw, h: clamp(nw * ratio, 8, 20000) },
        });
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
      case 'fog': {
        // Brush: walk from the last stamp to the current point and drop a stamp
        // every `spacing` units, so the trail is continuous but the count is
        // bounded by distance rather than by pointer event frequency.
        const stamps = [...drag.stamps];
        const last = drag.last;
        const spacing = Math.max(2, brushSize * 0.35);
        const dx = w.x - last.x;
        const dy = w.y - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 1) {
          const steps = Math.min(Math.floor(dist / spacing), MAX_FOG_STAMPS);
          for (let i = 1; i <= steps; i++) {
            const t = (i * spacing) / dist;
            stamps.push(last.x + dx * t, last.y + dy * t);
          }
        }
        drag.last = { x: w.x, y: w.y };
        drag.stamps = stamps;
        setDraftFog({ mode: drag.mode, points: stamps });
        break;
      }
      case 'fog-shape':
        setDrag({ ...drag, current: w });
        setDraftShape({ mode: drag.mode, round: drag.round, a: drag.start, b: w });
        break;
      case 'ruler':
        setDrag({ ...drag, current: w });
        setRuler({ a: drag.start, b: w });
        break;
      case 'erase': {
        const pts = [...drag.points];
        pts.push(w.x, w.y);
        setDraftErase(pts);
        setDrag({ ...drag, points: pts });
        break;
      }
      default:
        break;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (pinchEnd(e.pointerId)) {
      // The gesture was a pinch: drop any half-started drag so nothing commits.
      setDrag(null);
      setDraftPoints(null);
      setDraftFog(null);
      setDraftErase(null);
      // Stay "pinching" until every finger is up, so no stray stroke starts
      // mid-gesture; it clears on the next pointerdown.
      return;
    }
    if (!drag) return;
    switch (drag.type) {
      case 'token': {
        const t = state.tokens.find((x) => x.id === drag.id);
        if (t && drag.moved) logEvent({ kind: 'token.move', text: `${self.name} movió "${t.name}"` });
        break;
      }
      case 'draw': {
        if (!draftPoints || draftPoints.length < 4) break;
        // With a construction kind active, the brush and the line build walls,
        // doors or windows instead of plain drawings.
        if (blockerKind !== 'none' && can(role, 'scene.manage')) {
          const blocker: Blocker = {
            id: nanoid(),
            sceneId: scene.id,
            kind: blockerKind,
            points: draftPoints,
            open: false,
          };
          dispatch({ kind: 'blocker.add', blocker });
          setSelectedBlockerId(blocker.id);
          break;
        }
        const drawing: Drawing = {
          id: nanoid(),
          sceneId: scene.id,
          kind: tool as Drawing['kind'],
          color,
          width: strokeWidth,
          fill: fillEnabled ? fillColor : null,
          opacity: fillOpacity,
          points: draftPoints,
        };
        dispatch({ kind: 'drawing.add', drawing });
        break;
      }
      case 'fog': {
        // Commit the whole stroke as one action so it is a single message and a
        // single undo step.
        if (!draftFog || !draftFog.points.length) break;
        const r = brushSize / 2;
        const shapes: FogShape[] = [];
        for (let i = 0; i + 3 < draftFog.points.length; i += 2) {
          const x = draftFog.points[i];
          const y = draftFog.points[i + 1];
          shapes.push({
            id: nanoid(),
            sceneId: scene.id,
            mode: draftFog.mode,
            points: [x - r, y - r, x + r, y + r],
            round: true,
            opacity: fogOpacity,
          });
        }
        if (shapes.length) dispatch({ kind: 'fog.addMany', shapes });
        break;
      }
      case 'fog-shape': {
        if (!draftShape) break;
        const x = Math.min(draftShape.a.x, draftShape.b.x);
        const y = Math.min(draftShape.a.y, draftShape.b.y);
        const w = Math.abs(draftShape.b.x - draftShape.a.x);
        const h = Math.abs(draftShape.b.y - draftShape.a.y);
        dispatch({
          kind: 'fog.add',
          shape: {
            id: nanoid(),
            sceneId: scene.id,
            mode: draftShape.mode,
            points: [x, y, x + w, y + h],
            round: draftShape.round,
            opacity: fogOpacity,
          },
        });
        break;
      }
      case 'erase': {
        if (!draftErase || draftErase.length < 2) break;
        const erase: EraseStroke = {
          id: nanoid(),
          sceneId: scene.id,
          width: eraserRadius * 2,
          points: draftErase,
        };
        dispatch({ kind: 'erase.add', erase });
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
    setDraftShape(null);
    setDraftErase(null);
    void e;
  }

  const onTokenPointerDown = useCallback(
    (e: React.PointerEvent, token: Token) => {
      if (panning || tool !== 'select') return;
      e.stopPropagation();
      if (token.hidden && !isGM) return;
      // Players may only move their own (or unowned) tokens.
      const mine =
        !token.owner || token.owner === self.id || (!!token.userId && token.userId === self.userId);
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
    },
    [panning, tool, isGM, self.id, role],
  );

  const onDecalPointerDown = useCallback(
    (e: React.PointerEvent, decal: Decal) => {
      if (panning || tool !== 'select') return;
      e.stopPropagation();
      if (!can(role, 'scene.manage')) return;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setSelectedDecalId(decal.id);
      setSelectedId(null);
      setSelectedDrawingId(null);
      const w = worldAt(e);
      setDrag({
        type: 'decal-move',
        id: decal.id,
        offX: w.x - decal.x,
        offY: w.y - decal.y,
      });
    },
    [panning, tool, role],
  );

  /* ---------------- helpers ---------------- */

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

        {/* Drawings — masked so the eraser only punches out the pixels it
            actually passes over, instead of deleting whole strokes. */}
        <svg
          className="grid-svg"
          width={scene.width}
          height={scene.height}
          style={{ overflow: 'visible', pointerEvents: tool === 'select' ? 'auto' : 'none' }}
        >
          {/* Each stroke gets its own mask containing only the erasers made
              AFTER it. That is what lets you paint over an area you erased
              earlier: the new stroke has a higher seq, so no eraser applies to
              it, while older strokes under the eraser stay hidden. */}
          {sceneDrawings.map((d) => {
            const hiders = erasersHiding(d);
            const inner = (
              <g
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
            );
            if (!hiders.length) return <g key={d.id}>{inner}</g>;
            const maskId = `em-${scene.id}-${d.id}`;
            return (
              <g key={d.id}>
                <defs>
                  <mask
                    id={maskId}
                    maskUnits="userSpaceOnUse"
                    x={0}
                    y={0}
                    width={scene.width}
                    height={scene.height}
                  >
                    <rect x={0} y={0} width={scene.width} height={scene.height} fill="#fff" />
                    {hiders.map((e) => (
                      <ErasePath key={e.id} width={e.width} points={e.points} />
                    ))}
                  </mask>
                </defs>
                <g mask={`url(#${maskId})`}>{inner}</g>
              </g>
            );
          })}

          {/* Live preview of the stroke being drawn, and of the eraser in use. */}
          {draftPoints && (
            <DrawingShape
              d={{
                id: 'draft',
                sceneId: scene.id,
                kind: tool as Drawing['kind'],
                color,
                width: strokeWidth,
                fill: fillEnabled ? fillColor : null,
                opacity: fillOpacity,
                points: draftPoints,
              }}
            />
          )}
          {draftErase && (
            <g opacity={0.75} style={{ pointerEvents: 'none' }}>
              <ErasePath width={eraserRadius * 2} points={draftErase} />
            </g>
          )}

          {/* Ruler */}
          {ruler && drag?.type === 'ruler' && (
            <RulerShape a={ruler.a} b={ruler.b} gridSize={scene.gridSize} />
          )}
        </svg>

        {/* Walls, doors and windows. Click one to select it, then toggle it open. */}
        {sceneBlockers.map((b) => {
          const open = !!b.open;
          const isSel = selectedBlockerId === b.id;
          const path = pointsToPath(b.points);
          return (
            <g key={b.id}>
              <path
                d={path}
                className={`blocker blocker-${b.kind} ${open ? 'open' : ''} ${
                  isSel ? 'selected' : ''
                }`}
                onPointerDown={(e) => {
                  if (tool !== 'select' || !can(role, 'scene.manage')) return;
                  e.stopPropagation();
                  setSelectedBlockerId(b.id);
                  setSelectedId(null);
                  setSelectedDecalId(null);
                  setSelectedDrawingId(null);
                }}
              />
              {b.kind !== 'wall' && (
                <path d={path} className={`blocker-gap${open ? ' open' : ''}`} />
              )}
            </g>
          );
        })}

        {/* Open/close affordance on the selected door or window. */}
        {selectedBlocker && selectedBlocker.kind !== 'wall' && (() => {
          const pts = selectedBlocker.points;
          const mid = pointsMid(pts);
          if (!mid) return null;
          return (
            <button
              className="blocker-toggle"
              style={{ left: mid.x, top: mid.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() =>
                dispatch({
                  kind: 'blocker.update',
                  id: selectedBlocker.id,
                  patch: { open: !selectedBlocker.open },
                })
              }
              title={
                selectedBlocker.open
                  ? 'Cerrar: vuelve a bloquear la luz y el paso'
                  : 'Abrir: deja pasar la luz y el paso'
              }
            >
              {selectedBlocker.open ? 'Cerrar' : 'Abrir'}
            </button>
          );
        })()}

        {/* Preview of the wall being drawn */}
        {draftPoints && blockerKind !== 'none' && (
          <path
            d={pointsToPath(draftPoints)}
            className={`blocker blocker-${blockerKind} preview`}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Decals: images laid over the map, behind the tokens. */}
        {sceneDecals.map((d) => (
          <div
            key={d.id}
            className={`decal ${selectedDecalId === d.id ? 'selected' : ''}`}
            style={{
              left: d.x,
              top: d.y,
              width: d.w,
              height: d.h,
              opacity: d.opacity ?? 1,
            }}
            onPointerDown={(e) => onDecalPointerDown(e, d)}
            title="Imagen del mapa"
          >
            <img src={d.url} alt="" draggable={false} />
          </div>
        ))}

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
            draftRadius={brushSize}
            draftShape={draftShape}
            draftOpacity={fogOpacity}
            lights={lights}
            lightOn={fogLighting}
            blockers={sceneBlockers}
            fogOccludes={fogOccludes}
            seeThrough={isGM && gmFogTransparent}
          />
        )}

        {/* Decal resize handle */}
        {selectedDecal && (
          <div
            className="resize-handle"
            style={{
              left: selectedDecal.x + selectedDecal.w + 2,
              top: selectedDecal.y + selectedDecal.h + 2,
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!can(role, 'scene.manage')) return;
              const w = worldAt(e);
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDrag({
                type: 'decal-resize',
                id: selectedDecal.id,
                startW: selectedDecal.w,
                startH: selectedDecal.h,
                startX: w.x,
                startY: w.y,
                ratio: selectedDecal.h / Math.max(1, selectedDecal.w),
              });
            }}
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
          <button
            className="btn sm"
            onClick={() => {
              const rect = boardRef.current?.getBoundingClientRect();
              if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
            }}
            title="Alejar"
            aria-label="Alejar"
          >
            −
          </button>
          <button
            className="btn sm"
            onClick={() => {
              const rect = boardRef.current?.getBoundingClientRect();
              if (rect) zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
            }}
            title="Acercar"
            aria-label="Acercar"
          >
            +
          </button>
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
  // Opacity belongs to the fill only. Applying it to the whole shape would make
  // the outline translucent too, which is not what "fill opacity" means.
  const opacity = Math.max(0, Math.min(1, d.opacity ?? 1));
  // Only closed shapes can be filled. Resolving the colour to a plain string
  // here keeps `d.fill` (string | null | undefined) out of the JSX props.
  const fillable = d.kind === 'rect' || d.kind === 'circle';
  const fill = !hit && fillable && d.fill ? d.fill : 'none';
  const hasFill = fill !== 'none';
  const common = {
    stroke: hit ? 'transparent' : selected ? 'var(--accent)' : d.color,
    strokeWidth: hit ? Math.max(d.width, 16) : selected ? d.width + 2 : d.width,
    strokeLinecap: 'round' as const,
    pointerEvents: hit ? ('stroke' as const) : ('none' as const),
    fill,
    // SVG presentation attribute: only the fill fades, the stroke stays solid.
    fillOpacity: hasFill ? opacity : 1,
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

function pointsMid(points: number[]): Vec | null {
  if (points.length < 2) return null;
  let x = 0;
  let y = 0;
  const n = points.length / 2;
  for (let i = 0; i + 1 < points.length; i += 2) {
    x += points[i];
    y += points[i + 1];
  }
  return { x: x / n, y: y / n };
}

function pointsToPath(points: number[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0]} ${points[1]}`;
  for (let i = 2; i + 1 < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
  return d;
}

/** Every segment of a blocker polyline, as pairs of points. */
function segments(points: number[]): { ax: number; ay: number; bx: number; by: number }[] {
  const out = [];
  for (let i = 0; i + 3 < points.length; i += 2) {
    out.push({
      ax: points[i],
      ay: points[i + 1],
      bx: points[i + 2],
      by: points[i + 3],
    });
  }
  return out;
}

/** Do two segments properly intersect? Used to stop tokens crossing walls. */
export function segmentsIntersect(
  a1x: number,
  a1y: number,
  a2x: number,
  a2y: number,
  b1x: number,
  b1y: number,
  b2x: number,
  b2y: number,
): boolean {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(a1x, a1y, a2x, a2y, b1x, b1y);
  const d2 = d(a1x, a1y, a2x, a2y, b2x, b2y);
  const d3 = d(b1x, b1y, b2x, b2y, a1x, a1y);
  const d4 = d(b1x, b1y, b2x, b2y, a2x, a2y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * The shadow a wall segment casts from a point light: the quad bounded by the
 * two rays from the light through the segment's ends, continued past it.
 * Returned as an SVG path so the fog mask can paint it back in.
 */
export function shadowPath(
  lx: number,
  ly: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  reach: number,
): string | null {
  const la = Math.hypot(ax - lx, ay - ly);
  const lb = Math.hypot(bx - lx, by - ly);
  // Light sitting on the wall itself casts nothing useful.
  if (la < 1 || lb < 1) return null;
  const ux = (ax - lx) / la;
  const uy = (ay - ly) / la;
  const vx = (bx - lx) / lb;
  const vy = (by - ly) / lb;
  // Opposite sides of the light: no shadow between them.
  if (ux * vx + uy * vy < -0.999) return null;
  const ax2 = lx + ux * reach;
  const ay2 = ly + uy * reach;
  const bx2 = lx + vx * reach;
  const by2 = ly + vy * reach;
  return `M${lx} ${ly}L${ax} ${ay}L${ax2} ${ay2}L${bx2} ${by2}L${bx} ${by}Z`;
}

/** Axis-aligned bounds of a flattened point list, grown by `pad`. */
function pointsBox(points: number[], pad: number) {
  if (points.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return null;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/**
 * One eraser stroke, rendered as a black polyline inside the mask. SVG masks
 * are luminance-based, so black hides and white shows: this punches the stroke
 * out of the drawings underneath it.
 */
function ErasePath({ width, points }: { width: number; points: number[] }) {
  if (points.length < 2) return null;
  let d = `M${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
  return (
    <path
      d={d}
      stroke="#000"
      strokeWidth={width}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
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

/**
 * Memoized on purpose: rebuilding the fog mask means re-rendering every shape
 * in it, and the board re-renders on every pointer move while drawing.
 */
const FogLayer = memo(function FogLayer({
  scene,
  shapes,
  draft,
  draftRadius: draftRadiusProp,
  draftShape,
  draftOpacity,
  lights,
  lightOn,
  blockers,
  fogOccludes,
  seeThrough,
}: {
  scene: { id: string; width: number; height: number };
  shapes: FogShape[];
  draft: { mode: 'reveal' | 'hide'; points: number[] } | null;
  draftRadius: number;
  draftShape: { mode: 'reveal' | 'hide'; round: boolean; a: Vec; b: Vec } | null;
  draftOpacity: number;
  /**
   * Lighting mode: punches the fog open around each token so players can only
   * see what their character lights up. Positions are in world units.
   */
  lights: { x: number; y: number; r: number }[];
  lightOn: boolean;
  blockers: Blocker[];
  fogOccludes: boolean;
  seeThrough?: boolean;
}) {
  const id = `fogmask-${scene.id}`;
  const rects = shapes.map((s) => ({ ...s, r: pointsToRect(s.points) })).filter((s) => s.r);
  // The draft is a flat [x,y,...] point list; each point becomes one circle of
  // the current brush radius.
  const draftRadius = (draftRadiusProp || 0) / 2;

  // The GM can reveal the map "under" the fog (see-through) to prepare scenes.
  const fill = seeThrough ? '#0b0b0f2e' : fogOccludes ? '#0b0b0f' : '#0b0b0fbb';

  return (
    <svg className="grid-svg" width={scene.width} height={scene.height} style={{ pointerEvents: 'none' }}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={scene.width} height={scene.height}>
          <rect x={0} y={0} width={scene.width} height={scene.height} fill="white" />
          {rects.map((s) => {
            const tone = s.mode === 'reveal' ? 'black' : 'white';
            // The mask is luminance based, so this dims the fog where it
            // overlaps. A 'hide' stamp at 0.5 leaves the map half visible.
            const op = s.opacity ?? 1;
            return s.round ? (
              <circle
                key={s.id}
                cx={s.r!.x + s.r!.w / 2}
                cy={s.r!.y + s.r!.h / 2}
                r={s.r!.w / 2}
                fill={tone}
                fillOpacity={op}
              />
            ) : (
              <rect
                key={s.id}
                x={s.r!.x}
                y={s.r!.y}
                width={s.r!.w}
                height={s.r!.h}
                fill={tone}
                fillOpacity={op}
              />
            );
          })}
          {(() => {
            // The draft brush is drawn as ONE stroked path rather than one
            // circle per stamp. With hundreds of stamps the mask was being
            // rebuilt on every pointer move, which is what made the fog brush
            // crawl.
            const pts = draft?.points || [];
            if (pts.length < 2) return null;
            let d = `M${pts[0]} ${pts[1]}`;
            for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
            return (
              <path
                key="draft-brush"
                d={d}
                fill="none"
                stroke={draft?.mode === 'reveal' ? 'black' : 'white'}
                strokeWidth={draftRadius * 2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })()}
          {/* Lighting: black in the mask means no fog, white means full fog, so a
              radial ramp from black at the centre to white at the rim gives
              progressive falloff: clear next to the token, fog closing back in
              towards the maximum vision distance. */}
          {lightOn && (
            <radialGradient id={`light-${scene.id}`}>
              <stop offset="0%" stopColor="#000" />
              <stop offset="35%" stopColor="#000" />
              <stop offset="70%" stopColor="#5a5a5a" />
              <stop offset="100%" stopColor="#fff" />
            </radialGradient>
          )}
          {lightOn &&
            lights.map((l, i) => (
              <g key={`light-${i}`}>
                <circle cx={l.x} cy={l.y} r={l.r} fill={`url(#light-${scene.id})`} />
                {/* What stops light: walls always, closed doors, never windows. An
                    open door lets it through again, like an open window. */}
                {blockers
                  .filter((b) => b.kind === 'wall' || (b.kind === 'door' && !b.open))
                  .flatMap((b) =>
                    segments(b.points).map((s, k) => {
                      const p = shadowPath(l.x, l.y, s.ax, s.ay, s.bx, s.by, l.r);
                      return p ? <path key={`sh-${i}-${b.id}-${k}`} d={p} fill="#fff" /> : null;
                    }),
                  )}
              </g>
            ))}
          {(() => {
            if (!draftShape) return null;
            const x = Math.min(draftShape.a.x, draftShape.b.x);
            const y = Math.min(draftShape.a.y, draftShape.b.y);
            const w = Math.abs(draftShape.b.x - draftShape.a.x);
            const h = Math.abs(draftShape.b.y - draftShape.a.y);
            const tone = draftShape.mode === 'reveal' ? 'black' : 'white';
            return draftShape.round ? (
              <circle
                key="draft-shape"
                cx={x + w / 2}
                cy={y + h / 2}
                r={Math.min(w, h) / 2}
                fill={tone}
                fillOpacity={draftOpacity}
              />
            ) : (
              <rect
                key="draft-shape"
                x={x}
                y={y}
                width={w}
                height={h}
                fill={tone}
                fillOpacity={draftOpacity}
              />
            );
          })()}
        </mask>
      </defs>
      <rect x={0} y={0} width={scene.width} height={scene.height} fill={fill} mask={`url(#${id})`} />
    </svg>
  );
});

function pointsToRect(p: number[]): { x: number; y: number; w: number; h: number } | null {
  if (p.length < 4) return null;
  const x = Math.min(p[0], p[2]);
  const y = Math.min(p[1], p[3]);
  return { x, y, w: Math.abs(p[2] - p[0]), h: Math.abs(p[3] - p[1]) };
}

/**
 * Memoized: the token list re-renders on every pointer move during a drag, and
 * re-rendering each token (recomputing its inline left/top, box shadow and
 * image) is what made them visibly shudder.
 */
const TokenView = memo(function TokenView({
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
        // Tokens are styled inline, so touch-action has to be set here too:
        // without it the browser scrolls instead of letting a finger drag.
        touchAction: 'none',
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
});

/** Human-readable label for a condition (no emoji). */
export function conditionIcon(c: string): string {
  return c;
}
