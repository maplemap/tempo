# TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all backend and frontend source files from plain JS/JSX to TypeScript with `strict: true`, adding shared domain types and a `tsx`-based dev runtime.

**Architecture:** `tsx watch` replaces `node --watch` for backend dev; `tsc` compiles for prod. Shared types live in `shared/types/` and are imported by both sides via relative paths. Frontend uses Vite's built-in TSX support — only `tsconfig.json` files and dependency changes are needed there.

**Tech Stack:** TypeScript 5.6, tsx 4.x, @types/better-sqlite3, @types/jsonwebtoken, @types/node-cron, @types/react, @types/react-dom

---

## File Map

**Created (new):**
- `shared/types/entry.ts` — Entry, EntryLink, TimerEntry interfaces
- `shared/types/project.ts` — Project interface
- `shared/types/sync.ts` — SyncStateRow, ExternalEvent, EventType
- `shared/types/index.ts` — re-exports all shared types
- `shared/tsconfig.json` — noEmit, for IDE only
- `backend/tsconfig.json`
- `frontend/tsconfig.json`

**Renamed + typed (backend):**
- `backend/src/lib/env.js` → `env.ts`
- `backend/src/lib/time.js` → `time.ts`
- `backend/src/lib/auth.js` → `auth.ts` (adds Fastify module augmentation for `req.user`)
- `backend/src/lib/autolink.js` → `autolink.ts`
- `backend/src/db/index.js` → `index.ts`
- `backend/src/lib/sync/github.js` → `github.ts`
- `backend/src/routes/auth.js` → `auth.ts`
- `backend/src/routes/timer.js` → `timer.ts`
- `backend/src/routes/projects.js` → `projects.ts`
- `backend/src/routes/entries.js` → `entries.ts`
- `backend/src/routes/stats.js` → `stats.ts`
- `backend/src/routes/sync.js` → `sync.ts`
- `backend/src/routes/github.js` → `github.ts`
- `backend/src/server.js` → `server.ts`

**Renamed + typed (frontend):**
- `frontend/src/lib/time.js` → `time.ts`
- `frontend/src/lib/api.js` → `api.ts`
- `frontend/src/lib/renderDescription.jsx` → `renderDescription.tsx`
- `frontend/src/components/AsciiBar.jsx` → `AsciiBar.tsx`
- `frontend/src/components/ConfirmInline.jsx` → `ConfirmInline.tsx`
- `frontend/src/components/EntryRow.jsx` → `EntryRow.tsx`
- `frontend/src/components/EntryItem.jsx` → `EntryItem.tsx`
- `frontend/src/components/Nav.jsx` → `Nav.tsx`
- `frontend/src/pages/LoginPage.jsx` → `LoginPage.tsx`
- `frontend/src/pages/TimerPage.jsx` → `TimerPage.tsx`
- `frontend/src/pages/EntriesPage.jsx` → `EntriesPage.tsx`
- `frontend/src/pages/DashboardPage.jsx` → `DashboardPage.tsx`
- `frontend/src/pages/SettingsPage.jsx` → `SettingsPage.tsx`
- `frontend/src/App.jsx` → `App.tsx`
- `frontend/src/main.jsx` → `main.tsx`

**Modified:**
- `backend/package.json` — scripts + devDependencies
- `frontend/package.json` — devDependencies
- `CLAUDE.md` — update stack description

---

## Task 1: Install dependencies, create tsconfigs and shared types

**Files:**
- Create: `backend/tsconfig.json`
- Create: `frontend/tsconfig.json`
- Create: `shared/tsconfig.json`
- Create: `shared/types/entry.ts`
- Create: `shared/types/project.ts`
- Create: `shared/types/sync.ts`
- Create: `shared/types/index.ts`
- Modify: `backend/package.json`
- Modify: `frontend/package.json`

- [ ] **Step 1: Install backend devDependencies**

```bash
cd backend && npm install --save-dev typescript tsx @types/node @types/better-sqlite3 @types/jsonwebtoken @types/node-cron
```

Expected: packages added to `backend/node_modules`, no errors.

- [ ] **Step 2: Install frontend devDependencies**

```bash
cd frontend && npm install --save-dev typescript @types/react @types/react-dom
```

Expected: packages added to `frontend/node_modules`, no errors.

- [ ] **Step 3: Update backend/package.json scripts**

Replace the `scripts` block in `backend/package.json`:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Create backend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["types"]
}
```

- [ ] **Step 7: Create shared/types/entry.ts**

```ts
export interface EntryLink {
  id: number;
  entry_id: number;
  url: string;
  label: string | null;
}

export interface Entry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  github_repo: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  links: EntryLink[];
  badges: string[];
}

export interface TimerEntry {
  id: number;
  project_id: number | null;
  project_name: string | null;
  github_repo: string | null;
  description: string | null;
  started_at: string;
}
```

- [ ] **Step 8: Create shared/types/project.ts**

```ts
export interface Project {
  id: number;
  name: string;
  archived: 0 | 1;
  github_repo: string | null;
  github_base_branch: string | null;
  created_at: string;
}
```

- [ ] **Step 9: Create shared/types/sync.ts**

```ts
export type EventType = 'pr_created' | 'pr_reviewed' | 'pr_merged';

export interface ExternalEvent {
  id: number;
  source: string;
  event_type: string;
  ref_id: string;
  ref_url: string;
  title: string | null;
  repo_or_board: string | null;
  occurred_at: string;
  raw_json: string | null;
  fetched_at: string;
}

export interface SyncStateRow {
  source: string;
  last_synced_at: string | null;
  last_error: string | null;
}
```

- [ ] **Step 10: Create shared/types/index.ts**

```ts
export * from './entry.js';
export * from './project.js';
export * from './sync.js';
```

- [ ] **Step 11: Verify shared types compile**

```bash
cd shared && npx tsc --noEmit
```

Expected: no output (zero errors). If `shared/` does not exist as a package, run `npx tsc --noEmit -p tsconfig.json` from `shared/`.

- [ ] **Step 12: Commit**

```bash
git add backend/tsconfig.json frontend/tsconfig.json shared/ backend/package.json frontend/package.json
git commit -m "chore: install TypeScript deps and create tsconfigs + shared types"
```

---

## Task 2: Migrate backend/src/lib/env.ts and time.ts

**Files:**
- Rename: `backend/src/lib/env.js` → `env.ts`
- Rename: `backend/src/lib/time.js` → `time.ts`

- [ ] **Step 1: Rename and rewrite env.ts**

```bash
mv backend/src/lib/env.js backend/src/lib/env.ts
```

Full content of `backend/src/lib/env.ts`:

```ts
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  return v ? Number(v) : def;
}

export const env = {
  port: num('PORT', 3000),
  adminPassword: required('ADMIN_PASSWORD'),
  jwtSecret: required('JWT_SECRET'),
  dataDir: path.resolve(process.env['DATA_DIR'] || path.join(__dirname, '../../data')),
  isProduction: process.env['NODE_ENV'] === 'production',
  secureCookie: process.env['SECURE_COOKIE'] === 'true',
  github: {
    token: process.env['GITHUB_TOKEN'] ?? null as string | null
  },
  syncIntervalMinutes: num('SYNC_INTERVAL_MINUTES', 15),
  backfillDays: num('BACKFILL_DAYS', 30)
};
```

- [ ] **Step 2: Rename and rewrite time.ts**

```bash
mv backend/src/lib/time.js backend/src/lib/time.ts
```

Full content of `backend/src/lib/time.ts`:

```ts
export function nowIso(): string {
  return new Date().toISOString();
}

