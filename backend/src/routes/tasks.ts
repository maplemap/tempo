import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

interface TaskRow {
  id: number;
  name: string;
  project_id: number | null;
  created_at: string;
}

const listAll  = db.prepare<[], TaskRow>(`SELECT * FROM tasks ORDER BY name ASC`);
const getOne   = db.prepare<[number | bigint], TaskRow>(`SELECT * FROM tasks WHERE id = ?`);
const insert   = db.prepare<[string, number | null]>(`INSERT INTO tasks (name, project_id) VALUES (?, ?)`);
const remove   = db.prepare<[number]>(`DELETE FROM tasks WHERE id = ?`);

export default async function tasksRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ tasks: listAll.all() }));

  fastify.post<{ Body: { name: string; project_id?: number | null } }>('/', async (req, reply) => {
    const { name, project_id = null } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'name required' });
    const { lastInsertRowid } = insert.run(name.trim(), project_id ?? null);
    return { task: getOne.get(lastInsertRowid)! };
  });

  fastify.patch<{ Params: { id: string }; Body: { name?: string; project_id?: number | null } }>(
    '/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const task = getOne.get(id);
      if (!task) return reply.code(404).send({ error: 'not found' });

      const newName      = req.body.name !== undefined ? req.body.name.trim() : task.name;
      const newProjectId = req.body.project_id !== undefined ? req.body.project_id : task.project_id;
      if (!newName) return reply.code(400).send({ error: 'name required' });

      db.transaction(() => {
        db.prepare(`UPDATE tasks SET name = ?, project_id = ? WHERE id = ?`).run(newName, newProjectId, id);
        db.prepare(`UPDATE time_entries SET description = ? WHERE task_id = ?`).run(newName, id);
        db.prepare(`UPDATE plans SET text = ? WHERE task_id = ?`).run(newName, id);
      })();

      return { task: getOne.get(id)! };
    }
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getOne.get(id)) return reply.code(404).send({ error: 'not found' });
    db.prepare(`UPDATE time_entries SET task_id = NULL WHERE task_id = ?`).run(id);
    db.prepare(`UPDATE plans SET task_id = NULL WHERE task_id = ?`).run(id);
    remove.run(id);
    return { ok: true };
  });
}
