// scripts/demo-seed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('../backend/node_modules/better-sqlite3');

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
