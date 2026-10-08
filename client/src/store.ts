import { create } from 'zustand';
import type {
  Action,
  ChatMessage,
  Player,
  RoomState,
  Scene,
  Token,
} from './types';
import { nanoid } from './util';
import { getToken } from './api';

export interface Presence {
  id: string; // clientId, only valid for the current session
  userId: string | null; // account id, persists across sessions
  name: string;
  color: string;
  role: 'gm' | 'player';
}

type Status = 'connecting' | 'connected' | 'disconnected';

interface Store {
  status: Status;
  roomId: string;
  clientId: string;
  self: Presence;
  players: Player[];
  state: RoomState;
  characters: import('./api').Character[];
  cursors: Record<string, { x: number; y: number; sceneId: string; color: string; name: string; ts: number }>;
  pings: Record<string, { x: number; y: number; sceneId: string; color: string; name: string; kind: string; ts: number }>;
  previewSceneId: string | null;
  lastActionAt: number;

  send: (msg: unknown) => void;
  connect: (roomId: string) => void;
  dispatch: (action: Action) => void;
  setSelf: (patch: Partial<Presence>) => void;
  setPlayers: (players: Player[]) => void;
  setState: (state: RoomState) => void;
  setCharacters: (characters: import('./api').Character[]) => void;
  setStatus: (status: Status) => void;
  setCursor: (from: string, cursor: { x: number; y: number; sceneId: string }) => void;
  addPing: (from: string, ping: { x: number; y: number; sceneId: string; kind: string }) => void;
  setPreviewScene: (id: string | null) => void;
  logEvent: (
    entry: Omit<import('./types').GameLogEntry, 'id' | 'ts' | 'actor' | 'actorId'>,
  ) => void;
  setRole: (targetId: string, role: 'gm' | 'player') => void;
  undoDraw: () => void;
}

/**
 * Local stack of the drawing/erasing actions *this* client performed, so undo
 * can step back through them. Remote actions arrive via `setState`, never
 * through `dispatch`, so they never land here.
 */
type Undoable = { kind: 'drawing.add' | 'erase.add'; id: string };
const undoStack: Undoable[] = [];

/**
 * Paint order for a scene. Every client runs this reducer over the same actions
 * in the same order, so they all assign the same seq to the same stroke, which
 * is what lets the eraser hide old strokes without hiding new ones drawn after
 * it. The server just stores the value.
 */
let paintSeq = 0;
function nextSeq(current: number | undefined): number {
  paintSeq = Math.max(paintSeq, current ?? 0) + 1;
  return paintSeq;
}

function emptyState(roomId: string): RoomState {
  const scene: Scene = {
    id: nanoid(10),
    name: 'Scene 1',
    mapUrl: null,
    backgroundColor: '#2b2b33',
    gridType: 'square',
    gridSize: 70,
    gridColor: '#ffffff22',
    width: 1920,
    height: 1080,
  };
  return {
    id: roomId,
    tokens: [],
    drawings: [],
    erasers: [],
    fog: [],
    chat: [],
    log: [],
    scenes: [scene],
    activeSceneId: scene.id,
    updatedAt: Date.now(),
  };
}

