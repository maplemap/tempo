import { request } from 'undici';
import { requireAuth } from '../lib/auth.js';
import { env } from '../lib/env.js';

const API = 'https://api.github.com';

async function gh(path) {
  const res = await request(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${env.github.token}`,
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

export default async function githubRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/repos', async (_req, reply) => {
    if (!env.github.token) {
      reply.code(503).send({ error: 'GITHUB_TOKEN not configured' });
      return;
    }
    const data = await gh('/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated');
    return { repos: data.map((r) => r.full_name).sort() };
  });
}
