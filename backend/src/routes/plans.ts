import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

interface PlanRow {
  id: number;
  project_id: number | null;
  task_id: number | null;
  category_id: number | null;
  project_name: string | null;
  text: string;
  position: number;
  done: 0 | 1;
  done_at: string | null;
  created_at: string;
}

const listAll = db.prepare<[], PlanRow>(`
  SELECT pl.*, pr.name AS project_name
  FROM plans pl
  LEFT JOIN projects pr ON pr.id = pl.project_id
  ORDER BY pl.done ASC, pl.position ASC, pl.done_at DESC
`);

const getOne = db.prepare<[number], PlanRow>(`
  SELECT pl.*, pr.name AS project_name
  FROM plans pl
  LEFT JOIN projects pr ON pr.id = pl.project_id
  WHERE pl.id = ?
`);

const maxOpenPos = db.prepare<[], { max: number | null }>(`
  SELECT MAX(position) AS max FROM plans WHERE done = 0
`);

const insertPlan = db.prepare<{ projectId: number | null; taskId: number | null; categoryId: number | null; text: string; position: number }>(`
  INSERT INTO plans (project_id, task_id, category_id, text, position)
  VALUES (@projectId, @taskId, @categoryId, @text, @position)
`);

const updatePlan = db.prepare<{
  done: number; doneAt: string | null; text: string;
  projectId: number | null; taskId: number | null; categoryId: number | null; id: number;
}>(`
  UPDATE plans SET done = @done, done_at = @doneAt, text = @text,
    project_id = @projectId, task_id = @taskId, category_id = @categoryId WHERE id = @id
`);

const setPosition = db.prepare<{ position: number; id: number }>(`
  UPDATE plans SET position = @position WHERE id = @id
`);

const removePlan = db.prepare<[number]>(`DELETE FROM plans WHERE id = ?`);

export default async function plansRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ plans: listAll.all() }));

  fastify.post<{ Body: { project_id?: number | null; task_id?: number | null; category_id?: number | null; text: string } }>(
    '/',
    async (req, reply) => {
      const { project_id = null, task_id = null, category_id = null, text } = req.body;
      if (!text?.trim()) return reply.code(400).send({ error: 'text required' });
      const max = maxOpenPos.get()?.max ?? -1;
      const result = insertPlan.run({
        projectId: project_id ?? null,
        taskId: task_id ?? null,
        categoryId: category_id ?? null,
        text: text.trim(),
        position: max + 1,
      });
      return { plan: getOne.get(Number(result.lastInsertRowid)) };
    }
  );

  fastify.patch<{ Body: { ids: number[] } }>('/reorder', async (req, reply) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return reply.code(400).send({ error: 'ids required' });
    db.transaction((orderedIds: number[]) => {
      orderedIds.forEach((id, i) => setPosition.run({ position: i, id }));
    })(ids);
    return { ok: true };
  });

  fastify.patch<{
    Params: { id: string };
    Body: { done?: boolean; text?: string; project_id?: number | null; task_id?: number | null; category_id?: number | null };
  }>(
    '/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = getOne.get(id);
      if (!existing) return reply.code(404).send({ error: 'not found' });

      const done       = req.body.done !== undefined ? (req.body.done ? 1 : 0) : existing.done;
      const doneAt     = done && !existing.done ? new Date().toISOString() : (done ? existing.done_at : null);
      const text       = req.body.text ?? existing.text;
      const projectId  = req.body.project_id !== undefined ? req.body.project_id : existing.project_id;
      const taskId     = req.body.task_id !== undefined ? req.body.task_id : existing.task_id;
      const categoryId = req.body.category_id !== undefined ? req.body.category_id : existing.category_id;

      updatePlan.run({ done, doneAt, text, projectId: projectId ?? null, taskId: taskId ?? null, categoryId: categoryId ?? null, id });
      return { plan: getOne.get(id) };
    }
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getOne.get(id)) return reply.code(404).send({ error: 'not found' });
    removePlan.run(id);
    return { ok: true };
  });
}
