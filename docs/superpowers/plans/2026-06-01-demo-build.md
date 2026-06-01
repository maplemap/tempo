# demo-build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `make demo-build` seeds a demo SQLite DB, starts a Docker container, captures Playwright screenshots, generates a static HTML landing page, and force-pushes it to the `gh-pages` branch.

**Architecture:** Shell orchestrator (`scripts/demo-build.sh`) sequences: seed → docker up → health-wait → screenshot → docker down → html-gen → gh-pages push. Each step is a standalone Node.js ESM script. Docker compose override provides isolated demo DB and credentials without touching the production `.env`.

**Tech Stack:** Node.js 20 ESM, `playwright` (browser automation), `better-sqlite3` (direct DB writes for seed), Docker Compose v2, bash

---

### Task 1: Install Playwright and update .gitignore

**Files:**
- Modify: `package.json` (root)
- Modify: `.gitignore`

- [ ] **Step 1: Install playwright devDependency at project root**

```bash
npm install -D playwright
```

Expected output: `added N packages` with `playwright` listed.

- [ ] **Step 2: Install Chromium browser binary**

```bash
npx playwright install chromium
```

Expected output: `Downloading Chromium...` then `chromium ... DONE`.

- [ ] **Step 3: Add generated files to .gitignore**

Open `.gitignore` and append:

```
backend/data/demo.db
backend/data/demo/
docs/screenshots/
docs/index.html
```

- [ ] **Step 4: Verify playwright import works**

```bash
node -e "import('playwright').then(m => console.log('ok', Object.keys(m)))"
```

Expected: `ok [ 'chromium', 'firefox', 'webkit', ... ]`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add playwright dev dependency"
```

---

### Task 2: Create `.env.demo` and `docker-compose.demo.yml`

**Files:**
- Create: `.env.demo`
- Create: `docker-compose.demo.yml`

- [ ] **Step 1: Create `.env.demo`**

```
ADMIN_PASSWORD=demo
JWT_SECRET=demo-jwt-secret-not-for-production
PORT=3000
SECURE_COOKIE=false
```

- [ ] **Step 2: Create `docker-compose.demo.yml`**

```yaml
services:
  app:
    build: .
    container_name: tempo-demo
    ports:
      - "3000:3000"
    env_file:
      - .env.demo
    volumes:
      - ./backend/data/demo:/app/data
```

This is a standalone compose file (not an override) — it builds the same image but mounts the demo DB directory and uses demo credentials. The `DATA_DIR` is already set to `/app/data` in the Dockerfile, so it reads from the mounted demo volume.

- [ ] **Step 3: Commit**

```bash
git add .env.demo docker-compose.demo.yml
git commit -m "chore: add demo docker-compose and env"
```

---

### Task 3: Create `scripts/demo-seed.mjs`

Creates `backend/data/demo/tempo.db` with realistic seed data. Deletes any existing demo DB first. Uses `better-sqlite3` from `backend/node_modules` via `NODE_PATH` (set by the shell orchestrator).

**Files:**
- Create: `scripts/demo-seed.mjs`

- [ ] **Step 1: Create the seed script**

```js
// scripts/demo-seed.mjs
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.join(__dirname, '..', 'backend', 'data', 'demo');
const SCHEMA_PATH = path.join(__dirname, '..', 'backend', 'src', 'db', 'schema.sql');
const DB_PATH = path.join(DEMO_DIR, 'tempo.db');

