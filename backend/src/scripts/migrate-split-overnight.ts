import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../../data/tempo.db');
const db = new Database(dbPath);

interface EntryRow {
  id: number;
  project_id: number | null;
  description: string | null;
  category: string;
  category_manual: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
}

function midnightsBetween(start: Date, end: Date): Date[] {
  const midnights: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(24, 0, 0, 0);
  while (cursor < end) {
    midnights.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return midnights;
}

function diffSeconds(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000);
}

const overnight = db.prepare<[], EntryRow>(`
  SELECT id, project_id, description, category, category_manual, started_at, ended_at,
    CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER) as duration_seconds
  FROM time_entries
  WHERE ended_at IS NOT NULL
    AND date(started_at, 'localtime') != date(ended_at, 'localtime')
  ORDER BY started_at
`).all();

if (overnight.length === 0) {
  console.log('No overnight entries found — nothing to migrate.');
  process.exit(0);
}

console.log(`Found ${overnight.length} overnight entries to split:`);

const updateEntry = db.prepare(`
  UPDATE time_entries SET ended_at = @endedAt, duration_seconds = @duration WHERE id = @id
`);

const insertEntry = db.prepare(`
  INSERT INTO time_entries (project_id, description, started_at, ended_at, duration_seconds, category, category_manual)
  VALUES (@projectId, @description, @startedAt, @endedAt, @duration, @category, @categoryManual)
`);

const migrate = db.transaction(() => {
  for (const entry of overnight) {
    const start = new Date(entry.started_at);
    const end = new Date(entry.ended_at);
    const midnights = midnightsBetween(start, end);

    console.log(`  Entry ${entry.id}: ${entry.started_at} → ${entry.ended_at} (${midnights.length} split points)`);

    const firstMidnight = midnights[0].toISOString();
    updateEntry.run({ endedAt: firstMidnight, duration: diffSeconds(entry.started_at, firstMidnight), id: entry.id });

    for (let i = 0; i < midnights.length - 1; i++) {
      const segStart = midnights[i].toISOString();
      const segEnd = midnights[i + 1].toISOString();
      insertEntry.run({ projectId: entry.project_id, description: entry.description, startedAt: segStart, endedAt: segEnd, duration: diffSeconds(segStart, segEnd), category: entry.category, categoryManual: entry.category_manual });
    }

    const lastStart = midnights[midnights.length - 1].toISOString();
    insertEntry.run({ projectId: entry.project_id, description: entry.description, startedAt: lastStart, endedAt: entry.ended_at, duration: diffSeconds(lastStart, entry.ended_at), category: entry.category, categoryManual: entry.category_manual });
  }
});

migrate();
console.log('Migration complete.');