export function diffSeconds(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
}

export function parseRange(
  from: string | undefined,
  to: string | undefined
): { fromIso: string; toIso: string } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors (only env.ts and time.ts are .ts files; other .js files are ignored by tsconfig since `include: ["src"]` only picks up `.ts` files).

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/env.ts backend/src/lib/time.ts
git commit -m "chore(ts): migrate lib/env and lib/time to TypeScript"
```

---

## Task 3: Migrate backend/src/lib/auth.ts and autolink.ts

**Files:**
- Rename: `backend/src/lib/auth.js` → `auth.ts`
- Rename: `backend/src/lib/autolink.js` → `autolink.ts`

- [ ] **Step 1: Rename and rewrite auth.ts**

```bash
mv backend/src/lib/auth.js backend/src/lib/auth.ts
```

Full content of `backend/src/lib/auth.ts`:

```ts
import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { env } from './env.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: jwt.JwtPayload | null;
  }
}

const COOKIE_NAME = 'tempo_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function signToken(payload: object): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '90d' });
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    const result = jwt.verify(token, env.jwtSecret);
    return result as jwt.JwtPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.secureCookie,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function attachAuth(fastify: FastifyInstance): void {
  fastify.decorateRequest('user', null);
  fastify.addHook('preHandler', async (req: FastifyRequest) => {
    const token = (req.cookies as Record<string, string>)?.[COOKIE_NAME];
    if (!token) return;
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  });
}

export function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  if (!req.user) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  done();
}
```

- [ ] **Step 2: Rename and rewrite autolink.ts**

```bash
mv backend/src/lib/autolink.js backend/src/lib/autolink.ts
```

Full content of `backend/src/lib/autolink.ts`:

```ts
import { request } from 'undici';
import { db } from '../db/index.js';
import { env } from './env.js';

const API = 'https://api.github.com';

