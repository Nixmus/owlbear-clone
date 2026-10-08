import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
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
 * Visibility
 *
 * 'private' means owner-only: other campaign members - including the GM -
 * must not see it. Absent/legacy rows count as public.
 * ------------------------------------------------------------------ */

function canSee(row, userId) {
  return (row.visibility || 'public') !== 'private' || row.owner_id === userId;
}

function normVisibility(v) {
  return v === 'private' ? 'private' : 'public';
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

/* ---- password reset ("olvidé mi contraseña") ---- */

// Step 1: request a reset token. In production, email the token; here we return
// it directly so it can be used without a mail server configured.
router.post('/auth/forgot', (req, res) => {
  const { username } = body(req);
  const user = db
    .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .get(username, username);
  // Always answer ok to avoid leaking which accounts exist.
  if (!user) return res.json({ ok: true });

  const token = nanoid(32);
  const expires = Date.now() + 1000 * 60 * 30; // 30 minutes
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  db.prepare(
    'INSERT INTO password_resets (token, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)',
  ).run(token, user.id, expires, now());

  // Without a mail provider, hand the token back so the UI can show it.
  res.json({ ok: true, token, devDelivery: true });
});

// Step 2: use the token to set a new password.
router.post('/auth/reset', (req, res) => {
  const { token, password } = body(req);
  if (!token || !password) return res.status(400).json({ error: 'token and password are required' });
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!row || row.used || row.expires_at < Date.now()) {
    return res.status(400).json({ error: 'El enlace de recuperación no es válido o ha caducado' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
  res.json({ ok: true });
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

// Change password while logged in (requires the current password).
router.post('/me/password', auth, (req, res) => {
  const { currentPassword, newPassword } = body(req);
  if (String(newPassword || '').length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'La contraseña actual no es correcta' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  res.json({ ok: true });
});

// Delete your own account.
router.delete('/me', auth, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
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
 * Characters across all campaigns (global gallery)
 * ------------------------------------------------------------------ */

router.get('/characters', auth, (req, res) => {
  const uid = req.user.id;
  const { ownership = 'all', kind = 'all', campaignId = '' } = req.query;

  // All campaigns the user takes part in (owner or member).
  const rows = db
    .prepare(
      `SELECT ch.*, c.name AS campaign_name,
              (ch.owner_id = ?) AS is_mine
       FROM characters ch
       LEFT JOIN campaigns c ON c.id = ch.campaign_id
       WHERE ch.campaign_id IS NULL
          OR ch.campaign_id IN (
               SELECT id FROM campaigns WHERE owner_id = ?
               UNION
               SELECT campaign_id FROM campaign_members WHERE user_id = ?
             )`,
    )
    .all(uid, uid, uid);

  // Private sheets stay hidden from everyone but their owner.
  const visibleRows = rows.filter((c) => canSee(c, uid));

  let list = visibleRows.map((c) => ({
    id: c.id,
    campaignId: c.campaign_id,
    campaignName: c.campaign_name,
    ownerId: c.owner_id,
    isMine: !!c.is_mine,
    name: c.name,
    kind: c.kind,
    data: safeJson(c.data),
    portraitUrl: c.portrait_url,
    visibility: c.visibility || 'public',
    updatedAt: c.updated_at,
  }));

  if (ownership === 'mine') list = list.filter((c) => c.isMine);
  else if (ownership === 'others') list = list.filter((c) => !c.isMine);
  if (kind !== 'all') list = list.filter((c) => c.kind === kind);
  if (campaignId) list = list.filter((c) => c.campaignId === campaignId);

  res.json({ characters: list });
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

// Join a campaign using its invite code (the campaign id).
router.post('/campaigns/join', auth, (req, res) => {
  const code = String(body(req).code || '').trim();
  if (!code) return res.status(400).json({ error: 'Introduce un código de partida' });
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(code);
  if (!campaign) return res.status(404).json({ error: 'No existe ninguna campaña con ese código' });
  if (campaign.owner_id === req.user.id) {
    return res.json({ ok: true, campaignId: campaign.id, alreadyMember: true, role: 'owner' });
  }
  db.prepare(
    `INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
     VALUES (?, ?, 'player', ?)
     ON CONFLICT(campaign_id, user_id) DO NOTHING`,
  ).run(campaign.id, req.user.id, now());
  res.json({ ok: true, campaignId: campaign.id });
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
  res.json({ characters: rows.filter((c) => canSee(c, req.user.id)).map(parseCharacter) });
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
    templateId: c.template_id || null,
    visibility: c.visibility || 'public',
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

/* ------------------------------------------------------------------ *
 * Sheet templates
 *
 * A template is just a list of fields plus an optional attribute block, so a
 * GM can describe a sheet for any game system without touching the code. The
 * built-in D&D layout lives in the client and is used when a character has no
 * templateId, so existing characters keep working untouched.
 * ------------------------------------------------------------------ */

const FIELD_TYPES = new Set(['text', 'number', 'textarea']);
const MAX_FIELDS = 40;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;

/** Validate and normalize a template schema coming from the client. */
function normalizeTemplateSchema(raw) {
  const schema = raw && typeof raw === 'object' ? raw : {};
  const fields = Array.isArray(schema.fields) ? schema.fields.slice(0, MAX_FIELDS) : [];
  const seen = new Set();
  const clean = [];
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    const key = String(f.key || '').trim();
    const label = String(f.label || '').trim().slice(0, 60);
    const type = String(f.type || 'text');
    if (!KEY_RE.test(key) || !label) continue;
    if (seen.has(key)) continue; // duplicate keys would fight over the same value
    seen.add(key);
    clean.push({
      key,
      label,
      type: FIELD_TYPES.has(type) ? type : 'text',
      width: f.width === 'tight' ? 'tight' : undefined,
    });
  }
  const attributes = Array.isArray(schema.attributes)
    ? [...new Set(schema.attributes.map((a) => String(a).trim().toUpperCase()).filter((a) => KEY_RE.test(a)))].slice(0, 12)
    : [];
  return { fields: clean, attributes };
}

/** Blank data object matching a schema, so every field has something to show. */
function seedDataFromSchema(schema) {
  const out = {};
  for (const f of schema.fields || []) {
    const value = f.type === 'number' ? 0 : '';
    if (f.key.includes('.')) {
      const [head, ...rest] = f.key.split('.');
      const leaf = rest.pop();
      let cur = out;
      cur[head] = cur[head] && typeof cur[head] === 'object' ? cur[head] : {};
      cur = cur[head];
      for (const part of rest) {
        cur[part] = cur[part] && typeof cur[part] === 'object' ? cur[part] : {};
        cur = cur[part];
      }
      cur[leaf] = value;
    } else {
      out[f.key] = value;
    }
  }
  if ((schema.attributes || []).length) out.attributes = {};
  return out;
}

function parseTemplate(t) {
  return {
    id: t.id,
    campaignId: t.campaign_id,
    ownerId: t.owner_id || null,
    name: t.name,
    schema: safeJson(t.schema),
    visibility: t.visibility || 'public',
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

router.get('/campaigns/:id/templates', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const rows = db
    .prepare('SELECT * FROM sheet_templates WHERE campaign_id = ? ORDER BY name COLLATE NOCASE')
    .all(req.params.id);
  res.json({ templates: rows.filter((t) => canSee(t, req.user.id)).map(parseTemplate) });
});

router.post('/campaigns/:id/templates', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const name = String(body(req).name || '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const schema = normalizeTemplateSchema(body(req).schema);
  const visibility = normVisibility(body(req).visibility);
  const id = nanoid(12);
  const t = now();
  db.prepare(
    `INSERT INTO sheet_templates (id, campaign_id, owner_id, name, schema, visibility, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, req.params.id, req.user.id, name, JSON.stringify(schema), visibility, t, t);
  res.status(201).json({
    template: {
      id,
      campaignId: req.params.id,
      ownerId: req.user.id,
      name,
      schema,
      visibility,
      createdAt: t,
      updatedAt: t,
    },
  });
});

router.patch('/templates/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM sheet_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const { role } = campaignRole(t.campaign_id, req.user.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const patch = body(req);
  const name = patch.name === undefined ? t.name : String(patch.name).trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const schema =
    patch.schema === undefined ? safeJson(t.schema) : normalizeTemplateSchema(patch.schema);
  db.prepare('UPDATE sheet_templates SET name = ?, schema = ?, updated_at = ? WHERE id = ?').run(
    name,
    JSON.stringify(schema),
    now(),
    req.params.id,
  );
  // As with characters, only the owner flips visibility.
  if ('visibility' in patch && t.owner_id === req.user.id) {
    db.prepare('UPDATE sheet_templates SET visibility = ?, updated_at = ? WHERE id = ?').run(
      normVisibility(patch.visibility),
      now(),
      req.params.id,
    );
  }
  res.json({ ok: true });
});

router.delete('/templates/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM sheet_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const { role } = campaignRole(t.campaign_id, req.user.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  // Characters fall back to the built-in sheet; their stored data is kept.
  db.prepare('UPDATE characters SET template_id = NULL WHERE template_id = ?').run(req.params.id);
  db.prepare('DELETE FROM sheet_templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/campaigns/:id/characters', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const { name, kind, data, portraitUrl, templateId } = body(req);
  if (!name) return res.status(400).json({ error: 'name is required' });

  // A character created from a template starts with that template's fields
  // already present, so the sheet renders instead of showing blanks.
  let resolvedTemplateId = null;
  let sheetData = data && typeof data === 'object' ? data : {};
  if (templateId) {
    const tpl = db
      .prepare('SELECT * FROM sheet_templates WHERE id = ? AND campaign_id = ?')
      .get(templateId, req.params.id);
    if (tpl) {
      resolvedTemplateId = tpl.id;
      sheetData = { ...seedDataFromSchema(safeJson(tpl.schema)), ...sheetData };
    }
  }

  const id = nanoid(12);
  const t = now();
  db.prepare(
    `INSERT INTO characters (id, campaign_id, owner_id, name, kind, data, portrait_url, template_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.params.id,
    req.user.id,
    name,
    kind || 'pc',
    JSON.stringify(sheetData),
    portraitUrl || null,
    resolvedTemplateId,
    t,
    t,
  );
  res.status(201).json({ id, templateId: resolvedTemplateId });
});

router.get('/characters/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { role } = c.campaign_id ? campaignRole(c.campaign_id, req.user.id) : { role: null };
  if (c.owner_id !== req.user.id && !role) return res.status(403).json({ error: 'Forbidden' });
  if (!canSee(c, req.user.id)) return res.status(404).json({ error: 'Not found' });
  res.json({ character: parseCharacter(c) });
});

router.patch('/characters/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const { role } = c.campaign_id ? campaignRole(c.campaign_id, req.user.id) : { role: null };
  if (c.owner_id !== req.user.id && !canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  // A private sheet must not be editable by anyone but its owner, or a GM
  // could un-hide it by writing to it.
  if (!canSee(c, req.user.id)) return res.status(403).json({ error: 'Forbidden' });
  const patch = body(req);
  const { name, kind, data, portraitUrl } = patch;
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

  // Switching template keeps the values already entered and backfills whatever
  // the new template adds, so nothing typed is thrown away. `templateId: null`
  // is meaningful here (back to the built-in sheet), so it is not COALESCE'd.
  if ('templateId' in patch) {
    let nextId = null;
    let seed = {};
    if (patch.templateId) {
      const tpl = db.prepare('SELECT * FROM sheet_templates WHERE id = ?').get(patch.templateId);
      if (tpl) {
        nextId = tpl.id;
        seed = seedDataFromSchema(safeJson(tpl.schema));
      }
    }
    // Re-read: the UPDATE above may already have changed the data column.
    const fresh = db.prepare('SELECT data FROM characters WHERE id = ?').get(req.params.id);
    db.prepare('UPDATE characters SET template_id = ?, data = ? WHERE id = ?').run(
      nextId,
      JSON.stringify({ ...seed, ...safeJson(fresh?.data) }),
      req.params.id,
    );
  }

  // Only the owner may flip visibility: otherwise a GM could publish someone's
  // private sheet, or a player could un-hide one they do not own.
  if ('visibility' in patch && c.owner_id === req.user.id) {
    db.prepare('UPDATE characters SET visibility = ?, updated_at = ? WHERE id = ?').run(
      normVisibility(patch.visibility),
      now(),
      req.params.id,
    );
  }
  res.json({ ok: true });
});

router.delete('/characters/:id', auth, (req, res) => {
  const c = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (!canSee(c, req.user.id)) return res.status(404).json({ error: 'Not found' });
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

/** Names of folders in this campaign that the requester must not see. */
function hiddenFolderNames(campaignId, userId) {
  const rows = db
    .prepare('SELECT name, owner_id, visibility FROM asset_folders WHERE campaign_id = ?')
    .all(campaignId);
  return new Set(rows.filter((f) => !canSee(f, userId)).map((f) => f.name));
}

/** An asset is listable if it is visible AND not filed in a hidden folder. */
function canListAsset(a, userId, hidden) {
  return canSee(a, userId) && !(a.folder && hidden.has(a.folder));
}

router.get('/campaigns/:id/assets', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const rows = db.prepare('SELECT * FROM assets WHERE campaign_id = ? ORDER BY created_at DESC').all(req.params.id);
  const hidden = hiddenFolderNames(req.params.id, req.user.id);
  res.json({
    assets: rows.filter((a) => canListAsset(a, req.user.id, hidden)).map((a) => ({
      id: a.id,
      campaignId: a.campaign_id,
      ownerId: a.owner_id,
      name: a.name,
      mime: a.mime,
      kind: a.kind,
      folder: a.folder || '',
      url: a.url,
      visibility: a.visibility || 'public',
      createdAt: a.created_at,
    })),
  });
});

/* ------------------------------------------------------------------ *
 * Asset folders
 *
 * Folders are their own table so an empty folder can exist; assets keep
 * pointing at a folder by name (assets.folder), so a rename has to update
 * both sides.
 * ------------------------------------------------------------------ */

const FOLDER_MAX = 60;

function cleanFolderName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return null;
  if (name.length > FOLDER_MAX) return null;
  if (/[\\/:*?"<>|]/.test(name)) return null;
  return name;
}

router.get('/campaigns/:id/folders', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const rows = db
    .prepare('SELECT * FROM asset_folders WHERE campaign_id = ? ORDER BY name COLLATE NOCASE')
    .all(req.params.id);
  res.json({
    folders: rows
      .filter((f) => canSee(f, req.user.id))
      .map((f) => ({
        id: f.id,
        campaignId: f.campaign_id,
        ownerId: f.owner_id,
        name: f.name,
        visibility: f.visibility || 'public',
      })),
  });
});

router.post('/campaigns/:id/folders', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const name = cleanFolderName(body(req).name);
  if (!name) return res.status(400).json({ error: 'Nombre de carpeta no válido' });
  const visibility = normVisibility(body(req).visibility);
  const id = nanoid();
  try {
    db.prepare(
      'INSERT INTO asset_folders (id, campaign_id, owner_id, name, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, req.params.id, req.user.id, name, visibility, now());
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
    }
    throw e;
  }
  res.json({
    ok: true,
    folder: { id, campaignId: req.params.id, ownerId: req.user.id, name, visibility },
  });
});

router.patch('/folders/:id', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM asset_folders WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  if (!canSee(f, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { role } = campaignRole(f.campaign_id, req.user.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  const patch = body(req);
  const name = cleanFolderName(patch.name);
  if (!name) return res.status(400).json({ error: 'Nombre de carpeta no válido' });
  if (name === f.name && !('visibility' in patch)) return res.json({ ok: true });
  try {
    db.prepare('UPDATE asset_folders SET name = ? WHERE id = ?').run(name, req.params.id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una carpeta con ese nombre' });
    }
    throw e;
  }
  // Assets reference folders by name, so follow the rename.
  db.prepare('UPDATE assets SET folder = ? WHERE campaign_id = ? AND folder = ?').run(
    name,
    f.campaign_id,
    f.name,
  );
  // Only the owner flips visibility.
  if ('visibility' in patch && f.owner_id === req.user.id) {
    db.prepare('UPDATE asset_folders SET visibility = ? WHERE id = ?').run(
      normVisibility(patch.visibility),
      req.params.id,
    );
  }
  res.json({ ok: true });
});

router.delete('/folders/:id', auth, (req, res) => {
  const f = db.prepare('SELECT * FROM asset_folders WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  if (!canSee(f, req.user.id)) return res.status(404).json({ error: 'Not found' });
  const { role } = campaignRole(f.campaign_id, req.user.id);
  if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  // Like a file manager: deleting a folder moves its contents to the root
  // instead of destroying the assets.
  db.prepare('UPDATE assets SET folder = ? WHERE campaign_id = ? AND folder = ?').run(
    '',
    f.campaign_id,
    f.name,
  );
  db.prepare('DELETE FROM asset_folders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Move an asset to a folder (or clear it).
router.patch('/assets/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (!canSee(a, req.user.id)) return res.status(404).json({ error: 'Not found' });
  if (a.owner_id !== req.user.id) {
    const { role } = a.campaign_id ? campaignRole(a.campaign_id, req.user.id) : { role: null };
    if (!canEdit(role)) return res.status(403).json({ error: 'Forbidden' });
  }
  const patch = body(req);
  const { folder, name, kind } = patch;
  db.prepare(
    `UPDATE assets SET folder = COALESCE(?, folder), name = COALESCE(?, name), kind = COALESCE(?, kind)
     WHERE id = ?`,
  ).run(folder ?? null, name ?? null, kind ?? null, req.params.id);
  // Only the owner flips visibility.
  if ('visibility' in patch && a.owner_id === req.user.id) {
    db.prepare('UPDATE assets SET visibility = ? WHERE id = ?').run(
      normVisibility(patch.visibility),
      req.params.id,
    );
  }
  res.json({ ok: true });
});

// Download all campaign assets as a ZIP (optionally a single folder).
router.get('/campaigns/:id/assets.zip', auth, (req, res) => {
  const { role } = campaignRole(req.params.id, req.user.id);
  if (!role) return res.status(404).json({ error: 'Not found' });
  const folder = req.query.folder != null ? String(req.query.folder) : null;
  const rows = db
    .prepare(
      folder === null
        ? 'SELECT * FROM assets WHERE campaign_id = ? ORDER BY folder, created_at'
        : 'SELECT * FROM assets WHERE campaign_id = ? AND folder = ? ORDER BY created_at',
    )
    .all(...(folder === null ? [req.params.id] : [req.params.id, folder]));

  // Same filtering as the listing, otherwise the ZIP becomes a way to
  // download private assets by skipping the UI entirely.
  const hidden = hiddenFolderNames(req.params.id, req.user.id);
  const downloadable = rows.filter((a) => canListAsset(a, req.user.id, hidden));
  if (downloadable.length === 0) {
    return res.status(404).json({ error: 'No hay recursos que descargar' });
  }

  res.attachment(`recursos-${req.params.id}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => res.status(500).end());
  archive.pipe(res);
  for (const a of downloadable) {
    const filePath = path.join(UPLOAD_DIR, path.basename(a.url));
    if (fs.existsSync(filePath)) {
      const prefix = a.folder ? `${a.folder}/` : '';
      archive.file(filePath, { name: `${prefix}${a.name}` });
    }
  }
  archive.finalize();
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
  const { campaignId, name, kind, mime, folder } = body(req);
  const visibility = normVisibility(body(req).visibility);
  let assetId = null;
  if (campaignId) {
    const { role } = campaignRole(campaignId, req.user.id);
    if (role) {
      assetId = nanoid(12);
      db.prepare(
        `INSERT INTO assets (id, campaign_id, owner_id, name, mime, kind, folder, url, visibility, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        assetId,
        campaignId,
        req.user.id,
        name || req.file.originalname,
        mime || req.file.mimetype,
        kind || 'image',
        folder || '',
        url,
        visibility,
        now(),
      );
    }
  }
  res.status(201).json({ url, id: assetId });
});

router.delete('/assets/:id', auth, (req, res) => {
  const a = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  if (!canSee(a, req.user.id)) return res.status(404).json({ error: 'Not found' });
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
