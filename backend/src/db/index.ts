import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../lib/env.js';
import { categorizeEntry } from '../lib/categorize.js';

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
try { db.exec(`ALTER TABLE time_entries ADD COLUMN task_id INTEGER REFERENCES tasks(id)`); } catch {}
try { db.exec(`ALTER TABLE plans ADD COLUMN task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category TEXT NOT NULL DEFAULT 'task'`); } catch {}
try { db.exec(`ALTER TABLE time_entries ADD COLUMN category_manual INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_entries_category_started ON time_entries(category, started_at)`); } catch {}

// Remove tasks: null out FKs, drop the table, then rebuild tables to remove broken FK constraints
try {
  db.exec(`UPDATE time_entries SET task_id = NULL`);
  db.exec(`UPDATE plans SET task_id = NULL`);
  db.exec(`DROP TABLE IF EXISTS tasks`);
} catch {}

// Rebuild time_entries without task_id→tasks FK (broken after tasks table drop).
// Uses legacy_alter_table=ON so SQLite does NOT auto-update FK refs in entry_links on rename.
const timeFkCount = (db.prepare(
  `SELECT COUNT(*) AS n FROM pragma_foreign_key_list('time_entries') WHERE "table" = 'tasks'`
).get() as { n: number }).n;
if (timeFkCount > 0) {
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.exec(`
    CREATE TABLE time_entries_new (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      description      TEXT,
      started_at       TEXT NOT NULL,
      ended_at         TEXT,
      duration_seconds INTEGER,
      task_id          INTEGER,
      category         TEXT NOT NULL DEFAULT 'task',
      category_manual  INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO time_entries_new SELECT * FROM time_entries;
    DROP TABLE time_entries;
    ALTER TABLE time_entries_new RENAME TO time_entries;
    CREATE INDEX IF NOT EXISTS idx_entries_started ON time_entries(started_at);
    CREATE INDEX IF NOT EXISTS idx_entries_open ON time_entries(ended_at) WHERE ended_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_entries_category_started ON time_entries(category, started_at);
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
  console.log('[db] rebuilt time_entries without tasks FK');
}

// Rebuild plans without task_id→tasks FK
const planFkCount = (db.prepare(
  `SELECT COUNT(*) AS n FROM pragma_foreign_key_list('plans') WHERE "table" = 'tasks'`
).get() as { n: number }).n;
if (planFkCount > 0) {
  db.pragma('foreign_keys = OFF');
  db.pragma('legacy_alter_table = ON');
  db.exec(`
    CREATE TABLE plans_new (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id),
      task_id    INTEGER,
      text       TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      done       INTEGER NOT NULL DEFAULT 0,
      done_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO plans_new SELECT * FROM plans;
    DROP TABLE plans;
    ALTER TABLE plans_new RENAME TO plans;
  `);
  db.pragma('legacy_alter_table = OFF');
  db.pragma('foreign_keys = ON');
  console.log('[db] rebuilt plans without tasks FK');
}

// Backfill: categorize all existing entries on first run after the migration.
const categorized = (db.prepare(
  `SELECT COUNT(*) AS n FROM time_entries WHERE category != 'task'`
).get() as { n: number }).n;

if (categorized === 0) {
  const rows = db.prepare(`
    SELECT id, description FROM time_entries
  `).all() as Array<{ id: number; description: string | null }>;

  if (rows.length > 0) {
    const updateCategory = db.prepare(`UPDATE time_entries SET category = ? WHERE id = ?`);
    db.transaction((items: typeof rows) => {
      for (const r of items) {
        updateCategory.run(categorizeEntry(r.description), r.id);
      }
    })(rows);
    console.log(`[db] backfilled categories for ${rows.length} entries`);
  }
}

console.log(`[db] using ${dbFile}`);
