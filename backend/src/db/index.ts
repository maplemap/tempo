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

// Backfill: create tasks from unique (description, project_id) pairs in existing entries
const taskCount = (db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get() as { n: number }).n;
if (taskCount === 0) {
  const pairs = db.prepare(`
    SELECT TRIM(description) AS name, project_id
    FROM time_entries
    WHERE description IS NOT NULL AND TRIM(description) != ''
    GROUP BY LOWER(TRIM(description)), project_id IS NULL, COALESCE(project_id, -1)
  `).all() as Array<{ name: string; project_id: number | null }>;

  if (pairs.length > 0) {
    const insertTask  = db.prepare(`INSERT INTO tasks (name, project_id) VALUES (?, ?)`);
    const linkEntries = db.prepare(`
      UPDATE time_entries SET task_id = ?
      WHERE task_id IS NULL AND LOWER(TRIM(description)) = LOWER(?) AND project_id IS ?
    `);
    const linkPlans   = db.prepare(`
      UPDATE plans SET task_id = ?
      WHERE task_id IS NULL AND LOWER(TRIM(text)) = LOWER(?) AND project_id IS ?
    `);

    db.transaction(() => {
      for (const { name, project_id } of pairs) {
        const { lastInsertRowid: tid } = insertTask.run(name, project_id);
        linkEntries.run(tid, name, project_id);
        linkPlans.run(tid, name, project_id);
      }
    })();
    console.log(`[db] backfilled ${pairs.length} tasks from existing entries`);
  }
}

// Backfill: categorize all existing entries on first run after the migration.
const categorized = (db.prepare(
  `SELECT COUNT(*) AS n FROM time_entries WHERE category != 'task'`
).get() as { n: number }).n;

if (categorized === 0) {
  const rows = db.prepare(`
    SELECT e.id, e.description, t.name AS task_name
    FROM time_entries e
    LEFT JOIN tasks t ON t.id = e.task_id
  `).all() as Array<{ id: number; description: string | null; task_name: string | null }>;

  if (rows.length > 0) {
    const updateCategory = db.prepare(`UPDATE time_entries SET category = ? WHERE id = ?`);
    db.transaction((items: typeof rows) => {
      for (const r of items) {
        updateCategory.run(categorizeEntry(r.task_name, r.description), r.id);
      }
    })(rows);
    console.log(`[db] backfilled categories for ${rows.length} entries`);
  }
}

console.log(`[db] using ${dbFile}`);
