import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { diffSeconds, parseRange } from '../lib/time.js';
import { autoLinkPRs } from '../lib/autolink.js';

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

interface EntryLink {
  id: number;
  entry_id: number;
  url: string;
  label: string | null;
}

interface Entry extends DbEntry {
  links: EntryLink[];
  badges: string[];
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
