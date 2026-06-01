# demo-build — design spec

**Date:** 2026-06-01  
**Status:** approved

## Goal

`make demo-build` — one command that produces a GitHub Pages landing page with real screenshots of the running app.

## Flow

```
1. node scripts/demo-seed.mjs          # create demo.db (no server needed)
2. docker compose -f docker-compose.demo.yml up -d
3. curl-loop → /health (max 30s)
4. node scripts/demo-screenshots.mjs  # Playwright → docs/screenshots/*.png
5. docker compose -f docker-compose.demo.yml down
6. node scripts/demo-html.mjs         # build docs/index.html
7. git push origin `git subtree split --prefix docs`:gh-pages --force
```

## Files created

```
scripts/
  demo-build.sh          # orchestrator
  demo-seed.mjs          # writes demo.db directly via better-sqlite3
  demo-screenshots.mjs   # Playwright login → screenshot each page
  demo-html.mjs          # generates docs/index.html

docs/
  index.html             # GitHub Pages root (generated)
  screenshots/           # PNG files (generated, gitignored)

docker-compose.demo.yml  # override: mounts demo.db, sets demo password
.env.demo                # ADMIN_PASSWORD=demo, DATA_DIR=./backend/data/demo
```

### .gitignore additions

```
backend/data/demo.db
docs/screenshots/
```

## Seed data

Clears all existing data, creates:

- **3 projects:** `tempo`, `client-work`, `personal`
- **~12 days of entries:** 5–7h/day across projects
- **Active timer:** started ~45 min ago on `tempo`
- **GitHub events:** 3 pr_created, 2 pr_reviewed, 1 pr_merged

## Screenshots

| File | Route | State |
|---|---|---|
| `01-timer.png` | `/` | timer running, today's entries below |
| `02-entries.png` | `/entries` | entries list for the week |
| `03-dashboard.png` | `/dashboard` | week stats, ASCII bars |
| `04-settings.png` | `/settings` | projects list |

Viewport: 1280×800, desktop.

## HTML landing page

Style matches the app: IBM Plex Mono, black/white, minimal.

Structure:
- Header: `tempo` + tagline
- Stack line: Node.js · Fastify · React · SQLite · Docker
- 2×2 screenshot grid with captions
- Quick start code block (cp .env.example, make prod)
- Link to github.com/maplemap/tempo

## gh-pages deployment

```bash
git push origin `git subtree split --prefix docs HEAD`:gh-pages --force
```

Pushes only `docs/` to the `gh-pages` branch. One-time manual step: enable GitHub Pages in repo Settings → Pages → Source: `gh-pages`, `/ (root)`.

## Makefile target

```makefile
demo-build: ## Build demo screenshots and deploy to GitHub Pages
	bash scripts/demo-build.sh
```

## Constraints

- Playwright installed as devDependency (`@playwright/test` + `playwright`)
- `better-sqlite3` lives in `backend/node_modules` — seed script runs with `node --input-type=module` from `backend/` dir, or imports via relative path `backend/node_modules/better-sqlite3`
- Docker must be running locally
- Port 3000 must be free during demo-build (demo container uses it)
