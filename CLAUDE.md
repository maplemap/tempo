# Tempo — CLAUDE.md

Personal time tracker with GitHub sync overlay. Time entries are the primary record; GitHub events (PRs created, reviewed, merged) are pulled in the background to verify and contextualize the picture.

## Stack

- **Backend**: Node.js (ESM), Fastify 4, better-sqlite3, node-cron, undici
- **Frontend**: React 18, Vite, React Router 6 — plain JSX, no TypeScript
- **DB**: SQLite at `backend/data/tempo.db`
- **Auth**: single-user, password from `ADMIN_PASSWORD` env var, JWT via httpOnly cookie (`tempo_session`, 90d)
- **Deploy**: Docker (one container), `make prod`

## Project structure

```
backend/
  src/
    server.js          # Fastify entry, route registration, cron schedule
    lib/
      env.js           # all env vars parsed here — add new vars here first
      auth.js          # JWT sign/verify, cookie helpers, requireAuth hook
      sync/
        github.js      # GitHub Search API sync logic
    db/
      index.js         # DB init, schema apply, inline ALTER TABLE migrations
      schema.sql       # table definitions (do not add migrations here)
    routes/
      auth.js          # POST /api/auth/login, /logout
      timer.js         # active timer (start/stop/get)
      entries.js       # time entries CRUD
      projects.js      # projects CRUD (name, archived, github_repo, github_base_branch)
      stats.js         # aggregated stats
      sync.js          # POST /api/sync/run, GET /api/sync/state
      github.js        # GET /api/github/repos (repo list for UI)
frontend/
  src/
    pages/
      LoginPage.jsx
      TimerPage.jsx
      EntriesPage.jsx
      DashboardPage.jsx
      SettingsPage.jsx  # project settings, GitHub sync controls
    components/
      EntryRow.jsx / EntryItem.jsx / AsciiBar.jsx / Nav.jsx
    App.jsx
    main.jsx
```

## Development

```bash
# local (no Docker)
make install
npm run dev        # starts backend + frontend concurrently via concurrently

# Docker dev (hot reload)
make run

# Docker prod
make prod
```

Backend: `http://localhost:PORT` (default 3001 in `.env`, 3000 in `.env.example`)
Frontend dev: Vite on `:5173`, proxied through backend at the same port

## Database

SQLite file lives at `backend/data/tempo.db` always:
- **Docker**: `Dockerfile` sets `ENV DATA_DIR=/app/data`, volume `./backend/data:/app/data`
- **Local**: `env.js` fallback resolves `backend/src/lib/../../data` → `backend/data`

**Schema migrations** go as inline `ALTER TABLE` statements in `backend/src/db/index.js` (wrapped in `try/catch` so they're idempotent). Never modify `schema.sql` for migrations — only for new tables.

```js
// example migration pattern
try { db.exec(`ALTER TABLE projects ADD COLUMN new_col TEXT`); } catch {}
```

## GitHub sync

Configured per-project via `github_repo` and `github_base_branch` (defaults to `main`).

`syncGitHub()` in `backend/src/lib/sync/github.js`:
1. Fetches all PRs created/reviewed by the authenticated user
2. For merged PRs — queries per unique `github_base_branch` across all projects that have `github_repo` set
3. Saves results into `external_events` table (`source='github'`, `event_type` one of `pr_created | pr_reviewed | pr_merged`)
4. Runs on cron every `SYNC_INTERVAL_MINUTES` minutes (only if `GITHUB_TOKEN` is set)

## API conventions

- All routes under `/api/*` require auth (`requireAuth` hook) except `/api/auth/login`
- Auth errors → 401
- Validation errors → 400
- Not found → 404
- No request body validation library — manual checks in route handlers

## Environment variables

All parsed in `backend/src/lib/env.js`. Required vars throw on startup if missing.

| Var | Required | Default | Purpose |
|---|---|---|---|
| `ADMIN_PASSWORD` | yes | — | Login password |
| `JWT_SECRET` | yes | — | Token signing secret |
| `PORT` | no | 3000 | Backend port |
| `SECURE_COOKIE` | no | `false` | Set `true` behind HTTPS |
| `GITHUB_TOKEN` | no | — | PAT with `repo` scope; sync disabled if absent |
| `SYNC_INTERVAL_MINUTES` | no | 15 | GitHub sync cron interval |
| `BACKFILL_DAYS` | no | 30 | How many days back to fetch on first sync |

## Key conventions

- **No TypeScript** — all source files are `.js` / `.jsx`
- **No test suite** — verify changes manually or via the running app
- **No ORM** — raw `better-sqlite3` prepared statements
- **Frontend API calls** go through `frontend/src/lib/api.js`
- `github_base_branch` per project defaults to `main` — only set it when the project's main branch differs
