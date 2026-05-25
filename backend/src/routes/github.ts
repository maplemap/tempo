import { request } from 'undici';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../lib/auth.js';
import { env } from '../lib/env.js';

const API = 'https://api.github.com';

async function gh(urlPath: string, token: string): Promise<unknown> {
  const res = await request(`${API}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'tempo-tracker'
    }
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`GitHub ${res.statusCode}: ${body.slice(0, 200)}`);
  }
  return res.body.json();
}

export default async function githubRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/repos', async (_req, reply) => {
    const token = env.github.token;
    if (!token) {
      reply.code(503).send({ error: 'GITHUB_TOKEN not configured' });
      return;
    }
    const data = await gh(
      '/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated',
      token
    ) as Array<{ full_name: string }>;
    return { repos: data.map((r) => r.full_name).sort() };
  });
}
