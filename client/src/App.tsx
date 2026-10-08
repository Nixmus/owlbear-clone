import { useEffect, useMemo, useState } from 'react';
import Board from './components/Board';
import TopBar from './components/TopBar';
import ToolRail from './components/ToolRail';
import ScenePanel from './components/ScenePanel';
import Inspector from './components/Inspector';
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

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(localStorage.getItem('vtt.drawColor') || '#fbbf24');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [brushSize, setBrushSize] = useState(90);
  const [fogOccludes, setFogOccludes] = useState(true);
  const [gmFogTransparent, setGmFogTransparent] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUsers, setShowUsers] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => setSelectedId((e as CustomEvent<string | null>).detail);
    window.addEventListener('vtt:selection', handler);
    return () => window.removeEventListener('vtt:selection', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('vtt.drawColor', color);
  }, [color]);

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
    <div className="app">
      <TopBar />
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
      />

      <Board
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        fogOccludes={fogOccludes}
        brushSize={brushSize}
        gmFogTransparent={gmFogTransparent}
      />

      <div className="side">
        <ScenePanel
          role={role}
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          fogOccludes={fogOccludes}
          setFogOccludes={setFogOccludes}
          gmFogTransparent={gmFogTransparent}
          setGmFogTransparent={setGmFogTransparent}
        />
        <Inspector selectedId={selectedId} role={role} />
        <Chat />
        <History />
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
