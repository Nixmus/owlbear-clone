# Owlbear Clone

A full-featured **virtual tabletop (VTT)** for tabletop RPGs, inspired by
[Owlbear Rodeo](https://www.owlbear.rodeo/). Built with **React + Vite +
TypeScript** on the frontend and **Node + WebSocket + SQLite** on the backend.

## Two areas

1. **Hub** (account area) — sign up / log in, manage **campaigns**, **members**,
   **characters & sheets**, **assets** (maps, tokens, audio…) and the **session
   history**.
2. **Table** (the VTT) — the live battle map everyone shares in real time.

Open the hub by visiting `/` (login required). Enter a table with
`/?room=<campaignId>` or with the **Quick play** button (no account needed).

## Features

### Table / VTT
- 🗺️ **Multiple scenes** with per-scene background maps
- 🧙 **Tokens**: colored discs or images, drag & drop, resize, hide, lock, conditions, owners
- 🧱 **Layers**: map, tokens, drawings, fog of war
- 🌫️ **Fog of war** with reveal / re-cover brush
- 📏 **Measurement ruler** with grid-aware distance (5 ft per cell)
- ✏️ **Drawing tools**: freehand pen, line, rectangle, circle
- 🎲 **Dice roller** (`/r 2d6+3`) with results logged to chat
- 💬 **Chat** synced across all connected players
- 🟢 **Presence & live cursors**, square/hex grid, pan & zoom

### Accounts & campaigns (persistent)
- 🔐 **User profiles** with scrypt-hashed passwords and HMAC-signed tokens
- 🎲 **Campaigns** with GM/player/observer roles and member management
- 🎭 **Character sheets** (D&D-style: HP, AC, attributes, skills, inventory, spells, notes)
- 🖼️ **Asset library** with file uploads (images, maps, tokens, audio, docs)
- 📜 **Session history** with notes and an automatically recorded chat log / snapshot

All state is persisted to **SQLite** (`better-sqlite3`) — no external database
needed to get started. Swap in PostgreSQL later if you need to scale.

## Project layout

```
owlbear-clone/
├── Dockerfile              # multi-stage build (client -> server runtime)
├── docker-compose.yml
├── server/
│   ├── index.js            # HTTP + WebSocket + room state
│   ├── api.js              # REST API (auth, campaigns, characters, assets, sessions)
│   ├── db.js               # SQLite schema
│   ├── auth.js             # password hashing + tokens
│   └── data/               # SQLite DB + uploads (gitignored, Docker volume)
└── client/
    └── src/
        ├── components/     # Table UI (Board, panels, chat…)
        ├── components/hub/ # Campaign/character/asset/session managers
        ├── api.ts          # REST client
        ├── auth.ts         # session store
        └── store.ts        # realtime VTT state (WebSocket)
```

## Local development

Requires **Node 20+**.

```bash
npm run install:all   # root + server + client dependencies
npm run dev           # server → :4000, client → :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and
`/uploads` to the backend and connects the WebSocket directly to `:4000`.

## Deployment

### Option A — Docker (recommended)

Yes, Docker is the most efficient way to ship this: the `Dockerfile` builds the
client and serves it (plus the API and WebSocket) from a single small image.
For a public, always-on server with HTTPS, see **[DEPLOY.md](./DEPLOY.md)**.
On Microsoft Azure, see **[azure/DEPLOY-AZURE.md](./azure/DEPLOY-AZURE.md)**.

```bash
docker compose up -d --build
# → app on http://localhost:4000 (or https://your-domain via the bundled Caddy)
```

Data (SQLite DB + uploads) persists in the `owlbear-data` volume.

Edit `docker-compose.yml` to set `JWT_SECRET` and adjust `PORT`. To use
PostgreSQL instead, uncomment the `db` service and `DATABASE_URL`.

### Option B — Node + PM2 (no Docker)

```bash
npm run install:all
npm run build          # builds client into client/dist
NODE_ENV=production PORT=4000 JWT_SECRET=change-me npm start
```

Put Nginx/Caddy in front for HTTPS (WebSockets need the `Upgrade`/`Connection`
headers proxied).

### Option C — static + managed backend

`client/dist` is a static bundle you can host on Netlify/Vercel/Cloudflare
Pages; deploy `server/` to Render/Fly/Railway and point the client at it via the
Vite proxy or a reverse proxy. Keep the WebSocket endpoint on the same origin.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | HTTP + WebSocket port |
| `JWT_SECRET` | dev value | **Change in production** — signs auth tokens |
| `DATABASE_FILE` | `server/data/owlbear.db` | SQLite file path |

## Controls

| Action | Control |
| --- | --- |
| Pan | Middle-drag, Space+drag, or Pan tool |
| Zoom | Mouse wheel |
| Move token | Select tool + drag (Shift = snap to grid) |
| Measure | Ruler tool + drag |
| Reveal fog | Fog tool + drag |
| Re-cover fog | Hide tool + drag |
| Draw | Pen / Line / Rect / Circle tools |
| Roll dice | `/r 2d6+3` in chat |
