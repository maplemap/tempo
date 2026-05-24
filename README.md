# Tempo

Personal time tracker with GitHub verification overlay.

Time tracking is the primary, authoritative record. GitHub events (PRs created, reviews submitted, PRs merged to main) are pulled in the background to verify and contextualize the picture you describe manually. A merged PR counts as a closed task — same workflow signal, no extra integration.

## Stack
- Node.js + Fastify (backend)
- React + Vite (frontend)
- SQLite (single-file database)
- Docker (one container, single `docker compose up -d`)

## Quick start

```bash
cp .env.example .env
# edit .env: set ADMIN_PASSWORD, JWT_SECRET
make prod
```

Open http://localhost:$PORT (default 3000).

## Make targets

| Target | What it does |
|---|---|
| `make help` | Show this list |
| `make run` | Dev mode in Docker (hot reload via volume mount, exposes Vite on 5173) |
| `make prod` | Production mode (single container, frontend built into backend) |
| `make stop` | Stop all containers |
| `make logs` | Tail container logs |
| `make update` | `git pull` + restart in prod |
| `make install` | Install deps locally (for non-Docker dev) |

## Local development without Docker

```bash
make install
npm run dev    # runs backend + frontend concurrently
```

Open `http://localhost:$PORT` — backend proxies non-API requests to Vite (with HMR over WebSocket on the same port).

## Configuration

| Env var | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Login password (required) |
| `JWT_SECRET` | Token signing secret (required) |
| `PORT` | Backend port, default 3000 |
| `DATA_DIR` | SQLite file location, default `./data` |
| `GITHUB_TOKEN` | Personal access token for GitHub sync |
| `GITHUB_BASE_BRANCH` | Branch counted as "merged" for tasks-done metric, default `main` |
| `SYNC_INTERVAL_MINUTES` | Sync cron interval, default 15 |
| `BACKFILL_DAYS` | Initial sync backfill window, default 30 |
