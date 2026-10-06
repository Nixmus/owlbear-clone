import { useEffect, useMemo, useState } from 'react';
import Board from './components/Board';
import TopBar from './components/TopBar';
import ToolRail from './components/ToolRail';
import ScenePanel from './components/ScenePanel';
import Inspector from './components/Inspector';
import Chat from './components/Chat';
import JoinDialog from './components/JoinDialog';
import Hub from './components/Hub';
import { useStore } from './store';
import { useAuth } from './auth';
import type { Tool } from './types';
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
        <a className="quickplay-fab" href={`/?room=${nanoid(6)}`} title="Quick play without an account">
          🎲 Quick play
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

  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState(localStorage.getItem('vtt.drawColor') || '#fbbf24');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [brushSize, setBrushSize] = useState(90);
  const [fogOccludes, setFogOccludes] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => setSelectedId((e as CustomEvent<string | null>).detail);
    window.addEventListener('vtt:selection', handler);
    return () => window.removeEventListener('vtt:selection', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('vtt.drawColor', color);
  }, [color]);

  useEffect(() => {
    const name = localStorage.getItem('vtt.name');
    const savedColor = localStorage.getItem('vtt.color');
    const role = localStorage.getItem('vtt.role');
    if (name || savedColor || role) {
      useStore.setState({
        self: {
          ...useStore.getState().self,
          name: name || self.name,
          color: savedColor || self.color,
          role: role === 'gm' ? 'gm' : 'player',
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scene = state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0];
  const sceneDrawings = useMemo(
    () => state.drawings.filter((d) => d.sceneId === scene?.id),
    [state.drawings, scene?.id],
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
        name: 'New token',
        color: self.color,
        imageUrl: null,
        hidden: false,
        locked: false,
        conditions: [],
        owner: null,
      },
    });
  };

  const undoDrawing = () => {
    const last = sceneDrawings[sceneDrawings.length - 1];
    if (last) dispatch({ kind: 'drawing.remove', id: last.id });
  };

  const clearDrawings = () => {
    if (scene && confirm('Clear all drawings on this scene?')) {
      dispatch({ kind: 'drawing.clear', sceneId: scene.id });
    }
  };

  const clearFog = () => {
    if (scene && confirm('Reset fog of war on this scene?')) {
      dispatch({ kind: 'fog.clear', sceneId: scene.id });
    }
  };

  const joined = status === 'connected' || status === 'connecting';

  return (
    <div className="app">
      <TopBar />
      <ToolRail
        tool={tool}
        setTool={setTool}
        canUndo={sceneDrawings.length > 0}
        onUndo={undoDrawing}
        onClearDrawings={clearDrawings}
        onClearFog={clearFog}
        onAddToken={addToken}
      />

      <Board
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        fogOccludes={fogOccludes}
        brushSize={brushSize}
      />

      <div className="side">
        <ScenePanel
          color={color}
          setColor={setColor}
          strokeWidth={strokeWidth}
          setStrokeWidth={setStrokeWidth}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          fogOccludes={fogOccludes}
          setFogOccludes={setFogOccludes}
        />
        <Inspector selectedId={selectedId} />
        <Chat />
      </div>

      {!joined && <JoinDialog />}
    </div>
  );
}
