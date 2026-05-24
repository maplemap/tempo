import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { nowIso, diffSeconds } from '../lib/time.js';

const getOpen = db.prepare(`
  SELECT e.*, p.name AS project_name
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.ended_at IS NULL
  ORDER BY e.started_at DESC
  LIMIT 1
`);

const insertEntry = db.prepare(`
  INSERT INTO time_entries (project_id, description, started_at)
  VALUES (@projectId, @description, @startedAt)
`);

const closeEntry = db.prepare(`
  UPDATE time_entries
  SET ended_at = @endedAt, duration_seconds = @duration
  WHERE id = @id
`);

const closeAllOpen = db.prepare(`
  UPDATE time_entries
  SET ended_at = @endedAt,
      duration_seconds = CAST((julianday(@endedAt) - julianday(started_at)) * 86400 AS INTEGER)
  WHERE ended_at IS NULL
`);

export default async function timerRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/current', async () => {
    const row = getOpen.get();
    return { current: row || null };
  });

  fastify.post('/start', async (req) => {
    const { projectId = null, description = '' } = req.body || {};
    closeAllOpen.run({ endedAt: nowIso() });
    const result = insertEntry.run({
      projectId: projectId || null,
      description,
      startedAt: nowIso()
    });
    const row = db.prepare(`
      SELECT e.*, p.name AS project_name
      FROM time_entries e
      LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.id = ?
    `).get(result.lastInsertRowid);
    return { current: row };
  });

  fastify.post('/stop', async () => {
    const open = getOpen.get();
    if (!open) return { ok: true, entryId: null, alreadyStopped: true };
    const endedAt = nowIso();
    closeEntry.run({
      endedAt,
      duration: diffSeconds(open.started_at, endedAt),
      id: open.id
    });
    return { ok: true, entryId: open.id };
  });
}
