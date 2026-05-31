import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { diffSeconds, parseRange } from '../lib/time.js';
import { autoLinkPRs } from '../lib/autolink.js';
import { categorizeEntry, isCategory } from '../lib/categorize.js';
import type { Category } from '../lib/categorize.js';

interface DbEntry {
  id: number;
  project_id: number | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  category: Category;
  category_manual: 0 | 1;
  project_name: string | null;
  github_repo: string | null;
}

interface EntryLink {
  id: number;
  entry_id: number;
  url: string;
  label: string | null;
}

interface Entry extends DbEntry {
  links: EntryLink[];
}

interface RangeParams { fromIso: string; toIso: string; }
interface RangePageParams extends RangeParams { limit: number; offset: number; }

const listEntries = db.prepare<RangePageParams, DbEntry>(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso
  ORDER BY e.started_at DESC
  LIMIT @limit OFFSET @offset
`);

const countEntries = db.prepare<RangeParams, { count: number }>(`
  SELECT COUNT(*) AS count FROM time_entries e
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso
`);

const getEntry = db.prepare<[number | string], DbEntry>(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.id = ?
`);

const getLinks = db.prepare<[number], EntryLink>(`SELECT * FROM entry_links WHERE entry_id = ?`);
const insertLink = db.prepare<[number | string, string, string | null]>(
  `INSERT INTO entry_links (entry_id, url, label) VALUES (?, ?, ?)`
);
const deleteLink = db.prepare<[number | string, number | string]>(
  `DELETE FROM entry_links WHERE id = ? AND entry_id = ?`
);
const deleteEntry = db.prepare<[number | string]>(`DELETE FROM time_entries WHERE id = ?`);

function hydrate(entry: DbEntry): Entry {
  return { ...entry, links: getLinks.all(entry.id) };
}

export default async function entryRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get<{ Querystring: { from?: string; to?: string; limit?: string; offset?: string } }>('/', async (req) => {
    const { from, to, limit: limitStr, offset: offsetStr } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const limit = limitStr ? parseInt(limitStr, 10) : 100000;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    const rows = listEntries.all({ fromIso, toIso, limit, offset });
    const total = countEntries.get({ fromIso, toIso })!.count;
    const hasMore = offset + limit < total;
    return { entries: rows.map(hydrate), hasMore };
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

    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      reply.code(400).send({ error: 'ended_at must be after start' }); return;
    }

    const duration = endedAt ? diffSeconds(startedAt, endedAt) : null;

    let nextCategory: Category = current.category;
    if (!current.category_manual && next.description !== current.description) {
      nextCategory = categorizeEntry(next.description ?? null);
    }

    db.prepare<{
      id: number; project_id: number | null; description: string;
      started_at: string; ended_at: string | null; duration_seconds: number | null; category: Category;
    }>(`
      UPDATE time_entries
      SET project_id = @project_id,
          description = @description,
          started_at = @started_at,
          ended_at = @ended_at,
          duration_seconds = @duration_seconds,
          category = @category
      WHERE id = @id
    `).run({
      id: current.id,
      project_id: next.project_id ?? null,
      description: next.description ?? '',
      started_at: startedAt,
      ended_at: endedAt ?? null,
      duration_seconds: duration,
      category: nextCategory,
    });

    // Bulk rename: update all other entries with the same old description
    if (next.description !== current.description && next.description && current.description) {
      const newCat = categorizeEntry(next.description);
      db.prepare(`
        UPDATE time_entries
        SET description = ?,
            category = CASE WHEN category_manual = 0 THEN ? ELSE category END
        WHERE id != ? AND LOWER(TRIM(description)) = LOWER(TRIM(?))
      `).run(next.description, newCat, current.id, current.description);
    }

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

  fastify.patch<{ Params: { id: string }; Body: { category?: unknown } }>(
    '/:id/category',
    async (req, reply) => {
      const current = getEntry.get(req.params.id);
      if (!current) { reply.code(404).send({ error: 'not found' }); return; }

      const value = req.body?.category;

      if (value === null) {
        // Reset to auto: recompute from current description.
        const auto = categorizeEntry(current.description);
        db.prepare(`UPDATE time_entries SET category = ?, category_manual = 0 WHERE id = ?`)
          .run(auto, current.id);
      } else if (isCategory(value)) {
        db.prepare(`UPDATE time_entries SET category = ?, category_manual = 1 WHERE id = ?`)
          .run(value, current.id);
      } else {
        reply.code(400).send({ error: 'invalid category' });
        return;
      }

      const final = getEntry.get(current.id);
      return { entry: final ? hydrate(final) : null };
    }
  );

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
