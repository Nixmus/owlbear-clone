import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { hashPassword, verifyPassword, signToken, getUserFromReq } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Default uploads under the persistent data dir so they survive container
// recreation. Override with UPLOAD_DIR if needed.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const router = express.Router();

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

const now = () => Date.now();

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.display_name,
    avatarUrl: u.avatar_url,
    bio: u.bio,
    isAdmin: !!u.is_admin,
    createdAt: u.created_at,
  };
}

function auth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function body(req) {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function campaignRole(campaignId, userId) {
  const c = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!c) return { campaign: null, role: null };
  if (c.owner_id === userId) return { campaign: c, role: 'owner' };
  const m = db
    .prepare('SELECT role FROM campaign_members WHERE campaign_id = ? AND user_id = ?')
    .get(campaignId, userId);
  return { campaign: c, role: m?.role || null };
}

function canEdit(role) {
  return role === 'owner' || role === 'gm';
}

/* ------------------------------------------------------------------ *
 * Auth / profile
 * ------------------------------------------------------------------ */

router.post('/auth/register', (req, res) => {
  const { username, email, password, displayName } = body(req);
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .get(username, email);
  if (existing) return res.status(409).json({ error: 'Username or email already taken' });

  const user = {
    id: nanoid(12),
    username: String(username).slice(0, 32),
    email: String(email).slice(0, 120),
    password_hash: hashPassword(password),
    display_name: String(displayName || username).slice(0, 48),
    avatar_url: null,
    bio: null,
    is_admin: 0,
    created_at: now(),
  };
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, bio, is_admin, created_at)
     VALUES (@id, @username, @email, @password_hash, @display_name, @avatar_url, @bio, @is_admin, @created_at)`,
  ).run(user);

  const token = signToken({ id: user.id, username: user.username });
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/auth/login', (req, res) => {
  const { username, password } = body(req);
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, user: publicUser(user) });
});

router.get('/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ user: publicUser(user) });
});

router.patch('/me', auth, (req, res) => {
  const { displayName, bio, avatarUrl } = body(req);
  db.prepare('UPDATE users SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio), avatar_url = COALESCE(?, avatar_url) WHERE id = ?').run(
    displayName ?? null,
    bio ?? null,
    avatarUrl ?? null,
    req.user.id,
  );
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

/* ------------------------------------------------------------------ *
 * Account overview (single-pane dashboard)
 * ------------------------------------------------------------------ */

router.get('/overview', auth, (req, res) => {
  const uid = req.user.id;
  const campaigns = db
    .prepare(
      `SELECT c.id, c.name, c.system, c.cover_url, c.updated_at,
              CASE WHEN c.owner_id = ? THEN 'owner' ELSE cm.role END AS role
       FROM campaigns c
       LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = ?
       WHERE c.owner_id = ? OR cm.user_id IS NOT NULL
       ORDER BY c.updated_at DESC`,
    )
    .all(uid, uid, uid);

  const counts = {
    campaigns: campaigns.length,
    characters: db
      .prepare('SELECT COUNT(*) AS n FROM characters WHERE owner_id = ?')
      .get(uid).n,
    assets: db
      .prepare('SELECT COUNT(*) AS n FROM assets WHERE owner_id = ?')
      .get(uid).n,
    sessions: db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions s
         JOIN campaigns c ON c.id = s.campaign_id
         WHERE c.owner_id = ? OR c.id IN (SELECT campaign_id FROM campaign_members WHERE user_id = ?)`,
      )
      .get(uid, uid).n,
  };

  const recentCharacters = db
    .prepare(
      `SELECT id, campaign_id, name, kind, portrait_url, updated_at
       FROM characters WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 6`,
    )
    .all(uid);

  const recentSessions = db
    .prepare(
      `SELECT s.id, s.campaign_id, s.name, s.started_at, s.ended_at, c.name AS campaign_name
       FROM sessions s JOIN campaigns c ON c.id = s.campaign_id
       WHERE c.owner_id = ? OR c.id IN (SELECT campaign_id FROM campaign_members WHERE user_id = ?)
       ORDER BY s.started_at DESC LIMIT 6`,
    )
    .all(uid, uid);

  res.json({
    counts,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      system: c.system,
      coverUrl: c.cover_url,
      role: c.role,
      updatedAt: c.updated_at,
    })),
    recentCharacters,
    recentSessions,
  });
});