function extractPRRefs(description: string): string[] {
  const out = new Set<string>();
  for (const m of description.matchAll(/(?:PR\s*#?|#)(\d+)/gi)) out.add(m[1]);
  return [...out];
}

const getAutoLinks = db.prepare<[number], { id: number; url: string }>(
  `SELECT id, url FROM entry_links WHERE entry_id = ? AND url LIKE '%/pull/%'`
);
const deleteLinkById = db.prepare<[number]>(`DELETE FROM entry_links WHERE id = ?`);
const insertLink = db.prepare<[number, string, string | null]>(
  `INSERT INTO entry_links (entry_id, url, label) VALUES (?, ?, ?)`
);

interface GHPRData {
  title: string;
}

async function fetchPR(repo: string, number: string, token: string): Promise<GHPRData | null> {
  try {
    const res = await request(`${API}/repos/${repo}/pulls/${number}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tempo-tracker'
      }
    });
    if (res.statusCode !== 200) { await res.body.dump(); return null; }
    return res.body.json() as Promise<GHPRData>;
  } catch {
    return null;
  }
}

export async function autoLinkPRs(
  entryId: number,
  description: string | null | undefined,
  githubRepo: string | null | undefined
): Promise<void> {
  const token = env.github.token;
  if (!token || !githubRepo || !description) return;

  const refs = extractPRRefs(description);
  const existingAutoLinks = getAutoLinks.all(entryId);

  const wantedUrls = new Set(refs.map((r) => `https://github.com/${githubRepo}/pull/${r}`));

  for (const link of existingAutoLinks) {
    if (!wantedUrls.has(link.url)) deleteLinkById.run(link.id);
  }

  const existingUrls = new Set(existingAutoLinks.map((l) => l.url));
  for (const ref of refs) {
    const url = `https://github.com/${githubRepo}/pull/${ref}`;
    if (existingUrls.has(url)) continue;
    const pr = await fetchPR(githubRepo, ref, token);
    if (!pr) continue;
    insertLink.run(entryId, url, `PR #${ref}: ${pr.title}`);
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/auth.ts backend/src/lib/autolink.ts
git commit -m "chore(ts): migrate lib/auth and lib/autolink to TypeScript"
```

---

## Task 4: Migrate backend/src/db/index.ts and lib/sync/github.ts

**Files:**
- Rename: `backend/src/db/index.js` → `index.ts`
- Rename: `backend/src/lib/sync/github.js` → `github.ts`

- [ ] **Step 1: Rename and rewrite db/index.ts**

```bash
mv backend/src/db/index.js backend/src/db/index.ts
```

Full content of `backend/src/db/index.ts`:

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(env.dataDir, { recursive: true });
const dbFile = path.join(env.dataDir, 'tempo.db');

export const db = new Database(dbFile);
db.pragma('journal_mode = DELETE');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

try { db.exec(`ALTER TABLE projects ADD COLUMN github_repo TEXT`); } catch {}
try { db.exec(`ALTER TABLE projects ADD COLUMN github_base_branch TEXT`); } catch {}

console.log(`[db] using ${dbFile}`);
```

- [ ] **Step 2: Rename and rewrite lib/sync/github.ts**

```bash
mv backend/src/lib/sync/github.js backend/src/lib/sync/github.ts
```

Full content of `backend/src/lib/sync/github.ts`:

```ts
import { request } from 'undici';
import { db } from '../../db/index.js';
import { env } from '../env.js';

const API = 'https://api.github.com';

interface UpsertParams {
  source: string;
  event_type: string;
  ref_id: string;
  ref_url: string;
  title: string;
  repo_or_board: string | null;
  occurred_at: string;
  raw_json: string;
}

const upsert = db.prepare<UpsertParams>(`
  INSERT INTO external_events (source, event_type, ref_id, ref_url, title, repo_or_board, occurred_at, raw_json, fetched_at)
  VALUES (@source, @event_type, @ref_id, @ref_url, @title, @repo_or_board, @occurred_at, @raw_json, datetime('now'))
  ON CONFLICT(source, event_type, ref_id) DO UPDATE SET
    ref_url       = excluded.ref_url,
    title         = excluded.title,
    repo_or_board = excluded.repo_or_board,
    occurred_at   = excluded.occurred_at,
    raw_json      = excluded.raw_json,
    fetched_at    = datetime('now')
`);

interface BranchRow { branch: string; }

const listProjectBranches = db.prepare<[], BranchRow>(
  `SELECT DISTINCT COALESCE(github_base_branch, 'main') as branch FROM projects WHERE github_repo IS NOT NULL`
);

async function gh(urlPath: string, token: string): Promise<unknown> {
  const res = await request(`${API}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tempo-tracker'
    }
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`GitHub ${res.statusCode}: ${urlPath} — ${body.slice(0, 200)}`);
  }
  return res.body.json();
}

async function whoami(token: string): Promise<string> {
  const me = await gh('/user', token) as { login: string };
  return me.login;
}

function repoFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/repos\/([^/]+\/[^/]+)/);
  return m ? m[1] : null;
}

interface GHSearchItem {
  number: number;
  html_url: string;
  title: string;
  repository_url?: string;
  url?: string;
  pull_request?: { merged_at?: string | null };
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface GHSearchResult {
  items?: GHSearchItem[];
}

function fromSearch(item: GHSearchItem, eventType: string, occurredField: string): UpsertParams {
  const pr = item.pull_request ?? {};
  const occurred =
    (occurredField === 'merged_at' ? pr.merged_at : null) ||
    (item[occurredField] as string | undefined) ||
    item.updated_at ||
    item.created_at ||
    new Date().toISOString();
  return {
    source: 'github',
    event_type: eventType,
    ref_id: String(item.number),
    ref_url: item.html_url,
    title: item.title ?? '',
    repo_or_board: repoFromUrl(item.repository_url ?? item.url),
    occurred_at: occurred,
    raw_json: JSON.stringify(item)
  };
}

async function searchAll(query: string, token: string): Promise<GHSearchItem[]> {
  const all: GHSearchItem[] = [];
  let page = 1;
  while (page <= 10) {
    const data = await gh(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=100&page=${page}&sort=updated&order=desc`,
      token
    ) as GHSearchResult;
    const items = data.items ?? [];
    all.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return all;
}

interface SyncGitHubOptions { days?: number; }

export async function syncGitHub({ days }: SyncGitHubOptions = {}): Promise<{
  user: string;
  bases: string[];
  since: string;
  counts: { pr_created: number; pr_reviewed: number; pr_merged: number };
}> {
  const token = env.github.token;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const window = days ?? env.backfillDays;
  const since = new Date(Date.now() - window * 86400 * 1000).toISOString().slice(0, 10);
  const user = await whoami(token);

  const writeBatch = db.transaction((items: UpsertParams[]) => {
    for (const item of items) upsert.run(item);
  });

  const created  = await searchAll(`author:${user} type:pr created:>=${since}`, token);
  writeBatch(created.map((i) => fromSearch(i, 'pr_created', 'created_at')));

  const reviewed = await searchAll(`reviewed-by:${user} type:pr updated:>=${since} -author:${user}`, token);
  writeBatch(reviewed.map((i) => fromSearch(i, 'pr_reviewed', 'updated_at')));

  const branches = listProjectBranches.all().map((r) => r.branch);
  if (branches.length === 0) branches.push('main');

  const allMerged: GHSearchItem[] = [];
  for (const branch of branches) {
    const items = await searchAll(`author:${user} type:pr is:merged base:${branch} merged:>=${since}`, token);
    allMerged.push(...items);
  }
  writeBatch(allMerged.map((i) => fromSearch(i, 'pr_merged', 'merged_at')));

  return {
    user,
    bases: branches,
    since,
    counts: {
      pr_created:  created.length,
      pr_reviewed: reviewed.length,
      pr_merged:   allMerged.length
    }
  };
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/index.ts backend/src/lib/sync/github.ts
git commit -m "chore(ts): migrate db/index and lib/sync/github to TypeScript"
```

---

## Task 5: Migrate backend routes — auth, timer, projects, sync, github

**Files:**
- Rename: `backend/src/routes/auth.js` → `auth.ts`
- Rename: `backend/src/routes/timer.js` → `timer.ts`
- Rename: `backend/src/routes/projects.js` → `projects.ts`
- Rename: `backend/src/routes/sync.js` → `sync.ts`
- Rename: `backend/src/routes/github.js` → `github.ts`

- [ ] **Step 1: Rename and rewrite routes/auth.ts**

```bash
mv backend/src/routes/auth.js backend/src/routes/auth.ts
```

Full content of `backend/src/routes/auth.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { env } from '../lib/env.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../lib/auth.js';

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: { password?: string } }>('/login', async (req, reply) => {
    const { password } = req.body;
    if (!password || password !== env.adminPassword) {
      reply.code(401).send({ error: 'invalid password' });
      return;
    }
    const token = signToken({ sub: 'admin' });
    setAuthCookie(reply, token);
    return { ok: true };
  });

  fastify.post('/logout', async (_req, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  fastify.get('/me', async (req, reply) => {
    if (!req.user) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    return { user: req.user['sub'] };
  });
}
```

- [ ] **Step 2: Rename and rewrite routes/timer.ts**

```bash
mv backend/src/routes/timer.js backend/src/routes/timer.ts
```

Full content of `backend/src/routes/timer.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { nowIso, diffSeconds } from '../lib/time.js';
import { autoLinkPRs } from '../lib/autolink.js';

interface TimerRow {
  id: number;
  project_id: number | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  project_name: string | null;
  github_repo: string | null;
}

const getOpen = db.prepare<[], TimerRow>(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.ended_at IS NULL
  ORDER BY e.started_at DESC
  LIMIT 1
`);

interface InsertParams { projectId: number | null; description: string; startedAt: string; }
const insertEntry = db.prepare<InsertParams>(`
  INSERT INTO time_entries (project_id, description, started_at)
  VALUES (@projectId, @description, @startedAt)
`);

interface CloseParams { endedAt: string; duration: number; id: number; }
const closeEntry = db.prepare<CloseParams>(`
  UPDATE time_entries
  SET ended_at = @endedAt, duration_seconds = @duration
  WHERE id = @id
`);

interface CloseAllParams { endedAt: string; }
const closeAllOpen = db.prepare<CloseAllParams>(`
  UPDATE time_entries
  SET ended_at = @endedAt,
      duration_seconds = CAST((julianday(@endedAt) - julianday(started_at)) * 86400 AS INTEGER)
  WHERE ended_at IS NULL
`);

export default async function timerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/current', async () => {
    const row = getOpen.get();
    return { current: row ?? null };
  });

  fastify.post<{ Body: { projectId?: number | null; description?: string } }>(
    '/start',
    async (req) => {
      const { projectId = null, description = '' } = req.body;
      closeAllOpen.run({ endedAt: nowIso() });
      const result = insertEntry.run({ projectId: projectId ?? null, description, startedAt: nowIso() });
      const row = db.prepare<[number | bigint], TimerRow>(`
        SELECT e.*, p.name AS project_name
        FROM time_entries e
        LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.id = ?
      `).get(result.lastInsertRowid);
      return { current: row };
    }
  );

  fastify.post('/stop', async () => {
    const open = getOpen.get();
    if (!open) return { ok: true, entryId: null, alreadyStopped: true };
    const endedAt = nowIso();
    closeEntry.run({ endedAt, duration: diffSeconds(open.started_at, endedAt), id: open.id });
    await autoLinkPRs(open.id, open.description, open.github_repo).catch(() => {});
    return { ok: true, entryId: open.id };
  });
}
```

- [ ] **Step 3: Rename and rewrite routes/projects.ts**

```bash
mv backend/src/routes/projects.js backend/src/routes/projects.ts
```

Full content of `backend/src/routes/projects.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import type { Project } from '../../../shared/types/index.js';

const listProjects = db.prepare<[], Project>(`SELECT * FROM projects ORDER BY archived ASC, name ASC`);
const getProject   = db.prepare<[number | string], Project>(`SELECT * FROM projects WHERE id = ?`);
const insertProject = db.prepare<[string]>(`INSERT INTO projects (name) VALUES (?)`);

interface UpdateParams {
  id: number;
  name: string;
  archived: 0 | 1;
  github_repo: string | null;
  github_base_branch: string | null;
}
const updateProject = db.prepare<UpdateParams>(
  `UPDATE projects SET name = @name, archived = @archived, github_repo = @github_repo, github_base_branch = @github_base_branch WHERE id = @id`
);
const deleteProject = db.prepare<[number | string]>(`DELETE FROM projects WHERE id = ?`);

export default async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ projects: listProjects.all() }));

  fastify.post<{ Body: { name?: string } }>('/', async (req, reply) => {
    const { name } = req.body;
    if (!name?.trim()) {
      reply.code(400).send({ error: 'name required' });
      return;
    }
    try {
      const result = insertProject.run(name.trim());
      return { project: getProject.get(result.lastInsertRowid) };
    } catch (err) {
      if (String((err as Error).message).includes('UNIQUE')) {
        reply.code(409).send({ error: 'project name exists' });
        return;
      }
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<Project> }>('/:id', async (req, reply) => {
    const current = getProject.get(req.params.id);
    if (!current) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    const next = { ...current, ...req.body };
    updateProject.run({
      id: current.id,
      name: next.name,
      archived: next.archived ? 1 : 0,
      github_repo: next.github_repo ?? null,
      github_base_branch: next.github_base_branch ?? null
    });
    return { project: getProject.get(current.id) };
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = getProject.get(req.params.id);
    if (!row) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    deleteProject.run(req.params.id);
    return { ok: true };
  });
}
```

- [ ] **Step 4: Rename and rewrite routes/sync.ts**

```bash
mv backend/src/routes/sync.js backend/src/routes/sync.ts
```

Full content of `backend/src/routes/sync.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { syncGitHub } from '../lib/sync/github.js';
import type { SyncStateRow } from '../../../shared/types/index.js';

const listState = db.prepare<[], SyncStateRow>(`SELECT * FROM sync_state`);

interface UpsertStateParams { source: string; last_synced_at: string; last_error: string | null; }
const upsertState = db.prepare<UpsertStateParams>(`
  INSERT INTO sync_state (source, last_synced_at, last_error)
  VALUES (@source, @last_synced_at, @last_error)
  ON CONFLICT(source) DO UPDATE SET
    last_synced_at = excluded.last_synced_at,
    last_error     = excluded.last_error
`);

export async function runGitHubSync(): Promise<{ ok: boolean; result: unknown }> {
  try {
    const result = await syncGitHub();
    upsertState.run({ source: 'github', last_synced_at: new Date().toISOString(), last_error: null });
    return { ok: true, result };
  } catch (err) {
    upsertState.run({
      source: 'github',
      last_synced_at: new Date().toISOString(),
      last_error: (err as Error).message
    });
    throw err;
  }
}

export default async function syncRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/state', async () => ({ state: listState.all() }));

  fastify.post('/run', async (_req, reply) => {
    try {
      const out = await runGitHubSync();
      return out;
    } catch (err) {
      reply.code(500).send({ error: (err as Error).message });
    }
  });
}
```

- [ ] **Step 5: Rename and rewrite routes/github.ts**

```bash
mv backend/src/routes/github.js backend/src/routes/github.ts
```

Full content of `backend/src/routes/github.ts`:

```ts
import { request } from 'undici';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/auth.js';
import { env } from '../lib/env.js';

