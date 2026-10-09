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
 * Paint order for a scene, used by the eraser to decide which strokes it hides.
 *
 * The number is stamped once by whoever drew the stroke and then travels with
 * the action, so every client and the server agree on it regardless of the
 * order the messages arrive in. It is seeded from the clock rather than from 0
 * so that two clients creating strokes in the same instant cannot collide.
 */
let paintSeq = Date.now();
function nextSeq(): number {
  paintSeq += 1;
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
    blockers: [],
    decals: [],
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
    case 'decal.add':
      return (state.decals || []).some((d) => d.id === action.decal.id)
        ? state
        : { ...state, decals: [...(state.decals || []), action.decal] };
    case 'decal.update':
      return {
        ...state,
        decals: (state.decals || []).map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d,
        ),
      };
    case 'decal.remove':
      return { ...state, decals: (state.decals || []).filter((d) => d.id !== action.id) };
    case 'blocker.add':
      return (state.blockers || []).some((b) => b.id === action.blocker.id)
        ? state
        : { ...state, blockers: [...(state.blockers || []), action.blocker] };
    case 'blocker.update':
      return {
        ...state,
        blockers: (state.blockers || []).map((b) =>
          b.id === action.id ? { ...b, ...action.patch } : b,
        ),
      };
    case 'blocker.remove':
      return { ...state, blockers: (state.blockers || []).filter((b) => b.id !== action.id) };
    case 'drawing.add': {
      if (state.drawings.some((d) => d.id === action.drawing.id)) return state;
      // `dispatch` stamps the seq for our own strokes; remote ones arrive with
      // the origin's value already attached.
      const seq = action.drawing.seq != null ? action.drawing.seq : nextSeq();
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
      const seq = action.erase.seq != null ? action.erase.seq : nextSeq();
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
    // Paint order has to be stamped here, on the way out, and not inside the
    // reducer: the reducer only runs locally, so a seq computed there never
    // reached the server. Everything was stored as seq 0 and, because the
    // eraser only hides strokes with a *lower* seq, erasing stopped working
    // for everyone after a reload.
    let out = action;
    if (action.kind === 'drawing.add') {
      out = { ...action, drawing: { ...action.drawing, seq: nextSeq() } };
    } else if (action.kind === 'erase.add') {
      out = { ...action, erase: { ...action.erase, seq: nextSeq() } };
    }

    // optimistic local update
    set((s) => ({ state: reduce(s.state, out), lastActionAt: Date.now() }));
    if (out.kind === 'drawing.add' || out.kind === 'erase.add') {
      undoStack.push({
        kind: out.kind,
        id: out.kind === 'drawing.add' ? out.drawing.id : out.erase.id,
      });
      if (undoStack.length > 100) undoStack.shift();
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action: out }));
    } else {
      pending.push(out);
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
        case 'token.snap':
          // The server refused a move that crossed a wall. We already applied it
          // optimistically and we drop our own echoes, so this is the only thing
          // that puts the token back where the server says it is.
          set((s) => ({
            state: {
              ...s.state,
              tokens: s.state.tokens.map((t) =>
                t.id === msg.id ? { ...t, x: msg.x, y: msg.y } : t,
              ),
            },
            lastActionAt: Date.now(),
          }));
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