/* ------------------------------------------------------------------ *
 * Campaigns
 * ------------------------------------------------------------------ */

router.get('/campaigns', auth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, cm.role AS member_role,
              (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) AS member_count
       FROM campaigns c
       LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = ?
       WHERE c.owner_id = ? OR cm.user_id IS NOT NULL
       ORDER BY c.updated_at DESC`,
    )
    .all(req.user.id, req.user.id);
  res.json({
    campaigns: rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      system: c.system,
      coverUrl: c.cover_url,
      role: c.owner_id === req.user.id ? 'owner' : c.member_role,
      memberCount: c.member_count,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  });
});

router.post('/campaigns', auth, (req, res) => {
  const { name, description, system, coverUrl } = body(req);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(12);
  const t = now();
  db.prepare(
    `INSERT INTO campaigns (id, owner_id, name, description, system, cover_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, req.user.id, String(name).slice(0, 120), description || null, system || 'Generic', coverUrl || null, t, t);
  res.status(201).json({ id });
});

router.get('/campaigns/:id', auth, (req, res) => {
  const { campaign, role } = campaignRole(req.params.id, req.user.id);
  if (!campaign || !role) return res.status(404).json({ error: 'Not found' });
  const members = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, cm.role, cm.joined_at
       FROM campaign_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.campaign_id = ?`,
    )
    .all(req.params.id);
  const owner = db.prepare('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?').get(campaign.owner_id);
  res.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      system: campaign.system,
      coverUrl: campaign.cover_url,
      createdAt: campaign.created_at,
      updatedAt: campaign.updated_at,
    },
    role,
    owner: publicUser(owner),
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      displayName: m.display_name,
      avatarUrl: m.avatar_url,
      role: m.role,
      joinedAt: m.joined_at,
    })),
  });
});

router.patch('/campaigns/:id', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const { name, description, system, coverUrl } = body(req);
  db.prepare(
    `UPDATE campaigns SET name = COALESCE(?, name), description = COALESCE(?, description),
       system = COALESCE(?, system), cover_url = COALESCE(?, cover_url), updated_at = ?
     WHERE id = ?`,
  ).run(name ?? null, description ?? null, system ?? null, coverUrl ?? null, now(), req.params.id);
  res.json({ ok: true });
});

router.delete('/campaigns/:id', auth, (req, res) => {
  const { campaign, role } = campaignRole(req.params.id, req.user.id);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  if (campaign.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete' });
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---- members ---- */

router.post('/campaigns/:id/members', auth, (req, res) => {
  const { role: myRole } = campaignRole(req.params.id, req.user.id);
  if (!canEdit(myRole)) return res.status(403).json({ error: 'Forbidden' });
  const { username, role } = body(req);
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare(
    `INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(campaign_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(req.params.id, user.id, role || 'player', now());
  res.status(201).json({ ok: true });
});

router.delete('/campaigns/:id/members/:userId', auth, (req, res) => {
  const { role: myRole } = campaignRole(req.params.id, req.user.id);
  if (!canEdit(myRole)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?').run(
    req.params.id,
    req.params.userId,
  );
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Characters / sheets
 * ------------------------------------------------------------------ */

router.get('/campaigns/:id/characters', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT * FROM characters WHERE campaign_id = ? ORDER BY updated_at DESC').all(req.params.id);
  res.json({ characters: rows.map(parseCharacter) });
});

function parseCharacter(c) {
  return {
    id: c.id,
    campaignId: c.campaign_id,
    ownerId: c.owner_id,
    name: c.name,
    kind: c.kind,
    data: safeJson(c.data),
    portraitUrl: c.portrait_url,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}
function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

router.post('/campaigns/:id/characters', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const { name, kind, data, portraitUrl } = body(req);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = nanoid(12);
  const t = now();
  db.prepare(
    `INSERT INTO characters (id, campaign_id, owner_id, name, kind, data, portrait_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, req.params.id, req.user.id, name, kind || 'pc', JSON.stringify(data || {}), portraitUrl || null, t, t);
  res.status(201).json({ id });
});

router.get('/characters/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { role } = c.campaign_id ? campaignRole(c.campaign_id, req.user.id) : { role: null };
  if (c.owner_id !== req.user.id && !role) return res.status(403).json({ error: 'Forbidden' });
  res.json({ character: parseCharacter(c) });
});

router.patch('/characters/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { role } = c.campaign_id ? campaignRole(c.campaign_id, req.user.id) : { role: null };
  if (c.owner_id !== req.user.id && !canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const { name, kind, data, portraitUrl } = body(req);
  db.prepare(
    `UPDATE characters SET name = COALESCE(?, name), kind = COALESCE(?, kind),
       data = COALESCE(?, data), portrait_url = COALESCE(?, portrait_url), updated_at = ?
     WHERE id = ?`,
  ).run(
    name ?? null,
    kind ?? null,
    data !== undefined ? JSON.stringify(data) : null,
    portraitUrl ?? null,
    now(),
    req.params.id,
  );
  res.json({ ok: true });
});

router.delete('/characters/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (c.owner_id !== req.user.id) {
    const { role } = c.campaign_id ? campaignRole(c.campaign_id, req.user.id) : { role: null };
    if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

router.get('/campaigns/:id/assets', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT * FROM assets WHERE campaign_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({
    assets: rows.map((a) => ({
      id: a.id,
      campaignId: a.campaign_id,
      ownerId: a.owner_id,
      name: a.name,
      mime: a.mime,
      kind: a.kind,
      url: a.url,
      createdAt: a.created_at,
    })),
  });
});

/* ------------------------------------------------------------------ *
 * Sessions / history
 * ------------------------------------------------------------------ */

router.get('/campaigns/:id/sessions', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT * FROM sessions WHERE campaign_id = ? ORDER BY started_at DESC').all(req.params.id);
  res.json({
    sessions: rows.map((s) => ({
      id: s.id,
      campaignId: s.campaign_id,
      name: s.name,
      notes: s.notes,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    })),
  });
});

router.post('/campaigns/:id/sessions', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const { name, notes, startedAt } = body(req);
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO sessions (id, campaign_id, name, notes, record, started_at)
     VALUES (?, ?, ?, ?, '{}', ?)`,
  ).run(id, req.params.id, String(name || `Session ${new Date().toLocaleDateString()}`), notes || null, startedAt || now());
  res.status(201).json({ id });
});

router.get('/sessions/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { role } = campaignRole(s.campaign_id, req.user.id);
  if (!role) return res.status(403).json({ error: 'Forbidden' });
  res.json({
    session: {
      id: s.id,
      campaignId: s.campaign_id,
      name: s.name,
      notes: s.notes,
      record: safeJson(s.record),
      startedAt: s.started_at,
      endedAt: s.ended_at,
    },
  });
});

router.patch('/sessions/:id', auth, (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const { role } = campaignRole(s.campaign_id, req.user.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const { name, notes, record, endedAt } = body(req);
  db.prepare(
    `UPDATE sessions SET name = COALESCE(?, name), notes = COALESCE(?, notes),
       record = COALESCE(?, record), ended_at = COALESCE(?, ended_at) WHERE id = ?`,
  ).run(
    name ?? null,
    notes ?? null,
    record !== undefined ? JSON.stringify(record) : null,
    endedAt ?? null,
    req.params.id,
  );
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Uploads
 * ------------------------------------------------------------------ */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${nanoid(16)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

router.post('/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  const { campaignId, name, kind, mime } = body(req);
  let assetId = null;
  if (campaignId) {
    const { role } = campaignRole(campaignId, req.user.id);
    if (role) {
      assetId = nanoid(12);
      db.prepare(
        `INSERT INTO assets (id, campaign_id, owner_id, name, mime, kind, url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        assetId,
        campaignId,
        req.user.id,
        name || req.file.originalname,
        mime || req.file.mimetype,
        kind || 'image',
        url,
        now(),
      );
    }
  }
  res.status(201).json({ url, id: assetId });
});

router.delete('/assets/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (a.owner_id !== req.user.id) {
    const { role } = a.campaign_id ? campaignRole(a.campaign_id, req.user.id) : { role: null };
    if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare('DELETE FROM assets WHERE id = ?').run(req.params.id);
  const filePath = path.join(UPLOAD_DIR, path.basename(a.url));
  fs.promises.unlink(filePath).catch(() => {});
  res.json({ ok: true });
});

export { UPLOAD_DIR };
