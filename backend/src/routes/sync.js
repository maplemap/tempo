import { db } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { syncGitHub } from '../lib/sync/github.js';

const listState = db.prepare(`SELECT * FROM sync_state`);

const upsertState = db.prepare(`
  INSERT INTO sync_state (source, last_synced_at, last_error)
  VALUES (@source, @last_synced_at, @last_error)
  ON CONFLICT(source) DO UPDATE SET
    last_synced_at = excluded.last_synced_at,
    last_error     = excluded.last_error
`);

export async function runGitHubSync() {
  try {
    const result = await syncGitHub();
    upsertState.run({
      source: 'github',
      last_synced_at: new Date().toISOString(),
      last_error: null
    });
    return { ok: true, result };
  } catch (err) {
    upsertState.run({
      source: 'github',
      last_synced_at: new Date().toISOString(),
      last_error: err.message
    });
    throw err;
  }
}

export default async function syncRoutes(fastify) {
  fastify.addHook('preHandler', requireAuth);

  fastify.get('/state', async () => ({ state: listState.all() }));

  fastify.post('/run', async (_req, reply) => {
    try {
      const out = await runGitHubSync();
      return out;
    } catch (err) {
      reply.code(500).send({ error: err.message });
    }
  });
}
