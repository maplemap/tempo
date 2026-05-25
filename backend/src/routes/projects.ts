import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';

interface Project {
  id: number;
  name: string;
  archived: 0 | 1;
  github_repo: string | null;
  github_base_branch: string | null;
  created_at: string;
}

const listProjects = db.prepare<[], Project>(`SELECT * FROM projects ORDER BY archived ASC, name ASC`);
const getProject   = db.prepare<[number | string], Project>(`SELECT * FROM projects WHERE id = ?`);
const insertProject = db.prepare<[string]>(`INSERT INTO projects (name) VALUES (?)`);

interface UpdateParams {
  id: number;
  name: string;
  archived: 0 | 1;
  github_repo: string | null;
  github_base_branch: string | null;
}
const updateProject = db.prepare<UpdateParams>(
  `UPDATE projects SET name = @name, archived = @archived, github_repo = @github_repo, github_base_branch = @github_base_branch WHERE id = @id`
);
const deleteProject = db.prepare<[number | string]>(`DELETE FROM projects WHERE id = ?`);

export default async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/', async () => ({ projects: listProjects.all() }));

  fastify.post<{ Body: { name?: string } }>('/', async (req, reply) => {
    const { name } = req.body;
    if (!name?.trim()) {
      reply.code(400).send({ error: 'name required' });
      return;
    }
    try {
      const result = insertProject.run(name.trim());
      return { project: getProject.get(Number(result.lastInsertRowid)) };
    } catch (err) {
      if (String((err as Error).message).includes('UNIQUE')) {
        reply.code(409).send({ error: 'project name exists' });
        return;
      }
      throw err;
    }
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<Project> }>('/:id', async (req, reply) => {
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
      github_repo: next.github_repo ?? null,
      github_base_branch: next.github_base_branch ?? null
    });
    return { project: getProject.get(current.id) };
  });

  fastify.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const row = getProject.get(req.params.id);
    if (!row) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    deleteProject.run(req.params.id);
    return { ok: true };
  });
}
