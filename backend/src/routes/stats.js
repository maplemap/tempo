import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { parseRange } from '../lib/time.js';

const totalsByProject = db.prepare(`
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

const totalsByDay = db.prepare(`
  SELECT date(started_at) AS day, SUM(duration_seconds) AS total
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso AND duration_seconds IS NOT NULL
  GROUP BY date(started_at)
  ORDER BY day ASC
`);

const totalAll = db.prepare(`
  SELECT SUM(duration_seconds) AS total
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso AND duration_seconds IS NOT NULL
`);

const countEvents = db.prepare(`
  SELECT event_type, COUNT(*) AS count
  FROM external_events
  WHERE occurred_at >= @fromIso AND occurred_at < @toIso
  GROUP BY event_type
`);

const entriesInRange = db.prepare(`
  SELECT id, description, started_at
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso
`);

const eventsInRange = db.prepare(`
  SELECT ref_id, ref_url, event_type, title
  FROM external_events
  WHERE occurred_at >= @fromIso AND occurred_at < @toIso
`);

function extractRefs(description) {
  if (!description) return [];
  const matches = description.match(/(?:PR|pr|#)\s*#?(\d+)/g) || [];
  return matches.map((m) => m.replace(/[^\d]/g, ''));
}

function findDiscrepancies(entries, events) {
  const eventRefs = new Set(events.map((e) => e.ref_id));
  const discrepancies = [];
  for (const entry of entries) {
    const refs = extractRefs(entry.description);
    if (refs.length === 0) continue;
    const missing = refs.filter((r) => !eventRefs.has(r));
    if (missing.length > 0) {
      discrepancies.push({
        entryId: entry.id,
        description: entry.description,
        missingRefs: missing
      });
    }
  }
  return discrepancies;
}

export default async function statsRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async (req) => {
    const { from, to } = req.query || {};
    const { fromIso, toIso } = parseRange(from, to);
    const args = { fromIso, toIso };

    const eventCounts = Object.fromEntries(
      countEvents.all(args).map((r) => [r.event_type, r.count])
    );

    const entries = entriesInRange.all(args);
    const events = eventsInRange.all(args);

    return {
      range: { from: fromIso, to: toIso },
      total: totalAll.get(args)?.total || 0,
      byProject: totalsByProject.all(args),
      byDay: totalsByDay.all(args),
      counters: {
        prs_created: eventCounts.pr_created || 0,
        reviews_done: eventCounts.pr_reviewed || 0,
        prs_merged: eventCounts.pr_merged || 0
      },
      discrepancies: findDiscrepancies(entries, events)
    };
  });
}