fs.mkdirSync(DEMO_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = DELETE');
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

// Migrations (idempotent — same pattern as backend/src/db/index.ts)
try { db.exec(`ALTER TABLE projects ADD COLUMN github_repo TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN github_base_branch TEXT`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN task_id INTEGER`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'task'`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category_manual INTEGER NOT NULL DEFAULT 0`); } catch {}

// ── Projects ─────────────────────────────────────────────────────────────────
const insertProject = db.prepare(`INSERT INTO projects (name, archived) VALUES (?, 0)`);
const p1 = insertProject.run('tempo').lastInsertRowid;
const p2 = insertProject.run('client-work').lastInsertRowid;
const p3 = insertProject.run('personal').lastInsertRowid;

// ── Helpers ───────────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const now = new Date();

function makeEntry(daysAgo, startH, startM, endH, endM) {
  const base = new Date(now);
  base.setDate(base.getDate() - daysAgo);
  const s = new Date(base); s.setHours(startH, startM, 0, 0);
  const e = new Date(base); e.setHours(endH,   endM,   0, 0);
  return { started_at: iso(s), ended_at: iso(e), dur: Math.round((e - s) / 1000) };
}

// ── Time entries: 12 days ─────────────────────────────────────────────────────
const insertEntry = db.prepare(`
  INSERT INTO time_entries (project_id, description, started_at, ended_at, duration_seconds, category)
  VALUES (?, ?, ?, ?, ?, 'task')
`);

const rows = [
  // today (dayOffset=0) — partial; rest is active timer
  [p2, 'api integration review',          0,  9, 0,  11, 30],
  [p1, 'refactor db schema',              0, 12, 0,  13,  0],
  [p3, 'reading',                         0, 14, 0,  15, 30],
  // day 1
  [p2, 'dashboard design',               1,  9, 30, 12,  0],
  [p1, 'add github sync',                1, 13,  0, 15,  0],
  [p2, 'code review',                    1, 16,  0, 18,  0],
  // day 2
  [p1, 'fix timer reset bug',            2,  9,  0, 11,  0],
  [p3, 'workout log',                    2, 11, 30, 12, 30],
  [p2, 'mobile layout fixes',           2, 14,  0, 17, 30],
  // day 3
  [p2, 'backend api refactor',           3,  8, 30, 12,  0],
  [p1, 'entry list pagination',          3, 13,  0, 15, 30],
  [p3, 'book notes',                     3, 16,  0, 17,  0],
  // day 4
  [p2, 'integration testing',           4,  9,  0, 12,  0],
  [p1, 'plans widget styling',           4, 13, 30, 16,  0],
  // day 5
  [p1, 'fix export bug',                5,  9,  0, 10, 30],
  [p2, 'client call prep',               5, 11,  0, 12,  0],
  [p2, 'feature spec writing',           5, 13,  0, 16, 30],
  [p3, 'open source contributions',      5, 17,  0, 18,  0],
  // day 6
  [p2, 'auth flow redesign',             6,  9,  0, 12,  0],
  [p1, 'add category filter',            6, 13,  0, 15,  0],
  [p3, 'side project research',          6, 15, 30, 17,  0],
  // day 7
  [p2, 'database optimization',         7,  8, 30, 11,  0],
  [p1, 'improve sync reliability',       7, 12,  0, 14,  0],
  [p2, 'deploy staging env',             7, 15,  0, 17, 30],
  // day 8
  [p2, 'code review sessions',          8,  9,  0, 12,  0],
  [p3, 'personal finance tracker',       8, 13,  0, 14,  0],
  [p1, 'ui polish pass',                8, 15,  0, 17,  0],
  // day 9
  [p2, 'release preparation',            9,  9,  0, 12, 30],
  [p1, 'add keyboard shortcuts',         9, 13,  0, 15,  0],
  [p2, 'post-release monitoring',        9, 16,  0, 17, 30],
  // day 10
  [p1, 'dependency updates',            10,  9,  0, 10,  0],
  [p2, 'q4 roadmap planning',           10, 10, 30, 13,  0],
  [p3, 'journaling app prototype',      10, 14,  0, 16,  0],
  [p2, 'client review call',            10, 16, 30, 18,  0],
  // day 11
  [p2, 'onboarding flow fixes',         11,  9,  0, 12,  0],
  [p1, 'sqlite migration script',       11, 13,  0, 15,  0],
  [p3, 'open source pr review',         11, 15, 30, 17,  0],
];

for (const [projId, desc, daysAgo, sH, sM, eH, eM] of rows) {
  const { started_at, ended_at, dur } = makeEntry(daysAgo, sH, sM, eH, eM);
  insertEntry.run(projId, desc, started_at, ended_at, dur);
}

// ── Active timer (45 min ago, project tempo) ──────────────────────────────────
const timerStart = new Date(now.getTime() - 45 * 60 * 1000);
db.prepare(`
  INSERT INTO time_entries (project_id, description, started_at, category)
  VALUES (?, ?, ?, 'task')
`).run(p1, 'implementing demo-build script', iso(timerStart));

// ── GitHub events ─────────────────────────────────────────────────────────────
const insertEvent = db.prepare(`
  INSERT INTO external_events (source, event_type, ref_id, ref_url, title, repo_or_board, occurred_at)
  VALUES ('github', ?, ?, ?, ?, 'maplemap/tempo', ?)
`);

const da = (n) => iso(new Date(now.getTime() - n * 24 * 60 * 60 * 1000));

insertEvent.run('pr_created', 'PR-101', 'https://github.com/maplemap/tempo/pull/101',
  'feat: add timer pause functionality', da(11));
insertEvent.run('pr_created', 'PR-98',  'https://github.com/maplemap/tempo/pull/98',
  'refactor: move github sync to background worker', da(8));
insertEvent.run('pr_created', 'PR-95',  'https://github.com/maplemap/tempo/pull/95',
  'fix: handle duplicate time entries on sync', da(5));
insertEvent.run('pr_reviewed', 'review-97', 'https://github.com/maplemap/tempo/pull/97',
  'feat: add csv export', da(9));
insertEvent.run('pr_reviewed', 'review-100', 'https://github.com/maplemap/tempo/pull/100',
  'fix: dashboard date range off by one', da(6));
insertEvent.run('pr_merged', 'merge-101', 'https://github.com/maplemap/tempo/pull/101',
  'feat: add timer pause functionality', da(3));

db.close();
console.log('Seeded:', DB_PATH);
```

- [ ] **Step 2: Test seed script manually**

```bash
NODE_PATH=./backend/node_modules node scripts/demo-seed.mjs
```

Expected:
```
Seeded: /…/backend/data/demo/tempo.db
```

- [ ] **Step 3: Verify DB contents**

```bash
cd backend && node -e "
  import('better-sqlite3').then(({ default: Database }) => {
    const db = new Database('data/demo/tempo.db');
    console.log('projects:', db.prepare('SELECT name FROM projects').all());
    console.log('entries:', db.prepare('SELECT COUNT(*) as n FROM time_entries').get());
    console.log('events:', db.prepare('SELECT COUNT(*) as n FROM external_events').get());
    db.close();
  });
"
```

Expected:
```
projects: [ { name: 'tempo' }, { name: 'client-work' }, { name: 'personal' } ]
entries: { n: 38 }
events: { n: 6 }
```

- [ ] **Step 4: Commit**

```bash
git add scripts/demo-seed.mjs
git commit -m "feat: add demo seed script"
```

---

### Task 4: Create `scripts/demo-screenshots.mjs`

Starts Playwright Chromium, logs in with demo credentials, navigates to 4 pages, saves PNGs to `docs/screenshots/`.

**Files:**
- Create: `scripts/demo-screenshots.mjs`

- [ ] **Step 1: Create the screenshot script**

```js
// scripts/demo-screenshots.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');
const BASE_URL = 'http://localhost:3000';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

// Login
await page.goto(`${BASE_URL}/login`);
await page.fill('input[type="password"]', 'demo');
await page.click('button[type="submit"]');
await page.waitForURL(url => !url.includes('login'), { timeout: 10_000 });

async function shoot(route, filename) {
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle');
  // Let React settle any pending renders
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT_DIR, filename), fullPage: false });
  console.log('screenshot:', filename);
}

await shoot('/',          '01-timer.png');
await shoot('/entries',   '02-entries.png');
await shoot('/dashboard', '03-dashboard.png');
await shoot('/settings',  '04-settings.png');

await browser.close();
console.log('Screenshots saved to docs/screenshots/');
```

- [ ] **Step 2: Commit**

```bash
git add scripts/demo-screenshots.mjs
git commit -m "feat: add demo screenshot script"
```

---

### Task 5: Create `scripts/demo-html.mjs`

Generates `docs/index.html` — a minimal IBM Plex Mono landing page with the 4 screenshots.

**Files:**
- Create: `scripts/demo-html.mjs`

- [ ] **Step 1: Create the HTML generator**

```js
// scripts/demo-html.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, '..', 'docs');

const screenshots = [
  { file: 'screenshots/01-timer.png',     caption: 'timer — track time with a running clock' },
  { file: 'screenshots/03-dashboard.png', caption: 'dashboard — weekly stats with ascii bars' },
  { file: 'screenshots/02-entries.png',   caption: 'entries — full log with project breakdown' },
  { file: 'screenshots/04-settings.png',  caption: 'settings — projects and github sync config' },
];

const figures = screenshots.map(({ file, caption }) => `
    <figure>
      <img src="${file}" alt="${caption}">
      <figcaption>${caption}</figcaption>
    </figure>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tempo — personal time tracker</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 14px;
      line-height: 1.5;
      background: #fff;
      color: #000;
      padding: 48px 24px 80px;
      max-width: 960px;
      margin: 0 auto;
    }
    h1 { font-size: 22px; font-weight: 500; letter-spacing: -0.5px; }
    .tagline { color: #888; margin-top: 6px; }
    .stack { margin-top: 20px; color: #888; font-size: 13px; }
    .screenshots {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 40px;
    }
    figure { border: 1px solid #000; }
    figure img { width: 100%; display: block; }
    figcaption {
      padding: 8px 12px;
      border-top: 1px solid #000;
      font-size: 12px;
      color: #888;
    }
    .quickstart { margin-top: 48px; }
    .quickstart h2 { font-size: 13px; font-weight: 500; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
    pre {
      border: 1px solid #000;
      padding: 16px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.7;
      overflow-x: auto;
    }
    .link { margin-top: 32px; }
    .link a { color: #000; text-decoration: underline; text-underline-offset: 3px; }
    @media (max-width: 640px) {
      .screenshots { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <h1>tempo</h1>
  <p class="tagline">personal time tracker with github verification overlay</p>
  <p class="stack">Node.js · Fastify · React · SQLite · Docker</p>

  <div class="screenshots">${figures}
  </div>

  <div class="quickstart">
    <h2>Quick start</h2>
    <pre>cp .env.example .env
# set ADMIN_PASSWORD and JWT_SECRET
make prod</pre>
  </div>

  <p class="link"><a href="https://github.com/maplemap/tempo">→ github.com/maplemap/tempo</a></p>
</body>
</html>
`;

fs.writeFileSync(path.join(DOCS_DIR, 'index.html'), html, 'utf8');
console.log('Generated docs/index.html');
```

- [ ] **Step 2: Commit**

```bash
git add scripts/demo-html.mjs
git commit -m "feat: add demo HTML generator"
```

---

### Task 6: Create `scripts/demo-build.sh`

Main orchestrator. Sequences seed → docker up → health-wait → screenshots → docker down → html gen → gh-pages push.

**Files:**
- Create: `scripts/demo-build.sh`

- [ ] **Step 1: Create the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[demo-build]${NC} $1"; }
fail() { echo -e "${RED}[demo-build] ERROR:${NC} $1"; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || fail "Docker not found"
docker info >/dev/null 2>&1       || fail "Docker daemon not running"

if lsof -i :3000 -t >/dev/null 2>&1; then
  fail "Port 3000 is in use. Stop any running services first (make stop)."
fi

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup() {
  log "Stopping demo container..."
  docker compose -f docker-compose.demo.yml down --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# ── 1. Seed demo database ─────────────────────────────────────────────────────
log "Seeding demo database..."
NODE_PATH="$REPO_ROOT/backend/node_modules" node "$REPO_ROOT/scripts/demo-seed.mjs"

# ── 2. Start demo container ───────────────────────────────────────────────────
log "Building and starting demo container..."
docker compose -f docker-compose.demo.yml up --build -d

# ── 3. Wait for health ────────────────────────────────────────────────────────
log "Waiting for app to be ready (max 30s)..."
MAX_WAIT=30; elapsed=0
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do
  [ $elapsed -ge $MAX_WAIT ] && fail "App did not start within ${MAX_WAIT}s"
  sleep 1; elapsed=$((elapsed + 1))
done
log "App ready in ${elapsed}s"

# ── 4. Take screenshots ───────────────────────────────────────────────────────
log "Taking screenshots..."
mkdir -p "$REPO_ROOT/docs/screenshots"
node "$REPO_ROOT/scripts/demo-screenshots.mjs"

# ── 5. Generate HTML ──────────────────────────────────────────────────────────
log "Generating landing page..."
node "$REPO_ROOT/scripts/demo-html.mjs"

# ── 6. Deploy to gh-pages ─────────────────────────────────────────────────────
log "Deploying to gh-pages..."
DEPLOY_TMP=$(mktemp -d)
cp -r "$REPO_ROOT/docs/." "$DEPLOY_TMP/"
REMOTE_URL=$(git remote get-url origin)

cd "$DEPLOY_TMP"
git init -b gh-pages
git -c user.name="demo-build" -c user.email="demo@build" add -A
git -c user.name="demo-build" -c user.email="demo@build" commit -m "chore: demo update"
git remote add origin "$REMOTE_URL"
git push origin gh-pages --force
cd "$REPO_ROOT"
rm -rf "$DEPLOY_TMP"

log "Done!"
log "GitHub Pages URL: https://maplemap.github.io/tempo/"
log "First time? Enable Pages in: Settings → Pages → Source: gh-pages branch, / (root)"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/demo-build.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/demo-build.sh
git commit -m "feat: add demo-build orchestrator script"
```

---

### Task 7: Add `make demo-build` target

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Add target to Makefile**

Add after the `clean` target:

```makefile
demo-build: ## Build demo screenshots and deploy to GitHub Pages
	bash scripts/demo-build.sh
```

- [ ] **Step 2: Verify the target appears in `make help`**

```bash
make help
```

Expected: a line like `demo-build       Build demo screenshots and deploy to GitHub Pages`

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "feat: add demo-build make target"
```

---

### Task 8: End-to-end test

- [ ] **Step 1: Run the full pipeline**

```bash
make demo-build
```

Expected output (in order):
```
[demo-build] Seeding demo database...
Seeded: .../backend/data/demo/tempo.db
[demo-build] Building and starting demo container...
[demo-build] App ready in Xs
[demo-build] Taking screenshots...
screenshot: 01-timer.png
screenshot: 02-entries.png
screenshot: 03-dashboard.png
screenshot: 04-settings.png
Screenshots saved to docs/screenshots/
[demo-build] Generating landing page...
Generated docs/index.html
[demo-build] Deploying to gh-pages...
[demo-build] Done!
[demo-build] GitHub Pages URL: https://maplemap.github.io/tempo/
```

- [ ] **Step 2: Verify screenshots exist and look correct**

```bash
open docs/screenshots/01-timer.png
open docs/screenshots/03-dashboard.png
```

Check: timer is running (~45min elapsed), dashboard shows ASCII bars with data.

- [ ] **Step 3: Verify generated HTML**

```bash
open docs/index.html
```

Check: 4 screenshots visible in 2×2 grid, IBM Plex Mono font, quick start block present.

- [ ] **Step 4: Enable GitHub Pages (one-time manual step)**

In the GitHub repo: Settings → Pages → Source → `gh-pages` branch, `/ (root)` → Save.

Then open `https://maplemap.github.io/tempo/` and verify the page loads.

- [ ] **Step 5: Add GitHub Pages link to README**

In `README.md`, add to the top section after the project description:

```markdown
**[→ Live demo](https://maplemap.github.io/tempo/)**
```

- [ ] **Step 6: Commit README update**

```bash
git add README.md
git commit -m "docs: add GitHub Pages demo link to README"
```
