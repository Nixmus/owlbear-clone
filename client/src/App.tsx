import { useEffect, useMemo, useState } from 'react';
import { usePersistedState } from './hooks/usePersistedState';
import Board from './components/Board';
import TopBar from './components/TopBar';
import ToolRail from './components/ToolRail';
import ScenePanel from './components/ScenePanel';
import Inspector from './components/Inspector';
import FogPanel from './components/FogPanel';
import Chat from './components/Chat';
import History from './components/History';
import JoinDialog from './components/JoinDialog';
import UserManager from './components/UserManager';
import Hub from './components/Hub';
import Brand from './components/Brand';
import { useStore } from './store';
import { useAuth } from './auth';
import { api } from './api';
import Icon from './components/Icon';
import type { Tool } from './types';
import type { Role } from './permissions';
import { nanoid } from './util';

/**
 * Simple router:
 *  - `?hub`            -> account / campaigns hub (requires login)
 *  - `?room=<id>`      -> directly enter a table
 *  - default           -> hub (login) with a "quick play" escape hatch
 */
function useRoute() {
  const [route, setRoute] = useState(() => parseRoute());
  useEffect(() => {
    const onPop = () => setRoute(parseRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return route;
}

function parseRoute() {
  const params = new URLSearchParams(location.search);
  if (params.has('room')) return { name: 'table' as const, roomId: params.get('room') || 'pickup' };
  return { name: 'hub' as const };
}

export default function App() {
  const route = useRoute();
  const initAuth = useAuth((s) => s.init);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Restore a quick-play room id from local storage when none is present.
  useEffect(() => {
    if (route.name === 'table' && !new URLSearchParams(location.search).get('room')) {
      const saved = localStorage.getItem('vtt.lastRoom') || nanoid(6);
      localStorage.setItem('vtt.lastRoom', saved);
      const url = new URL(location.href);
      url.searchParams.set('room', saved);
      history.replaceState(null, '', url.toString());
    }
  }, [route]);

  if (route.name === 'hub') {
    return (
      <div className="hub-app">
        <Hub />
        <a className="quickplay-fab" href={`/?room=${nanoid(6)}`} title="Jugar sin cuenta">
          <Icon name="dice" size={16} /> Partida rápida
        </a>
      </div>
    );
  }

  return <Table />;
}

/* ------------------------------------------------------------------ */

function Table() {
  const status = useStore((s) => s.status);
  const state = useStore((s) => s.state);
  const dispatch = useStore((s) => s.dispatch);
  const self = useStore((s) => s.self);
  const connect = useStore((s) => s.connect);
  const user = useAuth((s) => s.user);
  const isLogged = !!user;

  const role = (self.role as Role) || 'player';

  // Tool settings are persisted: leaving the table and coming back should not
  // reset the brush, the fog or the fill to their defaults.
  const [tool, setTool] = usePersistedState<Tool>('vtt.tool', 'select');
  const [color, setColor] = usePersistedState<string>('vtt.drawColor', '#fbbf24');
  const [strokeWidth, setStrokeWidth] = usePersistedState('vtt.strokeWidth', 4);
  const [brushSize, setBrushSize] = usePersistedState('vtt.brushSize', 90);
  const [fillEnabled, setFillEnabled] = usePersistedState('vtt.fillEnabled', false);
  const [fillColor, setFillColor] = usePersistedState('vtt.fillColor', '#ffffff33');
  const [fillOpacity, setFillOpacity] = usePersistedState('vtt.fillOpacity', 0.35);
  const [fogOccludes, setFogOccludes] = usePersistedState('vtt.fogOccludes', true);
  // On by default so the GM can prepare a scene without touching anything.
  const [gmFogTransparent, setGmFogTransparent] = usePersistedState('vtt.gmFogTransparent', true);
  const [fogOpacity, setFogOpacity] = usePersistedState('vtt.fogOpacity', 1);
  const [fogLighting, setFogLighting] = usePersistedState('vtt.fogLighting', false);
  const [fogLightRadius, setFogLightRadius] = usePersistedState('vtt.fogLightRadius', 240);
  // When on, players only see their own tokens instead of everyone's.
  const [fogOwnTokensOnly, setFogOwnTokensOnly] = usePersistedState(
    'vtt.fogOwnTokensOnly',
    false,
  );
  // Decal (map image) tool state: which image to place and how big.
  const [decalImage, setDecalImage] = usePersistedState<{
    url: string;
    w: number;
    h: number;
  } | null>('vtt.decalImage', null);
  const [decalSize, setDecalSize] = usePersistedState('vtt.decalSize', 180);
  const [decalOpacity, setDecalOpacity] = usePersistedState('vtt.decalOpacity', 1);
  // The side column shows one panel at a time; they stay mounted so unsaved
  // edits and scroll positions survive switching.
  const [sideTab, setSideTab] = useState<'scene' | 'fog' | 'token' | 'chat' | 'history'>('chat');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  // On phones the side panels sit on top of the map, so they start closed and
  // are toggled from the top bar.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches,
  );
  const [panelsOpen, setPanelsOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 820px)');
    const onChange = () => {
      setIsNarrow(mq.matches);
      if (!mq.matches) setPanelsOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Picking a tool on a phone should get the panels out of the way.
  useEffect(() => {
    if (isNarrow) setPanelsOpen(false);
  }, [tool, isNarrow]);

  // Escape closes the sheet, matching the desktop shortcut.
  useEffect(() => {
    if (!panelsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelsOpen]);

  useEffect(() => {
    const handler = (e: Event) => setSelectedId((e as CustomEvent<string | null>).detail);
    window.addEventListener('vtt:selection', handler);
    return () => window.removeEventListener('vtt:selection', handler);
  }, []);

  // Keep the account id (and display name) on `self` in sync with the session.
  // Tokens created afterwards record `userId`, which survives reconnects.
  useEffect(() => {
    const cur = useStore.getState().self;
    const next: Partial<typeof cur> = { userId: user?.id ?? null };
    if (user?.displayName) next.name = user.displayName;
    if (cur.userId === next.userId && (!next.name || cur.name === next.name)) return;
    useStore.setState({ self: { ...cur, ...next } });
  }, [user?.id, user?.displayName]);

  useEffect(() => {
    // Identity (name/color) can be restored; the ROLE is assigned by the server.
    const name = localStorage.getItem('vtt.name');
    const savedColor = localStorage.getItem('vtt.color');
    if (name || savedColor) {
      useStore.setState({
        self: {
          ...useStore.getState().self,
          name: name || self.name,
          color: savedColor || self.color,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load characters for keyword chat (only when logged in).
  useEffect(() => {
    if (!user) return;
    api
      .get<{ characters: import('./api').Character[] }>('/characters')
      .then((d) => useStore.getState().setCharacters(d.characters))
      .catch(() => {
        /* not logged in or no characters */
      });
  }, [user]);

  // Players with a profile join directly using their account; no dialog needed.
  useEffect(() => {
    if (user && status === 'disconnected') {
      useStore.setState({
        self: {
          ...useStore.getState().self,
          name: user.displayName,
          color: localStorage.getItem('vtt.color') || '#7dd3fc',
        },
      });
      const room = new URLSearchParams(location.search).get('room') || 'pickup';
      connect(room);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const sceneDrawings = useMemo(
    () => state.drawings.filter((d) => d.sceneId === scene?.id),
    [state.drawings, scene?.id],
  );
  const sceneErasers = useMemo(
    () => (state.erasers || []).filter((e) => e.sceneId === scene?.id),
    [state.erasers, scene?.id],
  );

  const addToken = () => {
    if (!scene) return;
    const size = 1;
    const x = scene.width / 2 - (size * scene.gridSize) / 2;
    const y = scene.height / 2 - (size * scene.gridSize) / 2;
    dispatch({
      kind: 'token.add',
      token: {
        id: nanoid(),
        sceneId: scene.id,
        x,
        y,
        size,
        name: 'Nuevo token',
        color: self.color,
        imageUrl: null,
        hidden: false,
        locked: false,
        conditions: [],
        owner: role === 'player' ? self.id : null,
        userId: self.userId,
        characterId: null,
      },
    });
    useStore.getState().logEvent({ kind: 'token.add', text: `${self.name} añadió un token` });
  };

  const undoDrawing = () => {
    // Steps back through this client's own drawing/erasing actions, in order.
    useStore.getState().undoDraw();
  };

  const clearDrawings = () => {
    if (scene && confirm('¿Borrar todos los dibujos de esta escena?')) {
      dispatch({ kind: 'drawing.clear', sceneId: scene.id });
    }
  };

  const clearFog = () => {
    if (scene && confirm('¿Reiniciar la niebla de esta escena?')) {
      dispatch({ kind: 'fog.clear', sceneId: scene.id });
    }
  };

  const leaveTable = () => {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    location.href = url.toString();
  };

  const joined = status === 'connected' || status === 'connecting';

  return (
    <div className={`app ${panelsOpen ? 'panels-open' : ''}`}>
      <TopBar
        panelOpen={panelsOpen}
        onTogglePanels={isNarrow ? () => setPanelsOpen((v) => !v) : undefined}
      />
      <ToolRail
        tool={tool}
        setTool={setTool}
        role={role}
        color={color}
        setColor={setColor}
        canUndo={sceneDrawings.length > 0 || sceneErasers.length > 0}
        onUndo={undoDrawing}
        onClearDrawings={clearDrawings}
        onClearFog={clearFog}
        onAddToken={addToken}
        onManageUsers={() => setShowUsers(true)}
        gmPeek={gmFogTransparent}
        onTogglePeek={() => setGmFogTransparent((v) => !v)}
      />

      <Board
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        fogOccludes={fogOccludes}
        brushSize={brushSize}
        gmFogTransparent={gmFogTransparent}
        fogOpacity={fogOpacity}
        fogLighting={fogLighting}
        fogLightRadius={fogLightRadius}
        ownTokensOnly={fogLighting && fogOwnTokensOnly}
        decalImage={decalImage}
        decalSize={decalSize}
        decalOpacity={decalOpacity}
        fillEnabled={fillEnabled}
        fillColor={fillColor}
        fillOpacity={fillOpacity}
      />

      <button
        className="side-backdrop"
        aria-label="Cerrar paneles"
        tabIndex={panelsOpen ? 0 : -1}
        onClick={() => setPanelsOpen(false)}
      />

      <div className="side">
        <nav className="side-tabs" aria-label="Paneles laterales">
          {(
            [
              ['scene', 'Escena', 'map'],
              ['fog', 'Niebla', 'fog'],
              ['token', 'Ficha', 'user'],
              ['chat', 'Chat', 'chat'],
              ['history', 'Historial', 'history'],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              className={`side-tab ${sideTab === id ? 'active' : ''}`}
              onClick={() => setSideTab(id)}
              aria-selected={sideTab === id}
            >
              <Icon name={icon} size={14} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="side-panels">
          <div className="side-panel" hidden={sideTab !== 'scene'}>
            <ScenePanel
              role={role}
              color={color}
              setColor={setColor}
              strokeWidth={strokeWidth}
              setStrokeWidth={setStrokeWidth}
              decalImage={decalImage}
              setDecalImage={setDecalImage}
              decalSize={decalSize}
              setDecalSize={setDecalSize}
              decalOpacity={decalOpacity}
              setDecalOpacity={setDecalOpacity}
              fillEnabled={fillEnabled}
              setFillEnabled={setFillEnabled}
              fillColor={fillColor}
              setFillColor={setFillColor}
              fillOpacity={fillOpacity}
              setFillOpacity={setFillOpacity}
            />
          </div>
          <div className="side-panel" hidden={sideTab !== 'fog'}>
            <FogPanel
              role={role}
              fogOccludes={fogOccludes}
              setFogOccludes={setFogOccludes}
              gmFogTransparent={gmFogTransparent}
              setGmFogTransparent={setGmFogTransparent}
              fogOpacity={fogOpacity}
              setFogOpacity={setFogOpacity}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              fogLighting={fogLighting}
              setFogLighting={setFogLighting}
              fogLightRadius={fogLightRadius}
              setFogLightRadius={setFogLightRadius}
              fogOwnTokensOnly={fogOwnTokensOnly}
              setFogOwnTokensOnly={setFogOwnTokensOnly}
            />
          </div>

          <div className="side-panel" hidden={sideTab !== 'token'}>
            <Inspector selectedId={selectedId} role={role} />
          </div>
          <div className="side-panel side-panel-grow" hidden={sideTab !== 'chat'}>
            <Chat />
          </div>
          <div className="side-panel" hidden={sideTab !== 'history'}>
            <History />
          </div>
        </div>
      </div>

      <button className="leave-btn" onClick={leaveTable} title="Salir de esta mesa">
        <Icon name="close" size={14} /> {isLogged ? 'Volver al panel' : 'Salir de la mesa'}
      </button>

      {showUsers && <UserManager onClose={() => setShowUsers(false)} />}

      {!joined && !isLogged && <JoinDialog />}
      {!joined && isLogged && (
        <div className="overlay">
          <div className="card">
            <h1>
              <Brand withName={false} /> Conectando…
            </h1>
            <p className="muted">Entrando a la mesa con tu perfil.</p>
          </div>
        </div>
      )}
    </div>
  );
}