const API = 'https://api.github.com';

async function gh(urlPath: string, token: string): Promise<unknown> {
  const res = await request(`${API}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tempo-tracker'
    }
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`GitHub ${res.statusCode}: ${body.slice(0, 200)}`);
  }
  return res.body.json();
}

export default async function githubRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/repos', async (_req, reply) => {
    const token = env.github.token;
    if (!token) {
      reply.code(503).send({ error: 'GITHUB_TOKEN not configured' });
      return;
    }
    const data = await gh(
      '/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated',
      token
    ) as Array<{ full_name: string }>;
    return { repos: data.map((r) => r.full_name).sort() };
  });
}
```

- [ ] **Step 6: Run typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/routes/timer.ts backend/src/routes/projects.ts backend/src/routes/sync.ts backend/src/routes/github.ts
git commit -m "chore(ts): migrate routes/auth, timer, projects, sync, github to TypeScript"
```

---

## Task 6: Migrate backend routes — entries and stats

**Files:**
- Rename: `backend/src/routes/entries.js` → `entries.ts`
- Rename: `backend/src/routes/stats.js` → `stats.ts`

- [ ] **Step 1: Rename and rewrite routes/entries.ts**

```bash
mv backend/src/routes/entries.js backend/src/routes/entries.ts
```

Full content of `backend/src/routes/entries.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { diffSeconds, parseRange } from '../lib/time.js';
import { autoLinkPRs } from '../lib/autolink.js';
import type { Entry, EntryLink } from '../../../shared/types/index.js';

interface DbEntry {
  id: number;
  project_id: number | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  project_name: string | null;
  github_repo: string | null;
}

interface EventRow {
  ref_id: string;
  event_type: string;
  repo_or_board: string | null;
}

interface RangeParams { fromIso: string; toIso: string; }

const listEntries = db.prepare<RangeParams, DbEntry>(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso
  ORDER BY e.started_at DESC
`);

const getEntry = db.prepare<[number | string], DbEntry>(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.id = ?
`);

const getLinks = db.prepare<[number], EntryLink>(`SELECT * FROM entry_links WHERE entry_id = ?`);
const allEvents = db.prepare<[], EventRow>(`SELECT ref_id, event_type, repo_or_board FROM external_events`);
const insertLink = db.prepare<[number | string, string, string | null]>(
  `INSERT INTO entry_links (entry_id, url, label) VALUES (?, ?, ?)`
);
const deleteLink = db.prepare<[number | string, number | string]>(
  `DELETE FROM entry_links WHERE id = ? AND entry_id = ?`
);
const deleteEntry = db.prepare<[number | string]>(`DELETE FROM time_entries WHERE id = ?`);

function extractRefs(description: string | null): string[] {
  if (!description) return [];
  const out = new Set<string>();
  for (const m of description.matchAll(/(?:PR|pr|#)\s*#?(\d+)/g)) out.add(m[1]);
  return [...out];
}

function buildBadgeIndex(events: EventRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const ev of events) {
    const key = `${ev.repo_or_board ?? ''}:${ev.ref_id}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(ev.event_type);
  }
  return map;
}

function badgesFor(
  description: string | null,
  githubRepo: string | null,
  index: Map<string, Set<string>>
): string[] {
  if (!githubRepo) return [];
  const refs = extractRefs(description);
  if (refs.length === 0) return [];
  const types = new Set<string>();
  for (const r of refs) {
    const found = index.get(`${githubRepo}:${r}`);
    if (found) for (const t of found) types.add(t);
  }
  return [...types].map((t) => {
    if (t === 'pr_created')  return '✓ TASK';
    if (t === 'pr_reviewed') return '✓ REVIEW';
    if (t === 'pr_merged')   return '✓ SHIPPED';
    return t;
  });
}

function hydrate(entry: DbEntry, badgeIndex?: Map<string, Set<string>>): Entry {
  return {
    ...entry,
    links: getLinks.all(entry.id),
    badges: badgeIndex ? badgesFor(entry.description, entry.github_repo, badgeIndex) : []
  };
}

export default async function entryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get<{ Querystring: { from?: string; to?: string } }>('/', async (req) => {
    const { from, to } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const rows = listEntries.all({ fromIso, toIso });
    const index = buildBadgeIndex(allEvents.all());
    return { entries: rows.map((r) => hydrate(r, index)) };
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = getEntry.get(req.params.id);
    if (!row) { reply.code(404).send({ error: 'not found' }); return; }
    return { entry: hydrate(row) };
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<DbEntry> }>('/:id', async (req, reply) => {
    const current = getEntry.get(req.params.id);
    if (!current) { reply.code(404).send({ error: 'not found' }); return; }

    const next = { ...current, ...req.body };
    const startedAt = next.started_at;
    const endedAt = next.ended_at;
    const now = Date.now();

    if (new Date(startedAt).getTime() > now) {
      reply.code(400).send({ error: 'started_at cannot be in the future' }); return;
    }
    if (endedAt && new Date(endedAt).getTime() > now) {
      reply.code(400).send({ error: 'ended_at cannot be in the future' }); return;
    }
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      reply.code(400).send({ error: 'ended_at must be after started_at' }); return;
    }

    const duration = endedAt ? diffSeconds(startedAt, endedAt) : null;

    db.prepare<{
      id: number; project_id: number | null; description: string;
      started_at: string; ended_at: string | null; duration_seconds: number | null;
    }>(`
      UPDATE time_entries
      SET project_id = @project_id,
          description = @description,
          started_at = @started_at,
          ended_at = @ended_at,
          duration_seconds = @duration_seconds
      WHERE id = @id
    `).run({
      id: current.id,
      project_id: next.project_id ?? null,
      description: next.description ?? '',
      started_at: startedAt,
      ended_at: endedAt ?? null,
      duration_seconds: duration
    });

    const saved = getEntry.get(current.id);
    if (saved) await autoLinkPRs(current.id, saved.description, saved.github_repo).catch(() => {});
    const final = getEntry.get(current.id);
    return { entry: final ? hydrate(final) : null };
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = getEntry.get(req.params.id);
    if (!row) { reply.code(404).send({ error: 'not found' }); return; }
    deleteEntry.run(req.params.id);
    return { ok: true };
  });

  fastify.post<{ Params: { id: string }; Body: { url?: string; label?: string } }>(
    '/:id/links',
    async (req, reply) => {
      const { url, label } = req.body;
      if (!url) { reply.code(400).send({ error: 'url required' }); return; }
      const row = getEntry.get(req.params.id);
      if (!row) { reply.code(404).send({ error: 'not found' }); return; }
      insertLink.run(req.params.id, url, label ?? null);
      return { entry: hydrate(getEntry.get(req.params.id)!) };
    }
  );

  fastify.delete<{ Params: { id: string; linkId: string } }>('/:id/links/:linkId', async (req) => {
    deleteLink.run(req.params.linkId, req.params.id);
    return { entry: hydrate(getEntry.get(req.params.id)!) };
  });
}
```

- [ ] **Step 2: Rename and rewrite routes/stats.ts**

```bash
mv backend/src/routes/stats.js backend/src/routes/stats.ts
```

Full content of `backend/src/routes/stats.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { parseRange } from '../lib/time.js';

interface RangeParams { fromIso: string; toIso: string; }

interface ProjectTotal { project_name: string; project_id: number | null; total: number; }
interface DayTotal { day: string; total: number; }
interface TotalAll { total: number | null; }
interface EventCount { event_type: string; count: number; }
interface EntryRef { id: number; description: string | null; started_at: string; }
interface EventRef { ref_id: string; ref_url: string; event_type: string; title: string | null; }

const totalsByProject = db.prepare<RangeParams, ProjectTotal>(`
  SELECT
    COALESCE(p.name, '(no project)') AS project_name,
    p.id AS project_id,
    SUM(e.duration_seconds) AS total
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso AND e.duration_seconds IS NOT NULL
  GROUP BY e.project_id
  ORDER BY total DESC
`);

const totalsByDay = db.prepare<RangeParams, DayTotal>(`
  SELECT date(started_at) AS day, SUM(duration_seconds) AS total
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso AND duration_seconds IS NOT NULL
  GROUP BY date(started_at)
  ORDER BY day ASC
`);

const totalAll = db.prepare<RangeParams, TotalAll>(`
  SELECT SUM(duration_seconds) AS total
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso AND duration_seconds IS NOT NULL
`);

const countEvents = db.prepare<RangeParams, EventCount>(`
  SELECT event_type, COUNT(*) AS count
  FROM external_events
  WHERE occurred_at >= @fromIso AND occurred_at < @toIso
  GROUP BY event_type
`);

const entriesInRange = db.prepare<RangeParams, EntryRef>(`
  SELECT id, description, started_at
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso
`);

const eventsInRange = db.prepare<RangeParams, EventRef>(`
  SELECT ref_id, ref_url, event_type, title
  FROM external_events
  WHERE occurred_at >= @fromIso AND occurred_at < @toIso
`);

function extractRefs(description: string | null): string[] {
  if (!description) return [];
  const matches = description.match(/(?:PR|pr|#)\s*#?(\d+)/g) ?? [];
  return matches.map((m) => m.replace(/[^\d]/g, ''));
}

interface Discrepancy {
  entryId: number;
  description: string | null;
  missingRefs: string[];
}

function findDiscrepancies(entries: EntryRef[], events: EventRef[]): Discrepancy[] {
  const eventRefs = new Set(events.map((e) => e.ref_id));
  const discrepancies: Discrepancy[] = [];
  for (const entry of entries) {
    const refs = extractRefs(entry.description);
    if (refs.length === 0) continue;
    const missing = refs.filter((r) => !eventRefs.has(r));
    if (missing.length > 0) {
      discrepancies.push({ entryId: entry.id, description: entry.description, missingRefs: missing });
    }
  }
  return discrepancies;
}

export default async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get<{ Querystring: { from?: string; to?: string } }>('/', async (req) => {
    const { from, to } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const args: RangeParams = { fromIso, toIso };

    const eventCounts = Object.fromEntries(
      countEvents.all(args).map((r) => [r.event_type, r.count])
    );

    return {
      range: { from: fromIso, to: toIso },
      total: totalAll.get(args)?.total ?? 0,
      byProject: totalsByProject.all(args),
      byDay: totalsByDay.all(args),
      counters: {
        prs_created:  eventCounts['pr_created']  ?? 0,
        reviews_done: eventCounts['pr_reviewed'] ?? 0,
        prs_merged:   eventCounts['pr_merged']   ?? 0
      },
      discrepancies: findDiscrepancies(entriesInRange.all(args), eventsInRange.all(args))
    };
  });
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/entries.ts backend/src/routes/stats.ts
git commit -m "chore(ts): migrate routes/entries and routes/stats to TypeScript"
```

---

## Task 7: Migrate backend/src/server.ts

**Files:**
- Rename: `backend/src/server.js` → `server.ts`

- [ ] **Step 1: Rename and rewrite server.ts**

```bash
mv backend/src/server.js backend/src/server.ts
```

Full content of `backend/src/server.ts`:

```ts
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { env } from './lib/env.js';
import { attachAuth } from './lib/auth.js';
import './db/index.js';

import authRoutes from './routes/auth.js';
import timerRoutes from './routes/timer.js';
import entryRoutes from './routes/entries.js';
import projectRoutes from './routes/projects.js';
import statsRoutes from './routes/stats.js';
import syncRoutes, { runGitHubSync } from './routes/sync.js';
import githubRoutes from './routes/github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: env.isProduction ? 'info' : 'debug' } });

await app.register(cookie);
attachAuth(app);

app.get('/health', async () => ({ ok: true }));

await app.register(authRoutes,    { prefix: '/api/auth' });
await app.register(timerRoutes,   { prefix: '/api/timer' });
await app.register(entryRoutes,   { prefix: '/api/entries' });
await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(statsRoutes,   { prefix: '/api/stats' });
await app.register(syncRoutes,    { prefix: '/api/sync' });
await app.register(githubRoutes,  { prefix: '/api/github' });

const publicDir = path.join(__dirname, '..', 'public');
const viteUpstream = process.env['VITE_UPSTREAM'] ?? 'http://localhost:5173';

if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    return reply.sendFile('index.html');
  });
} else {
  await app.register(fastifyHttpProxy, {
    upstream: viteUpstream,
    prefix: '/',
    rewritePrefix: '/',
    websocket: true,
    http2: false
  });
  app.log.info(`[dev] proxying non-/api requests to ${viteUpstream}`);
}

try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[tempo] listening on :${env.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

if (env.github.token) {
  const expr = `*/${env.syncIntervalMinutes} * * * *`;
  cron.schedule(expr, () => {
    runGitHubSync().catch((err: Error) => app.log.error({ err: err.message }, '[sync] github failed'));
  });
  app.log.info(`[sync] github scheduled every ${env.syncIntervalMinutes}m`);
  runGitHubSync().catch((err: Error) => app.log.warn({ err: err.message }, '[sync] initial github run failed'));
}
```

- [ ] **Step 2: Run full backend typecheck**

```bash
cd backend && npm run typecheck
```

Expected: no errors. All 14 `.ts` files in `src/` pass strict type checking.

- [ ] **Step 3: Verify dev server starts**

```bash
cd backend && npm run dev
```

Expected: `[tempo] listening on :3001` (or whichever port is in `.env`). Press Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add backend/src/server.ts
git commit -m "chore(ts): migrate server.ts to TypeScript — backend migration complete"
```

---

## Task 8: Migrate frontend/src/lib files

**Files:**
- Rename: `frontend/src/lib/time.js` → `time.ts`
- Rename: `frontend/src/lib/api.js` → `api.ts`
- Rename: `frontend/src/lib/renderDescription.jsx` → `renderDescription.tsx`

- [ ] **Step 1: Rename and rewrite frontend/src/lib/time.ts**

```bash
mv frontend/src/lib/time.js frontend/src/lib/time.ts
```

Full content of `frontend/src/lib/time.ts`:

```ts
export function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

export function fmtClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtDuration(totalSeconds: number): string {
  if (!totalSeconds) return '0m';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function fmtTimeHM(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(d = new Date()): string {
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${days[d.getDay()]}`;
}

export function fmtDayHeader(iso: string): string {
  const d = new Date(iso);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function isoDateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function rangeForPeriod(period: string): { from: string; to: string } {
  const end = new Date();
  const start = new Date(end);
  if (period === 'day') {
    start.setHours(0, 0, 0, 0);
  } else if (period === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - (day - 1));
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { from: start.toISOString(), to: end.toISOString() };
}
```

- [ ] **Step 2: Rename and rewrite frontend/src/lib/api.ts**

```bash
mv frontend/src/lib/api.js frontend/src/lib/api.ts
```

Full content of `frontend/src/lib/api.ts`:

```ts
import type { Entry, Project, TimerEntry, SyncStateRow } from '../../../shared/types/index.js';

const base = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function request<T = unknown>(urlPath: string, opts: RequestOptions = {}): Promise<T> {
  const { headers: customHeaders = {}, body, ...rest } = opts;
  const hasBody = body !== undefined && body !== null;
  const headers: Record<string, string> = { ...(customHeaders as Record<string, string>) };
  if (hasBody) headers['content-type'] = 'application/json';

  const res = await fetch(`${base}${urlPath}`, {
    credentials: 'include',
    ...rest,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  if (!res.ok) {
    throw new ApiError(
      (data?.['error'] as string | undefined) ?? res.statusText,
      res.status
    );
  }
  return data as T;
}

export const api = {
  auth: {
    me:     ()                 => request<{ user: string }>('/auth/me'),
    login:  (password: string) => request<{ ok: boolean }>('/auth/login', { method: 'POST', body: { password } }),
    logout: ()                 => request<{ ok: boolean }>('/auth/logout', { method: 'POST' })
  },
  timer: {
    current: () => request<{ current: TimerEntry | null }>('/timer/current'),
    start:   (body: { projectId?: number | null; description?: string }) =>
      request<{ current: TimerEntry }>('/timer/start', { method: 'POST', body }),
    stop:    () => request<{ ok: boolean; entryId: number | null; alreadyStopped?: boolean }>(
      '/timer/stop', { method: 'POST' }
    )
  },
  entries: {
    list:    (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ entries: Entry[] }>(`/entries${qs ? `?${qs}` : ''}`);
    },
    update:  (id: number, body: object) =>
      request<{ entry: Entry }>(`/entries/${id}`, { method: 'PATCH', body }),
    remove:  (id: number) =>
      request<{ ok: boolean }>(`/entries/${id}`, { method: 'DELETE' }),
    addLink: (id: number, body: { url: string; label?: string }) =>
      request<{ entry: Entry }>(`/entries/${id}/links`, { method: 'POST', body }),
    removeLink: (id: number, linkId: number) =>
      request<{ entry: Entry }>(`/entries/${id}/links/${linkId}`, { method: 'DELETE' })
  },
  projects: {
    list:   ()                    => request<{ projects: Project[] }>('/projects'),
    create: (name: string)        => request<{ project: Project }>('/projects', { method: 'POST', body: { name } }),
    update: (id: number, b: object) =>
      request<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: b }),
    remove: (id: number)          =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' })
  },
  stats: {
    get: (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request(`/stats${qs ? `?${qs}` : ''}`);
    }
  },
  sync: {
    state: () => request<{ state: SyncStateRow[] }>('/sync/state'),
    run:   () => request<{ ok: boolean }>('/sync/run', { method: 'POST' })
  },
  github: {
    repos: () => request<{ repos: string[] }>('/github/repos')
  }
};
```

- [ ] **Step 3: Rename and rewrite frontend/src/lib/renderDescription.tsx**

```bash
mv frontend/src/lib/renderDescription.jsx frontend/src/lib/renderDescription.tsx
```

Full content of `frontend/src/lib/renderDescription.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { EntryLink } from '../../../shared/types/index.js';

interface RenderOptions {
  links?: EntryLink[];
  githubRepo?: string | null;
}

export function renderDescription(
  description: string | null | undefined,
  { links, githubRepo }: RenderOptions = {}
): ReactNode {
  if (!description) return <span className="muted">(no description)</span>;

  const urlByPR: Record<string, string> = {};
  for (const l of links ?? []) {
    const m = l.url.match(/\/pull\/(\d+)$/);
    if (m) urlByPR[m[1]] = l.url;
  }

  const parts: ReactNode[] = [];
  let last = 0;
  const re = /(?:PR\s*#?|#)(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) {
    if (m.index > last) parts.push(description.slice(last, m.index));
    const url = urlByPR[m[1]] ?? (githubRepo ? `https://github.com/${githubRepo}/pull/${m[1]}` : null);
    parts.push(url
      ? <a key={m.index} href={url} target="_blank" rel="noopener noreferrer"
           className="entry-link-inline" onClick={(e) => e.stopPropagation()}>{m[0]}</a>
      : m[0]
    );
    last = m.index + m[0].length;
  }
  if (last < description.length) parts.push(description.slice(last));
  return parts;
}
```

- [ ] **Step 4: Run frontend typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: errors about missing type declarations for other `.jsx` files that import from the now-`.ts` lib files. These will be resolved in Tasks 9 and 10. For now, the lib files themselves should be error-free — only import resolution errors from untouched pages/components are expected.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/time.ts frontend/src/lib/api.ts frontend/src/lib/renderDescription.tsx
git commit -m "chore(ts): migrate frontend lib files to TypeScript"
```

---

## Task 9: Migrate frontend components

**Files:**
- Rename: `frontend/src/components/AsciiBar.jsx` → `AsciiBar.tsx`
- Rename: `frontend/src/components/ConfirmInline.jsx` → `ConfirmInline.tsx`
- Rename: `frontend/src/components/EntryRow.jsx` → `EntryRow.tsx`
- Rename: `frontend/src/components/Nav.jsx` → `Nav.tsx`
- Rename: `frontend/src/components/EntryItem.jsx` → `EntryItem.tsx`

Read the current content of each file before this task, as the exact code may have been updated since plan creation. After reading, add TypeScript prop interfaces and rename the file.

- [ ] **Step 1: Read existing component files**

```bash
cat frontend/src/components/AsciiBar.jsx
cat frontend/src/components/ConfirmInline.jsx
cat frontend/src/components/EntryRow.jsx
cat frontend/src/components/Nav.jsx
cat frontend/src/components/EntryItem.jsx
```

- [ ] **Step 2: Rename and rewrite AsciiBar.tsx**

```bash
mv frontend/src/components/AsciiBar.jsx frontend/src/components/AsciiBar.tsx
```

Full content of `frontend/src/components/AsciiBar.tsx`:

```tsx
interface AsciiBarProps {
  ratio: number;
  width?: number;
}

export default function AsciiBar({ ratio, width = 20 }: AsciiBarProps) {
  const r = Math.max(0, Math.min(1, ratio || 0));
  const filled = Math.round(r * width);
  return <span className="bar">{'█'.repeat(filled)}{'░'.repeat(width - filled)}</span>;
}
```

- [ ] **Step 3: Rename and rewrite ConfirmInline.tsx**

```bash
mv frontend/src/components/ConfirmInline.jsx frontend/src/components/ConfirmInline.tsx
```

Full content of `frontend/src/components/ConfirmInline.tsx`:

```tsx
interface ConfirmInlineProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmInline({ message, onConfirm, onCancel }: ConfirmInlineProps) {
  return (
    <span className="confirm-inline">
      <span className="muted">{message}</span>
      <button className="btn danger" onClick={onConfirm}>[ YES ]</button>
      <button className="btn" onClick={onCancel}>[ NO ]</button>
    </span>
  );
}
```

*(If the current file differs, keep the original JSX and only add the typed props interface.)*

- [ ] **Step 4: Rename and rewrite Nav.tsx**

```bash
mv frontend/src/components/Nav.jsx frontend/src/components/Nav.tsx
```

Full content of `frontend/src/components/Nav.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { TimerEntry } from '../../../shared/types/index.js';

const items = [
  { to: '/',          label: 'Timer' },
  { to: '/entries',   label: 'Entries' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings',  label: 'Settings' }
];

export default function Nav() {
  const [current, setCurrent] = useState<TimerEntry | null>(null);
  const location = useLocation();

  useEffect(() => {
    api.timer.current()
      .then(({ current }) => setCurrent(current))
      .catch(() => setCurrent(null));
  }, [location.pathname]);

  const tooltip = current
    ? [current.project_name, current.description].filter(Boolean).join(' / ')
    : '';

  return (
    <nav className="nav">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => `btn${isActive ? ' active' : ''}`}
        >
          [ {it.label} ]
        </NavLink>
      ))}
      {current && (
        <div className="nav-running" data-tooltip={tooltip}>●</div>
      )}
    </nav>
  );
}
```

- [ ] **Step 5: Rename and rewrite EntryRow.tsx**

```bash
mv frontend/src/components/EntryRow.jsx frontend/src/components/EntryRow.tsx
```

Full content of `frontend/src/components/EntryRow.tsx`:

```tsx
import { fmtTimeHM, fmtDuration } from '../lib/time';
import type { Entry } from '../../../shared/types/index.js';

interface EntryRowProps {
  entry: Entry;
  badges?: string[];
}

export default function EntryRow({ entry, badges }: EntryRowProps) {
  const shown = badges ?? entry.badges ?? [];
  return (
    <div className="entry-row">
      <span className="time">
        {fmtTimeHM(entry.started_at)} — {entry.ended_at ? fmtTimeHM(entry.ended_at) : '...'}
      </span>
      <span className="dur">{fmtDuration(entry.duration_seconds ?? 0)}</span>
      <span className="proj">{entry.project_name ?? '—'}</span>
      <span className="desc">{entry.description ?? <span className="muted">(no description)</span>}</span>
      <span className="badges">
        {shown.map((b) => <span key={b} className="badge">{b}</span>)}
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Rename and type EntryItem.tsx**

```bash
mv frontend/src/components/EntryItem.jsx frontend/src/components/EntryItem.tsx
```

Full content of `frontend/src/components/EntryItem.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { fmtTimeHM, fmtDuration } from '../lib/time';
import ConfirmInline from './ConfirmInline';
import { renderDescription } from '../lib/renderDescription';
import type { Entry, Project } from '../../../shared/types/index.js';

interface EntryItemProps {
  entry: Entry;
  projects?: Project[];
  onChange?: () => void;
  onRestart?: () => void;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
}

interface Draft {
  description: string;
  project_id: number | string;
  started_at: string;
  ended_at: string;
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  return s ? new Date(s).toISOString() : null;
}

export default function EntryItem({
  entry, projects = [], onChange, onRestart, editingId, setEditingId
}: EntryItemProps) {
  const editing = editingId === entry.id;
  const [draft, setDraft] = useState<Draft>({
    description: entry.description ?? '',
    project_id: entry.project_id ?? '',
    started_at: toLocalInput(entry.started_at),
    ended_at: toLocalInput(entry.ended_at)
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showError(msg: string): void {
    if (errorTimer.current) clearTimeout(errorTimer.current);
    setError(msg);
    errorTimer.current = setTimeout(() => setError(null), 3500);
  }

  useEffect(() => {
    if (!editing) return;
    setDraft({
      description: entry.description ?? '',
      project_id: entry.project_id ?? '',
      started_at: toLocalInput(entry.started_at),
      ended_at: toLocalInput(entry.ended_at)
    });
  }, [editing]);

  async function save(): Promise<void> {
    const now = Date.now();
    const startedAt = fromLocalInput(draft.started_at) ?? entry.started_at;
    const endedAt = draft.ended_at ? fromLocalInput(draft.ended_at) : entry.ended_at;

    if (new Date(startedAt).getTime() > now) { showError('! start time cannot be in the future'); return; }
    if (endedAt && new Date(endedAt).getTime() > now) { showError('! end time cannot be in the future'); return; }
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) { showError('! end time must be after start time'); return; }

    try {
      await api.entries.update(entry.id, {
        description: draft.description,
        project_id: draft.project_id === '' ? null : Number(draft.project_id),
        started_at: startedAt,
        ended_at: endedAt
      });
      setEditingId(null);
      onChange?.();
    } catch (e) {
      showError(`! ${(e as Error).message}`);
    }
  }

  async function remove(): Promise<void> {
    await api.entries.remove(entry.id);
    onChange?.();
  }

  async function restart(): Promise<void> {
    await api.timer.start({ projectId: entry.project_id, description: entry.description ?? '' });
    onRestart?.();
  }

  const nowMax = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 1, 0, 0);
    return toLocalInput(d.toISOString());
  })();

  if (editing) {
    return (
      <div className="entry-edit">
        <div className="entry-edit-row">
          <input type="datetime-local" className="input" value={draft.started_at} max={nowMax}
            onChange={(e) => setDraft({ ...draft, started_at: e.target.value })} />
          <span className="muted">→</span>
          <input type="datetime-local" className="input" value={draft.ended_at} max={nowMax}
            onChange={(e) => setDraft({ ...draft, ended_at: e.target.value })} />
          <select className="input" value={draft.project_id}
            onChange={(e) => setDraft({ ...draft, project_id: e.target.value })}>
            <option value="">—</option>
            {projects.filter((p) => !p.archived || p.id === entry.project_id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="entry-edit-row">
          <input className="input" placeholder="description" value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })} style={{ flex: 1 }} />
          <button className="btn solid" onClick={save}>[ SAVE ]</button>
          <button className="btn" onClick={() => { setEditingId(null); setConfirmDelete(false); }}>[ CANCEL ]</button>
          {confirmDelete
            ? <ConfirmInline message="delete entry?" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
            : <button className="btn" onClick={() => setConfirmDelete(true)}>[ DELETE ]</button>}
        </div>
        {error && <div className="entry-error">{error}</div>}
      </div>
    );
  }

  return (
    <div>
      <div className="entry-row entry-clickable" onClick={() => setEditingId(entry.id)} title="Click to edit">
        <span className="time">{fmtTimeHM(entry.started_at)} — {entry.ended_at ? fmtTimeHM(entry.ended_at) : '...'}</span>
        <span className="dur">{fmtDuration(entry.duration_seconds ?? 0)}</span>
        <span className="proj">{entry.project_name ?? '—'}</span>
        <span className="desc">{renderDescription(entry.description, { links: entry.links })}</span>
        <span className="badges">
          {(entry.badges ?? []).map((b) => <span key={b} className="badge">{b}</span>)}
        </span>
        <span className="entry-actions">
          <button className="btn icon-btn" onClick={(e) => { e.stopPropagation(); restart(); }} title="Restart this task">[ ▶ ]</button>
          {confirmDelete
            ? <span onClick={(e) => e.stopPropagation()}>
                <ConfirmInline message="delete?" onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
              </span>
            : <button className="btn icon-btn" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }} title="Delete entry">[ × ]</button>}
        </span>
      </div>
    </div>
  );
}
```

*(Note: import paths drop the `.tsx`/`.ts` extension — Vite resolves extensionless imports.)*

- [ ] **Step 7: Run frontend typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: errors only from untouched `.jsx` pages (not from the component files just migrated).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/
git commit -m "chore(ts): migrate frontend components to TypeScript"
```

---

## Task 10: Migrate frontend pages, App, and main

**Files:**
- Rename all `frontend/src/pages/*.jsx` → `*.tsx`
- Rename: `frontend/src/App.jsx` → `App.tsx`
- Rename: `frontend/src/main.jsx` → `main.tsx`

- [ ] **Step 1: Read current page files**

```bash
cat frontend/src/pages/LoginPage.jsx
cat frontend/src/pages/EntriesPage.jsx
cat frontend/src/pages/DashboardPage.jsx
cat frontend/src/pages/SettingsPage.jsx
```

*(TimerPage was already reviewed — use the shared type `Entry` and `Project` from shared/types.)*

- [ ] **Step 2: Rename all pages at once**

```bash
cd frontend/src/pages
mv LoginPage.jsx LoginPage.tsx
mv TimerPage.jsx TimerPage.tsx
mv EntriesPage.jsx EntriesPage.tsx
mv DashboardPage.jsx DashboardPage.tsx
mv SettingsPage.jsx SettingsPage.tsx
```

- [ ] **Step 3: Rewrite LoginPage.tsx**

Full content of `frontend/src/pages/LoginPage.tsx`:

```tsx
import { useState } from 'react';
import { api, ApiError } from '../lib/api';

interface LoginPageProps { onLogin: () => void; }

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.auth.login(password);
      onLogin?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Tempo</h1>
        <div className="row">
          <label className="label">Password</label>
          <input className="input" type="password" autoFocus value={password}
            onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn solid" type="submit" disabled={busy || !password}>
          {busy ? '...' : '[ ENTER ]'}
        </button>
        {err && <div className="err">! {err}</div>}
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Add types to TimerPage.tsx**

Update imports to use extensionless paths. Add typed state: `useState<Entry | null>(null)` for current entry, `useState<Project[]>([])` for projects, `useState<Entry[]>([])` for entries. Import `Entry` and `Project` from `'../../../shared/types/index.js'`.

The lerpColor and favicon functions use `[number, number, number]` tuple type:
```ts
function lerpColor(
  [r1, g1, b1]: [number, number, number],
  [r2, g2, b2]: [number, number, number],
  t: number
): string { ... }

const FAVICON_COLOR_ACTIVE: [number, number, number] = [220, 38, 38];
const FAVICON_COLOR_IDLE:   [number, number, number] = [120, 120, 120];
```

The `drawFavicon(minutes, color)` function:
```ts
function drawFavicon(minutes: number | null, color: string): void { ... }
```

The `rafId` ref: `const rafId = useRef<number>(0);` (use `useRef` to store `requestAnimationFrame` return value; update the animate function to assign `rafId.current = requestAnimationFrame(animate)`).

- [ ] **Step 5: Add types to EntriesPage.tsx**

Update imports (extensionless). Add typed state using `Entry` and `Project` from shared types.

- [ ] **Step 6: Add types to DashboardPage.tsx**

Update imports (extensionless). Add typed state for stats response.

- [ ] **Step 7: Add types to SettingsPage.tsx**

Update imports (extensionless). Add `interface SettingsPageProps { onLogout: () => void }` and type the function signature.

- [ ] **Step 8: Rename and update App.tsx**

```bash
mv frontend/src/App.jsx frontend/src/App.tsx
```

Update all `.jsx` imports to extensionless. The `auth` state:
```ts
type AuthStatus = 'loading' | 'ok' | 'unauth';
interface AuthState { status: AuthStatus; user: string | null; }
const [auth, setAuth] = useState<AuthState>({ status: 'loading', user: null });
```

- [ ] **Step 9: Rename main.tsx**

```bash
mv frontend/src/main.jsx frontend/src/main.tsx
```

Update import `./App.jsx` → `./App`.

- [ ] **Step 10: Run full frontend typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/ frontend/src/App.tsx frontend/src/main.tsx
git commit -m "chore(ts): migrate frontend pages, App, and main to TypeScript"
```

---

## Task 11: Update CLAUDE.md and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md stack section**

In `CLAUDE.md`, replace:
```
- **Frontend**: React 18, Vite, React Router 6 — plain JSX, no TypeScript
```
with:
```
- **Frontend**: React 18, Vite, React Router 6 — TSX, TypeScript strict
```

Replace the `## Key conventions` line:
```
- **No TypeScript** — all source files are `.js` / `.jsx`
```
with:
```
- **TypeScript strict** — all source files are `.ts` / `.tsx`; shared types in `shared/types/`
- **Backend runtime**: `tsx watch` for dev, `tsc` → `node dist/server.js` for prod
```

Update the project structure section to replace `.js`/`.jsx` extensions with `.ts`/`.tsx`.

- [ ] **Step 2: Run complete typecheck across both packages**

```bash
cd backend && npm run typecheck && cd ../frontend && npx tsc --noEmit
```

Expected: zero errors from both.

- [ ] **Step 3: Start the full dev stack and verify the app works**

```bash
npm run dev
```

Open `http://localhost:5173` (or whatever the Vite port is) and verify:
- Login works
- Timer start/stop works
- Entries list loads
- No console errors

- [ ] **Step 4: Update Dockerfile**

The current Dockerfile copies `backend/src` and runs `node src/server.js`. After migration, backend compiles to `dist/`. Make these changes to `Dockerfile`:

In the **builder** stage, add after the npm installs:
```dockerfile
RUN cd backend && npm run build
```

In the **runtime** stage, replace:
```dockerfile
COPY backend/src ./src
```
with:
```dockerfile
COPY --from=builder /app/backend/dist ./dist
```

Change the final CMD:
```dockerfile
CMD ["node", "dist/server.js"]
```

Full runtime stage after changes:
```dockerfile
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/frontend/dist ./public

RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 5: Commit everything**

```bash
git add CLAUDE.md Dockerfile
git commit -m "chore: update CLAUDE.md and Dockerfile for TypeScript migration"
```
