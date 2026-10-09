import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { verifyToken } from './auth.js';
import { router, UPLOAD_DIR } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const CLIENT_DIST = path.resolve(__dirname, '..', 'client', 'dist');

/* ------------------------------------------------------------------ *
 * Room state
 * ------------------------------------------------------------------ */

function emptyScene(name = 'Scene 1') {
  return {
    id: nanoid(10),
    name,
    mapUrl: null,
    backgroundColor: '#2b2b33',
    gridType: 'square',
    gridSize: 70,
    gridColor: '#ffffff22',
    width: 1920,
    height: 1080,
  };
}

function emptyRoom(id) {
  const scene = emptyScene();
  return {
    id,
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

const rooms = new Map(); // roomId -> { state, saveTimer }
const players = new Map(); // roomId -> Map<clientId, player>
const connections = new Map(); // roomId -> Set<ws>

function loadRoom(roomId) {
  const room = emptyRoom(roomId);
  try {
    const row = db.prepare('SELECT state FROM rooms WHERE id = ?').get(roomId);
    if (row?.state) {
      const parsed = JSON.parse(row.state);
      Object.assign(room, parsed);
      // Rooms persisted before the eraser existed have no `erasers` key.
      if (!Array.isArray(room.erasers)) room.erasers = [];
      // Same for decals, which were added later than the rest.
      if (!Array.isArray(room.decals)) room.decals = [];
      if (!Array.isArray(room.blockers)) room.blockers = [];
      if (!Array.isArray(room.scenes) || room.scenes.length === 0) {
        const scene = emptyScene();
        room.scenes = [scene];
        room.activeSceneId = scene.id;
      }
      room.id = roomId;
    }
  } catch {
    /* fresh room */
  }
  return room;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { state: loadRoom(roomId), saveTimer: null });
  return rooms.get(roomId);
}

const upsertRoom = () =>
  db.prepare(
    `INSERT INTO rooms (id, state, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
  );

function persist(roomId) {
  const entry = rooms.get(roomId);
  if (!entry || entry.saveTimer) return;
  entry.saveTimer = setTimeout(() => {
    entry.saveTimer = null;
    entry.state.updatedAt = Date.now();
    try {
      upsertRoom().run(roomId, JSON.stringify(entry.state), entry.state.updatedAt);
      recordSession(roomId, entry.state);
    } catch (err) {
      console.error('persist failed', err);
    }
  }, 400);
}

// When a room id matches a campaign, mirror its chat into the newest open session.
function recordSession(roomId, state) {
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(roomId);
  if (!campaign) return;
  const session = db
    .prepare('SELECT id FROM sessions WHERE campaign_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
    .get(roomId);
  if (!session) return;
  const record = {
    chat: state.chat.slice(-200),
    scenes: state.scenes.map((s) => ({ id: s.id, name: s.name, mapUrl: s.mapUrl })),
    tokens: state.tokens.length,
    updatedAt: Date.now(),
  };
  db.prepare('UPDATE sessions SET record = ? WHERE id = ?').run(JSON.stringify(record), session.id);
}

/* ------------------------------------------------------------------ *
 * Action reducer (server-authoritative)
 * ------------------------------------------------------------------ */

function merge(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) continue;
    target[k] = v;
  }
  return target;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

function applyAction(state, action, role = 'player', actorUserId = null) {
  if (!action || typeof action !== 'object') return false;
  const isGM = role === 'gm';
  switch (action.kind) {
    case 'scene.add':
      if (!isGM) return false;
      if (!action.scene?.id) return false;
      if (!state.scenes.some((s) => s.id === action.scene.id)) state.scenes.push(action.scene);
      return true;
    case 'scene.update': {
      if (!isGM) return false;
      const scene = state.scenes.find((s) => s.id === action.id);
      if (!scene) return false;
      merge(scene, action.patch);
      return true;
    }
    case 'scene.remove':
      if (!isGM) return false;
      if (state.scenes.length <= 1) return false;
      state.scenes = state.scenes.filter((s) => s.id !== action.id);
      if (state.activeSceneId === action.id) state.activeSceneId = state.scenes[0].id;
      state.tokens = state.tokens.filter((t) => t.sceneId !== action.id);
      state.blockers = (state.blockers || []).filter((b) => b.sceneId !== action.id);
      state.decals = (state.decals || []).filter((d) => d.sceneId !== action.id);
      state.drawings = state.drawings.filter((d) => d.sceneId !== action.id);
      state.erasers = (state.erasers || []).filter((e) => e.sceneId !== action.id);
      state.fog = state.fog.filter((f) => f.sceneId !== action.id);
      return true;
    case 'scene.activate':
      if (!isGM) return false;
      if (state.scenes.some((s) => s.id === action.id)) {
        state.activeSceneId = action.id;
        return true;
      }
      return false;
    case 'token.add':
      if (!action.token?.id) return false;
      if (state.tokens.some((t) => t.id === action.token.id)) return false;
      // A player may only stamp tokens with their own account id, never someone else's.
      if (!isGM) action.token.userId = actorUserId || null;
      if (action.token.owner === undefined) action.token.owner = null;
      if (action.token.characterId === undefined) action.token.characterId = null;
      if (!Array.isArray(action.token.conditions)) action.token.conditions = [];
      state.tokens.push(action.token);
      return true;
    case 'token.update': {
      const token = state.tokens.find((t) => t.id === action.id);
      if (!token) return false;
      // Players may not hide/lock tokens, nor change ownership/identity fields.
      if (!isGM) {
        const forbidden = ['hidden', 'locked', 'owner', 'userId'];
        for (const k of forbidden) if (k in (action.patch || {})) delete action.patch[k];
      }
      merge(token, action.patch);
      return true;
    }
    case 'token.remove':
      state.tokens = state.tokens.filter((t) => t.id !== action.id);
      return true;
    case 'decal.add': {
      if (!isGM) return false;
      const d = action.decal;
      if (!d || !d.id || typeof d.url !== 'string' || !d.url.startsWith('/uploads/')) {
        return false;
      }
      if (!state.decals) state.decals = [];
      if (state.decals.some((x) => x.id === d.id)) return false;
      const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
      // Sizes are clamped so a malicious client cannot create invisible or
      // map-sized decals.
      state.decals.push({
        id: d.id,
        sceneId: d.sceneId,
        url: d.url,
        x: num(d.x, 0),
        y: num(d.y, 0),
        w: Math.min(20000, Math.max(1, num(d.w, 200))),
        h: Math.min(20000, Math.max(1, num(d.h, 200))),
        opacity: Math.min(1, Math.max(0, num(d.opacity, 1))),
      });
      return true;
    }
    case 'decal.update': {
      if (!isGM) return false;
      const d = (state.decals || []).find((x) => x.id === action.id);
      if (!d) return false;
      const p = action.patch || {};
      const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
      if ('x' in p && num(p.x) !== undefined) d.x = num(p.x);
      if ('y' in p && num(p.y) !== undefined) d.y = num(p.y);
      if ('w' in p && num(p.w) !== undefined) d.w = Math.min(20000, Math.max(1, num(p.w)));
      if ('h' in p && num(p.h) !== undefined) d.h = Math.min(20000, Math.max(1, num(p.h)));
      if ('opacity' in p && num(p.opacity) !== undefined) {
        d.opacity = Math.min(1, Math.max(0, num(p.opacity)));
      }
      return true;
    }
    case 'decal.remove':
      if (!isGM) return false;
      state.decals = (state.decals || []).filter((d) => d.id !== action.id);
      return true;
    case 'blocker.add': {
      if (!isGM) return false;
      const b = action.blocker;
      if (!b || !b.id) return false;
      if (!Array.isArray(b.points) || b.points.length < 4) return false;
      if (!['wall', 'door', 'window'].includes(b.kind)) return false;
      if (!state.blockers) state.blockers = [];
      if (state.blockers.some((x) => x.id === b.id)) return false;
      const pts = b.points.map(Number);
      if (pts.some((n) => !Number.isFinite(n))) return false;
      state.blockers.push({
        id: b.id,
        sceneId: b.sceneId,
        kind: b.kind,
        points: pts,
        open: b.kind === 'wall' ? false : !!b.open,
      });
      return true;
    }
    case 'blocker.update': {
      if (!isGM) return false;
      const b = (state.blockers || []).find((x) => x.id === action.id);
      if (!b) return false;
      const p = action.patch || {};
      if (Array.isArray(p.points)) {
        const pts = p.points.map(Number);
        if (pts.length >= 4 && pts.every((n) => Number.isFinite(n))) b.points = pts;
      }
      if ('open' in p) b.open = !!p.open;
      return true;
    }
    case 'blocker.remove':
      if (!isGM) return false;
      state.blockers = (state.blockers || []).filter((b) => b.id !== action.id);
      return true;
    case 'drawing.add': {
      if (!action.drawing?.id) return false;
      if (state.drawings.some((x) => x.id === action.drawing.id)) return false;
      const incoming = action.drawing;
      // Normalize the optional paint properties instead of trusting the client.
      const fill = incoming.fill == null ? null : String(incoming.fill);
      const opacity = Number(incoming.opacity);
      const seq = Number(incoming.seq);
      state.drawings.push({
        ...incoming,
        fill,
        opacity: Number.isFinite(opacity) ? clamp01(opacity) : 1,
        seq: Number.isFinite(seq) ? seq : 0,
      });
      return true;
    }
    case 'drawing.update': {
      const d = state.drawings.find((x) => x.id === action.id);
      if (!d) return false;
      const patch = { ...(action.patch || {}) };
      if ('opacity' in patch) patch.opacity = clamp01(Number(patch.opacity));
      if ('fill' in patch) patch.fill = patch.fill == null ? null : String(patch.fill);
      merge(d, patch);
      return true;
    }
    case 'drawing.remove':
      state.drawings = state.drawings.filter((d) => d.id !== action.id);
      return true;
    case 'drawing.clear':
      if (!isGM) return false;
      state.drawings = state.drawings.filter((d) => d.sceneId !== action.sceneId);
      // Same reason as the client reducer: a surviving eraser would punch holes
      // in whatever gets drawn next.
      state.erasers = (state.erasers || []).filter((e) => e.sceneId !== action.sceneId);
      return true;
    case 'erase.add': {
      if (!action.erase?.id) return false;
      if (!Array.isArray(action.erase.points) || action.erase.points.length < 2) return false;
      if (!state.erasers) state.erasers = [];
      if (state.erasers.some((x) => x.id === action.erase.id)) return false;
      const width = Number(action.erase.width);
      if (!Number.isFinite(width) || width <= 0) return false;
      const seq = Number(action.erase.seq);
      state.erasers.push({
        id: action.erase.id,
        sceneId: action.erase.sceneId,
        width,
        points: action.erase.points.map(Number),
        // Paint order, assigned client-side and agreed by every client; it only
        // decides which strokes an eraser hides.
        seq: Number.isFinite(seq) ? seq : 0,
      });
      return true;
    }
    case 'erase.remove':
      state.erasers = (state.erasers || []).filter((e) => e.id !== action.id);
      return true;
    case 'erase.clear':
      if (!isGM) return false;
      state.erasers = (state.erasers || []).filter((e) => e.sceneId !== action.sceneId);
      return true;
    case 'fog.add':
      if (!isGM) return false;
      if (!action.shape?.id) return false;
      if (!state.fog.some((x) => x.id === action.shape.id)) state.fog.push(action.shape);
      return true;
    case 'fog.addMany': {
      if (!isGM) return false;
      if (!Array.isArray(action.shapes)) return false;
      if (!state.fog) state.fog = [];
      const seen = new Set(state.fog.map((x) => x.id));
      let added = false;
      for (const s of action.shapes) {
        if (!s || !s.id || seen.has(s.id)) continue;
        if (s.mode !== 'reveal' && s.mode !== 'hide') continue;
        if (!Array.isArray(s.points) || s.points.length < 4) continue;
        seen.add(s.id);
        state.fog.push({
          id: s.id,
          sceneId: s.sceneId,
          mode: s.mode,
          points: s.points.map(Number),
          round: !!s.round,
          opacity: Number.isFinite(Number(s.opacity))
            ? Math.min(1, Math.max(0, Number(s.opacity)))
            : 1,
        });
        added = true;
      }
      return added;
    }
    case 'fog.removeMany': {
      if (!isGM) return false;
      if (!Array.isArray(action.ids)) return false;
      const drop = new Set(action.ids.map(String));
      state.fog = (state.fog || []).filter((f) => !drop.has(f.id));
      return true;
    }
    case 'fog.clear':
      if (!isGM) return false;
      state.fog = state.fog.filter((f) => f.sceneId !== action.sceneId);
      return true;
    case 'chat.add':
      if (!action.message?.id) return false;
      state.chat.push(action.message);
      if (state.chat.length > 300) state.chat.splice(0, state.chat.length - 300);
      return true;
    case 'log.add':
      if (!action.entry?.id) return false;
      if (!state.log) state.log = [];
      if (!state.log.some((e) => e.id === action.entry.id)) state.log.push(action.entry);
      if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
      return true;
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * HTTP app
 * ------------------------------------------------------------------ */

const app = express();
// CORS: same-origin in the default (combined) deployment. Set CORS_ORIGIN to a
// comma-separated list of origins if you host the frontend elsewhere.
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// REST API
app.use('/api', router);

// Uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Static client (production build)
app.use(express.static(CLIENT_DIST));
app.get(/^\/(?!api|uploads|healthz).*/, (_req, res) => {
  const index = path.join(CLIENT_DIST, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.json({ ok: true, message: 'Owlbear clone server running (client not built).' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: undefined });

wss.on('connection', (ws) => {
  ws.clientId = nanoid(8);
  ws.roomId = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') {
      const roomId = String(msg.roomId || 'default').slice(0, 64);
      ws.roomId = roomId;
      if (!connections.has(roomId)) connections.set(roomId, new Set());
      connections.get(roomId).add(ws);
      if (!players.has(roomId)) players.set(roomId, new Map());

      const roster = players.get(roomId);

      // Identify the user (if the room is a campaign and they are logged in).
      const claims = msg.token ? verifyToken(msg.token) : null;
      const userId = claims?.id || null;
      ws.userId = userId;

      // Determine role:
      //  - campaign owner            -> gm
      //  - campaign member with 'gm' -> gm
      //  - anyone else (guest)       -> player
      let role = 'player';
      const inCampaign = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(roomId);
      if (inCampaign) {
        // It's a campaign: only the owner (or a member promoted to gm) is GM.
        if (userId && inCampaign.owner_id === userId) role = 'gm';
        else if (userId) {
          const member = db
            .prepare('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
            .get(roomId, userId);
          if (member?.role === 'gm' || member?.role === 'owner') role = 'gm';
        }
      } else {
        // Casual room (no campaign): the first to join is the GM.
        const hasGM = [...roster.values()].some((p) => p.role === 'gm');
        if (!hasGM) role = 'gm';
      }

      const player = {
        id: ws.clientId,
        userId,
        name: String(msg.name || 'Player').slice(0, 32),
        color: msg.color || '#7dd3fc',
        role,
        joinedAt: Date.now(),
      };
      roster.set(ws.clientId, player);

      const { state } = getRoom(roomId);

      // Reclaim tokens created by this account in a previous session.
      // `owner` holds a clientId, which is regenerated on every connection, so
      // without this a player would lose control of their own tokens as soon as
      // they left and came back. `userId` is the stable identity.
      if (userId) {
        for (const t of state.tokens || []) {
          if (t.userId === userId && t.owner !== ws.clientId) t.owner = ws.clientId;
        }
      }

      // Record the join in the shared history.
      if (!state.log) state.log = [];
      state.log.push({
        id: nanoid(),
        ts: Date.now(),
        actor: player.name,
        actorId: player.id,
        kind: 'join',
        text: `${player.name} entró a la mesa (${role === 'gm' ? 'director' : 'jugador'})`,
      });
      if (state.log.length > 500) state.log.splice(0, state.log.length - 500);

      send(ws, { type: 'init', clientId: ws.clientId, state, players: [...roster.values()] });
      broadcast(roomId, { type: 'players', players: [...roster.values()] });
      persist(roomId);
      return;
    }

    if (!ws.roomId) return;
    const entry = getRoom(ws.roomId);

    // GM-only: change another player's role.
    if (msg.type === 'role.set') {
      const roster = players.get(ws.roomId);
      const me = roster?.get(ws.clientId);
      if (roster && me?.role === 'gm' && msg.targetId) {
        const target = roster.get(msg.targetId);
        if (target) {
          // The campaign owner always keeps the GM role.
          const camp = db.prepare('SELECT owner_id FROM campaigns WHERE id = ?').get(ws.roomId);
          const targetIsOwner = camp && target.userId && camp.owner_id === target.userId;
          if (!targetIsOwner) {
            target.role = msg.role === 'gm' ? 'gm' : 'player';
            broadcast(ws.roomId, { type: 'players', players: [...roster.values()] });
          }
        }
      }
      return;
    }

    if (msg.type === 'action') {
      const player = players.get(ws.roomId)?.get(ws.clientId);
      const role = player?.role === 'gm' ? 'gm' : 'player';
      if (applyAction(entry.state, msg.action, role, ws.userId)) {
        persist(ws.roomId);
        broadcast(ws.roomId, { type: 'action', action: msg.action, from: ws.clientId });
      }
      return;
    }

    // Focus / ping on the map (ephemeral, broadcast only).
    if (msg.type === 'ping') {
      const me = players.get(ws.roomId)?.get(ws.clientId);
      broadcast(ws.roomId, {
        type: 'ping',
        from: ws.clientId,
        x: msg.x,
        y: msg.y,
        sceneId: msg.sceneId,
        kind: msg.kind === 'focus' ? 'focus' : 'ping',
        color: me?.color || '#ffffff',
        name: me?.name || '',
      });
      return;
    }

    if (msg.type === 'cursor') {
      broadcast(
        ws.roomId,
        { type: 'cursor', from: ws.clientId, x: msg.x, y: msg.y, sceneId: msg.sceneId },
        ws,
      );
      return;
    }

    if (msg.type === 'profile') {
      const p = players.get(ws.roomId)?.get(ws.clientId);
      if (p) {
        if (msg.name) p.name = String(msg.name).slice(0, 32);
        if (msg.color) p.color = msg.color;
        // role is assigned by the server, never by the client
        broadcast(ws.roomId, { type: 'players', players: [...players.get(ws.roomId).values()] });
      }
      return;
    }

    if (msg.type === 'ping') send(ws, { type: 'pong', t: msg.t });
  });

  ws.on('close', () => {
    if (ws.roomId) {
      connections.get(ws.roomId)?.delete(ws);
      players.get(ws.roomId)?.delete(ws.clientId);
      broadcast(ws.roomId, { type: 'players', players: [...(players.get(ws.roomId)?.values() ?? [])] });
    }
  });

  ws.on('error', () => {});
});

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(roomId, payload, except) {
  const set = connections.get(roomId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws === except) continue;
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Owlbear clone server listening on http://localhost:${PORT}`);
  console.log(`REST API:  http://localhost:${PORT}/api`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
