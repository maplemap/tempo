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
