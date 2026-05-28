import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { parseRange } from '../lib/time.js';
import type { Category } from '../lib/categorize.js';

interface RangeParams { fromIso: string; toIso: string; }

interface ProjectTotal { project_name: string; project_id: number | null; total: number; }
interface DayTotal { day: string; total: number; }
interface TotalAll { total: number | null; }
interface EventCount { event_type: string; count: number; }
interface EntryRef { id: number; description: string | null; started_at: string; }
interface EventRef { ref_id: string; ref_url: string; event_type: string; title: string | null; }

const totalsByProject = db.prepare<RangeParams, ProjectTotal>(`
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

const totalsByDay = db.prepare<RangeParams, DayTotal>(`
  SELECT date(started_at) AS day, SUM(duration_seconds) AS total
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso AND duration_seconds IS NOT NULL
  GROUP BY date(started_at)
  ORDER BY day ASC
`);

const totalAll = db.prepare<RangeParams, TotalAll>(`
  SELECT SUM(duration_seconds) AS total
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso AND duration_seconds IS NOT NULL
`);

const countEvents = db.prepare<RangeParams, EventCount>(`
  SELECT event_type, COUNT(*) AS count
  FROM external_events
  WHERE occurred_at >= @fromIso AND occurred_at < @toIso
  GROUP BY event_type
`);

const entriesInRange = db.prepare<RangeParams, EntryRef>(`
  SELECT id, description, started_at
  FROM time_entries
  WHERE started_at >= @fromIso AND started_at < @toIso
`);

const eventsInRange = db.prepare<RangeParams, EventRef>(`
  SELECT ref_id, ref_url, event_type, title
  FROM external_events
  WHERE occurred_at >= @fromIso AND occurred_at < @toIso
`);

interface ByCategoryRow {
  category: Category;
  task_id: number | null;
  task_name: string | null;
  entry_id: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  description: string | null;
}

const entriesForByCategory = db.prepare<RangeParams, ByCategoryRow>(`
  SELECT
    e.category                  AS category,
    e.task_id                   AS task_id,
    t.name                      AS task_name,
    e.id                        AS entry_id,
    e.started_at                AS started_at,
    e.ended_at                  AS ended_at,
    COALESCE(e.duration_seconds, 0) AS duration_seconds,
    e.description               AS description
  FROM time_entries e
  LEFT JOIN tasks t ON t.id = e.task_id
  WHERE e.started_at >= @fromIso AND e.started_at < @toIso AND e.duration_seconds IS NOT NULL
  ORDER BY e.started_at DESC
`);

function extractRefs(description: string | null): string[] {
  if (!description) return [];
  const matches = description.match(/(?:PR|pr|#)\s*#?(\d+)/g) ?? [];
  return matches.map((m) => m.replace(/[^\d]/g, ''));
}

interface Discrepancy {
  entryId: number;
  description: string | null;
  missingRefs: string[];
}

function findDiscrepancies(entries: EntryRef[], events: EventRef[]): Discrepancy[] {
  const eventRefs = new Set(events.map((e) => e.ref_id));
  const discrepancies: Discrepancy[] = [];
  for (const entry of entries) {
    const refs = extractRefs(entry.description);
    if (refs.length === 0) continue;
    const missing = refs.filter((r) => !eventRefs.has(r));
    if (missing.length > 0) {
      discrepancies.push({ entryId: entry.id, description: entry.description, missingRefs: missing });
    }
  }
  return discrepancies;
}

export default async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get<{ Querystring: { from?: string; to?: string } }>('/', async (req) => {
    const { from, to } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const args: RangeParams = { fromIso, toIso };

    const eventCounts = Object.fromEntries(
      countEvents.all(args).map((r) => [r.event_type, r.count])
    );

    return {
      range: { from: fromIso, to: toIso },
      total: totalAll.get(args)?.total ?? 0,
      byProject: totalsByProject.all(args),
      byDay: totalsByDay.all(args),
      counters: {
        prs_created:  eventCounts['pr_created']  ?? 0,
        reviews_done: eventCounts['pr_reviewed'] ?? 0,
        prs_merged:   eventCounts['pr_merged']   ?? 0
      },
      discrepancies: findDiscrepancies(entriesInRange.all(args), eventsInRange.all(args))
    };
  });

  fastify.get<{ Querystring: { from?: string; to?: string } }>('/by-category', async (req) => {
    const { from, to } = req.query;
    const { fromIso, toIso } = parseRange(from, to);
    const rows = entriesForByCategory.all({ fromIso, toIso });

    interface EntryOut {
      id: number;
      started_at: string;
      ended_at: string | null;
      duration_seconds: number;
      description: string | null;
    }
    interface TaskOut {
      task_id: number | null;
      task_name: string | null;
      total: number;
      entries: EntryOut[];
    }
    interface CategoryOut {
      category: Category;
      total: number;
      tasks: TaskOut[];
    }

    const catMap = new Map<Category, Map<string, TaskOut>>();
    let grandTotal = 0;

    for (const r of rows) {
      grandTotal += r.duration_seconds;
      if (!catMap.has(r.category)) catMap.set(r.category, new Map());
      const taskKey = r.task_id == null ? 'null' : String(r.task_id);
      const taskMap = catMap.get(r.category)!;
      if (!taskMap.has(taskKey)) {
        taskMap.set(taskKey, {
          task_id: r.task_id,
          task_name: r.task_name,
          total: 0,
          entries: [],
        });
      }
      const t = taskMap.get(taskKey)!;
      t.total += r.duration_seconds;
      t.entries.push({
        id: r.entry_id,
        started_at: r.started_at,
        ended_at: r.ended_at,
        duration_seconds: r.duration_seconds,
        description: r.description,
      });
    }

    const categories: CategoryOut[] = [...catMap.entries()].map(([category, taskMap]) => {
      const tasks = [...taskMap.values()].sort((a, b) => b.total - a.total);
      const total = tasks.reduce((s, t) => s + t.total, 0);
      return { category, total, tasks };
    }).sort((a, b) => b.total - a.total);

    return {
      range: { from: fromIso, to: toIso },
      total: grandTotal,
      categories,
    };
  });
}
