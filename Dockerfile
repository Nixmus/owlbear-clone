# syntax=docker/dockerfile:1

# ---------- Stage 1: build the client ----------
FROM node:20-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---------- Stage 2: runtime (API + WS + static client) ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Build tools are needed only if better-sqlite3 has no prebuilt binary.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

COPY server/ ./
COPY --from=client-build /app/client/dist ./client/dist

# Persistent data (rooms, uploads, SQLite DB)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 4000
CMD ["node", "index.js"]
