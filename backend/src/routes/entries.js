import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { diffSeconds, parseRange } from '../lib/time.js';

const listEntries = db.prepare(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso
  ORDER BY e.started_at DESC
`);

const getEntry = db.prepare(`
  SELECT e.*, p.name AS project_name, p.github_repo
  FROM time_entries e
  LEFT JOIN projects p ON p.id = e.project_id
  WHERE e.id = ?
`);

const getLinks = db.prepare(`SELECT * FROM entry_links WHERE entry_id = ?`);

const allEvents = db.prepare(`
  SELECT ref_id, event_type, repo_or_board FROM external_events
`);

function extractRefs(description) {
  if (!description) return [];
  const out = new Set();
  for (const m of description.matchAll(/(?:PR|pr|#)\s*#?(\d+)/g)) out.add(m[1]);
  return [...out];
}

function buildBadgeIndex(events) {
  const map = new Map();
  for (const ev of events) {
    const key = `${ev.repo_or_board || ''}:${ev.ref_id}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(ev.event_type);
  }
  return map;
}

function badgesFor(description, githubRepo, index) {
  if (!githubRepo) return [];
  const refs = extractRefs(description);
  if (refs.length === 0) return [];
  const types = new Set();
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

const insertLink = db.prepare(`
  INSERT INTO entry_links (entry_id, url, label) VALUES (?, ?, ?)
`);

const deleteLink = db.prepare(`DELETE FROM entry_links WHERE id = ? AND entry_id = ?`);

const deleteEntry = db.prepare(`DELETE FROM time_entries WHERE id = ?`);

function hydrate(entry, badgeIndex = null) {
  if (!entry) return null;
  return {
    ...entry,
    links: getLinks.all(entry.id),
    badges: badgeIndex ? badgesFor(entry.description, entry.github_repo, badgeIndex) : []
  };
}

export default async function entryRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async (req) => {
    const { from, to } = req.query || {};
    const { fromIso, toIso } = parseRange(from, to);
    const rows = listEntries.all({ fromIso, toIso });
    const index = buildBadgeIndex(allEvents.all());
    return { entries: rows.map((r) => hydrate(r, index)) };
  });

  fastify.get('/:id', async (req, reply) => {
    const row = getEntry.get(req.params.id);
    if (!row) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    return { entry: hydrate(row) };
  });

  fastify.patch('/:id', async (req, reply) => {
    const current = getEntry.get(req.params.id);
    if (!current) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    const next = { ...current, ...req.body };
    const startedAt = next.started_at;
    const endedAt = next.ended_at;

    const now = Date.now();
    if (new Date(startedAt).getTime() > now) {
      reply.code(400).send({ error: 'started_at cannot be in the future' });
      return;
    }
    if (endedAt && new Date(endedAt).getTime() > now) {
      reply.code(400).send({ error: 'ended_at cannot be in the future' });
      return;
    }
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      reply.code(400).send({ error: 'ended_at must be after started_at' });
      return;
    }

    const duration = endedAt ? diffSeconds(startedAt, endedAt) : null;

    db.prepare(`
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
    return { entry: hydrate(getEntry.get(current.id)) };
  });

  fastify.delete('/:id', async (req, reply) => {
    const row = getEntry.get(req.params.id);
    if (!row) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    deleteEntry.run(req.params.id);
    return { ok: true };
  });

  fastify.post('/:id/links', async (req, reply) => {
    const { url, label } = req.body || {};
    if (!url) {
      reply.code(400).send({ error: 'url required' });
      return;
    }
    const row = getEntry.get(req.params.id);
    if (!row) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    insertLink.run(req.params.id, url, label || null);
    return { entry: hydrate(getEntry.get(req.params.id)) };
  });

  fastify.delete('/:id/links/:linkId', async (req) => {
    deleteLink.run(req.params.linkId, req.params.id);
    return { entry: hydrate(getEntry.get(req.params.id)) };
  });
}
