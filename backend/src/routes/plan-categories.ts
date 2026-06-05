import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

interface CategoryRow {
  id: number;
  name: string;
  position: number;
  created_at: string;
}

const listAll = db.prepare<[], CategoryRow>(`
  SELECT * FROM plan_categories ORDER BY position ASC, id ASC
`);

const getOne = db.prepare<[number], CategoryRow>(`
  SELECT * FROM plan_categories WHERE id = ?
`);

const maxPos = db.prepare<[], { max: number | null }>(`
  SELECT MAX(position) AS max FROM plan_categories
`);

const insertCategory = db.prepare<{ name: string; position: number }>(`
  INSERT INTO plan_categories (name, position) VALUES (@name, @position)
`);

const updateCategory = db.prepare<{ name: string; position: number; id: number }>(`
  UPDATE plan_categories SET name = @name, position = @position WHERE id = @id
`);

const clearPlans = db.prepare<[number]>(`UPDATE plans SET category_id = NULL WHERE category_id = ?`);
const removeCategory = db.prepare<[number]>(`DELETE FROM plan_categories WHERE id = ?`);

export default async function planCategoriesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ categories: listAll.all() }));

  fastify.post<{ Body: { name: string } }>('/', async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: 'name required' });
    const max = maxPos.get()?.max ?? -1;
    const result = insertCategory.run({ name, position: max + 1 });
    return { category: getOne.get(Number(result.lastInsertRowid)) };
  });

  fastify.patch<{ Params: { id: string }; Body: { name?: string; position?: number } }>(
    '/:id',
    async (req, reply) => {
      const id = Number(req.params.id);
      const existing = getOne.get(id);
      if (!existing) return reply.code(404).send({ error: 'not found' });
      const name = req.body.name !== undefined ? req.body.name.trim() : existing.name;
      if (!name) return reply.code(400).send({ error: 'name required' });
      const position = req.body.position ?? existing.position;
      updateCategory.run({ name, position, id });
      return { category: getOne.get(id) };
    }
  );

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getOne.get(id)) return reply.code(404).send({ error: 'not found' });
    // Explicitly null out plans first — don't rely on the FK cascade.
    db.transaction(() => {
      clearPlans.run(id);
      removeCategory.run(id);
    })();
    return { ok: true };
  });
}