/** Reduce an action locally so the UI updates instantly (optimistic). */
export function reduce(state: RoomState, action: Action): RoomState {
  switch (action.kind) {
    case 'scene.add':
      return state.scenes.some((s) => s.id === action.scene.id)
        ? state
        : { ...state, scenes: [...state.scenes, action.scene] };
    case 'scene.update':
      return {
        ...state,
        scenes: state.scenes.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
      };
    case 'scene.remove': {
      if (state.scenes.length <= 1) return state;
      const scenes = state.scenes.filter((s) => s.id !== action.id);
      return {
        ...state,
        scenes,
        activeSceneId: state.activeSceneId === action.id ? scenes[0].id : state.activeSceneId,
        tokens: state.tokens.filter((t) => t.sceneId !== action.id),
        drawings: state.drawings.filter((d) => d.sceneId !== action.id),
        fog: state.fog.filter((f) => f.sceneId !== action.id),
      };
    }
    case 'scene.activate':
      return { ...state, activeSceneId: action.id };
    case 'token.add':
      return state.tokens.some((t) => t.id === action.token.id)
        ? state
        : { ...state, tokens: [...state.tokens, action.token] };
    case 'token.update':
      return {
        ...state,
        tokens: state.tokens.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };
    case 'token.remove':
      return { ...state, tokens: state.tokens.filter((t) => t.id !== action.id) };
    case 'drawing.add': {
      if (state.drawings.some((d) => d.id === action.drawing.id)) return state;
      const seq = nextSeq(action.drawing.seq);
      return { ...state, drawings: [...state.drawings, { ...action.drawing, seq }] };
    }
    case 'drawing.update':
      return {
        ...state,
        drawings: state.drawings.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
      };
    case 'drawing.remove':
      return { ...state, drawings: state.drawings.filter((d) => d.id !== action.id) };
    case 'drawing.clear':
      // Erasers must go too: a leftover eraser would keep punching holes in
      // whatever is drawn next.
      return {
        ...state,
        drawings: state.drawings.filter((d) => d.sceneId !== action.sceneId),
        erasers: (state.erasers || []).filter((e) => e.sceneId !== action.sceneId),
      };
    case 'erase.add': {
      const list = state.erasers || [];
      if (list.some((e) => e.id === action.erase.id)) return state;
      const seq = nextSeq(action.erase.seq);
      return { ...state, erasers: [...list, { ...action.erase, seq }] };
    }
    case 'erase.remove':
      return { ...state, erasers: (state.erasers || []).filter((e) => e.id !== action.id) };
    case 'erase.clear':
      return { ...state, erasers: (state.erasers || []).filter((e) => e.sceneId !== action.sceneId) };
    case 'fog.add':
      return state.fog.some((f) => f.id === action.shape.id)
        ? state
        : { ...state, fog: [...state.fog, action.shape] };
    // A brush stroke is many stamps; committing them in one action keeps a
    // single WebSocket message per drag instead of one per stamp.
    case 'fog.addMany': {
      const known = new Set(state.fog.map((f) => f.id));
      const fresh = action.shapes.filter((s) => !known.has(s.id));
      return fresh.length ? { ...state, fog: [...state.fog, ...fresh] } : state;
    }
    case 'fog.removeMany': {
      const drop = new Set(action.ids);
      return { ...state, fog: state.fog.filter((f) => !drop.has(f.id)) };
    }
    case 'fog.clear':
      return { ...state, fog: state.fog.filter((f) => f.sceneId !== action.sceneId) };
    case 'chat.add': {
      if (state.chat.some((m) => m.id === action.message.id)) return state;
      const chat = [...state.chat, action.message];
      if (chat.length > 300) chat.splice(0, chat.length - 300);
      return { ...state, chat };
    }
    case 'log.add': {
      if (state.log.some((e) => e.id === action.entry.id)) return state;
      const log = [...state.log, action.entry];
      if (log.length > 500) log.splice(0, log.length - 500);
      return { ...state, log };
    }
    default:
      return state;
  }
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 600;
const pending: Action[] = [];

export const useStore = create<Store>((set, get) => ({
  status: 'disconnected',
  roomId: new URLSearchParams(location.search).get('room') || nanoid(6),
  clientId: '',
  self: { id: '', userId: null, name: 'Player', color: '#7dd3fc', role: 'player' },
  players: [],
  state: emptyState('local'),
  characters: [],
  cursors: {},
  pings: {},
  previewSceneId: null,
  lastActionAt: 0,

  setStatus: (status) => set({ status }),
  setState: (state) => set({ state }),
  setPlayers: (players) => set({ players }),
  setCharacters: (characters) => set({ characters }),

  setSelf: (patch) => {
    const self = { ...get().self, ...patch };
    set({ self });
    get().send({ type: 'profile', ...patch });
  },

  setRole: (targetId, role) => {
    get().send({ type: 'role.set', targetId, role });
  },

  setPreviewScene: (id) => set({ previewSceneId: id }),

  logEvent: (entry) => {
    const { self } = get();
    get().dispatch({
      kind: 'log.add',
      entry: {
        id: nanoid(),
        ts: Date.now(),
        actor: self.name,
        actorId: self.id,
        ...entry,
      },
    });
  },

  send: (msg) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  },

  dispatch: (action) => {
    // optimistic local update
    set((s) => ({ state: reduce(s.state, action), lastActionAt: Date.now() }));
    if (action.kind === 'drawing.add' || action.kind === 'erase.add') {
      undoStack.push({ kind: action.kind, id: action.kind === 'drawing.add' ? action.drawing.id : action.erase.id });
      if (undoStack.length > 100) undoStack.shift();
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action }));
    } else {
      pending.push(action);
    }
  },

  undoDraw: () => {
    const last = undoStack.pop();
    if (!last) return;
    get().dispatch(
      last.kind === 'drawing.add'
        ? { kind: 'drawing.remove', id: last.id }
        : { kind: 'erase.remove', id: last.id },
    );
  },

  setCursor: (from, cursor) => {
    const players = get().players;
    const p = players.find((x) => x.id === from);
    set((s) => ({
      cursors: {
        ...s.cursors,
        [from]: {
          ...cursor,
          color: p?.color || '#ffffff',
          name: p?.name || '?',
          ts: Date.now(),
        },
      },
    }));
  },

  addPing: (from, ping) => {
    const players = get().players;
    const p = players.find((x) => x.id === from);
    const item = {
      ...ping,
      color: p?.color || '#ffffff',
      name: p?.name || '',
      ts: Date.now(),
    };
    set((s) => {
      const pings = { ...s.pings, [from]: item };
      // also shift the local viewport onto focus pings
      return { pings };
    });
    // Focus requests move everyone's camera.
    if (ping.kind === 'focus') {
      window.dispatchEvent(new CustomEvent('vtt:focus', { detail: ping }));
    }
  },

  connect: (roomId) => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    set({ status: 'connecting', roomId });
    const configured = import.meta.env.VITE_WS_URL as string | undefined;
    let wsUrl: string;
    if (configured) {
      wsUrl = configured;
    } else if (import.meta.env.DEV) {
      wsUrl = 'ws://localhost:4000';
    } else {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      wsUrl = `${proto}://${location.host}`;
    }
    const ws = new WebSocket(wsUrl);
    socket = ws;

    ws.onopen = () => {
      reconnectDelay = 600;
      const { self } = get();
      ws.send(
        JSON.stringify({
          type: 'join',
          roomId,
          name: self.name,
          color: self.color,
          token: getToken(),
        }),
      );
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const store = get();
      switch (msg.type) {
        case 'init': {
          const me = (msg.players || []).find((p: Player) => p.id === msg.clientId);
          set({
            status: 'connected',
            clientId: msg.clientId,
            state: msg.state,
            players: msg.players || [],
            self: { ...store.self, id: msg.clientId, role: me?.role || store.self.role },
          });
          // flush queued actions
          while (pending.length) {
            const action = pending.shift()!;
            store.dispatch(action);
          }
          break;
        }
        case 'action':
          // The server echoes every action back, including our own. Applying
          // our own echo on top of the optimistic update re-renders the actor's
          // own board mid-drag, which is what made tokens visibly shudder, so
          // it is dropped: we already applied it locally.
          if (msg.from && msg.from === get().clientId) break;
          set((s) => ({ state: reduce(s.state, msg.action), lastActionAt: Date.now() }));
          break;
        case 'players': {
          const list: Player[] = msg.players || [];
          const me = list.find((p) => p.id === get().clientId);
          set((s) => ({
            players: list,
            self: me ? { ...s.self, role: me.role } : s.self,
          }));
          break;
        }
        case 'cursor':
          get().setCursor(msg.from, { x: msg.x, y: msg.y, sceneId: msg.sceneId });
          break;
        case 'ping':
          get().addPing(msg.from, {
            x: msg.x,
            y: msg.y,
            sceneId: msg.sceneId,
            kind: msg.kind,
          });
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      set({ status: 'disconnected' });
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 15000);
        get().connect(roomId);
      }, reconnectDelay);
    };

    ws.onerror = () => ws.close();
  },
}));

export function makeMessage(author: string, color: string, text: string): ChatMessage {
  return { id: nanoid(), author, color, text, ts: Date.now() };
}

export function makeToken(sceneId: string, patch: Partial<Token> = {}): Token {
  return {
    id: nanoid(),
    sceneId,
    x: 0,
    y: 0,
    size: 1,
    name: 'Token',
    color: '#60a5fa',
    imageUrl: null,
    hidden: false,
    locked: false,
    conditions: [],
    owner: null,
    userId: null,
    characterId: null,
    ...patch,
  };
}
