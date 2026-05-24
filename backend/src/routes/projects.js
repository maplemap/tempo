import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

const listProjects = db.prepare(`SELECT * FROM projects ORDER BY archived ASC, name ASC`);
const getProject = db.prepare(`SELECT * FROM projects WHERE id = ?`);
const insertProject = db.prepare(`INSERT INTO projects (name) VALUES (?)`);
const updateProject = db.prepare(`UPDATE projects SET name = @name, archived = @archived, github_repo = @github_repo WHERE id = @id`);
const deleteProject = db.prepare(`DELETE FROM projects WHERE id = ?`);

export default async function projectRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ projects: listProjects.all() }));

  fastify.post('/', async (req, reply) => {
    const { name } = req.body || {};
    if (!name?.trim()) {
      reply.code(400).send({ error: 'name required' });
      return;
    }
    try {
      const result = insertProject.run(name.trim());
      return { project: getProject.get(result.lastInsertRowid) };
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        reply.code(409).send({ error: 'project name exists' });
        return;
      }
      throw err;
    }
  });

  fastify.patch('/:id', async (req, reply) => {
    const current = getProject.get(req.params.id);
    if (!current) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    const next = { ...current, ...req.body };
    updateProject.run({
      id: current.id,
      name: next.name,
      archived: next.archived ? 1 : 0,
      github_repo: next.github_repo ?? null
    });
    return { project: getProject.get(current.id) };
  });

  fastify.delete('/:id', async (req, reply) => {
    const row = getProject.get(req.params.id);
    if (!row) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    deleteProject.run(req.params.id);
    return { ok: true };
  });
}
