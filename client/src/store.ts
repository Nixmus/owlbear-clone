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
  id: string;
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
  cursors: Record<string, { x: number; y: number; sceneId: string; color: string; name: string; ts: number }>;
  lastActionAt: number;

  send: (msg: unknown) => void;
  connect: (roomId: string) => void;
  dispatch: (action: Action) => void;
  setSelf: (patch: Partial<Presence>) => void;
  setPlayers: (players: Player[]) => void;
  setState: (state: RoomState) => void;
  setStatus: (status: Status) => void;
  setCursor: (from: string, cursor: { x: number; y: number; sceneId: string }) => void;
  setRole: (targetId: string, role: 'gm' | 'player') => void;
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
    fog: [],
    chat: [],
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
    case 'drawing.add':
      return state.drawings.some((d) => d.id === action.drawing.id)
        ? state
        : { ...state, drawings: [...state.drawings, action.drawing] };
    case 'drawing.update':
      return {
        ...state,
        drawings: state.drawings.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
      };
    case 'drawing.remove':
      return { ...state, drawings: state.drawings.filter((d) => d.id !== action.id) };
    case 'drawing.clear':
      return { ...state, drawings: state.drawings.filter((d) => d.sceneId !== action.sceneId) };
    case 'fog.add':
      return state.fog.some((f) => f.id === action.shape.id)
        ? state
        : { ...state, fog: [...state.fog, action.shape] };
    case 'fog.clear':
      return { ...state, fog: state.fog.filter((f) => f.sceneId !== action.sceneId) };
    case 'chat.add': {
      if (state.chat.some((m) => m.id === action.message.id)) return state;
      const chat = [...state.chat, action.message];
      if (chat.length > 300) chat.splice(0, chat.length - 300);
      return { ...state, chat };
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
  self: { id: '', name: 'Player', color: '#7dd3fc', role: 'player' },
  players: [],
  state: emptyState('local'),
  cursors: {},
  lastActionAt: 0,

  setStatus: (status) => set({ status }),
  setState: (state) => set({ state }),
  setPlayers: (players) => set({ players }),

  setSelf: (patch) => {
    const self = { ...get().self, ...patch };
    set({ self });
    get().send({ type: 'profile', ...patch });
  },

  setRole: (targetId, role) => {
    get().send({ type: 'role.set', targetId, role });
  },

  send: (msg) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  },

  dispatch: (action) => {
    // optimistic local update
    set((s) => ({ state: reduce(s.state, action), lastActionAt: Date.now() }));
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action }));
    } else {
      pending.push(action);
    }
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
    ...patch,
  };
}
