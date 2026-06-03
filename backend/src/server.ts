import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import middie from '@fastify/middie';
import cron from 'node-cron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { env } from './lib/env.js';
import { attachAuth } from './lib/auth.js';
import './db/index.js';

import authRoutes from './routes/auth.js';
import timerRoutes from './routes/timer.js';
import entryRoutes from './routes/entries.js';
import projectRoutes from './routes/projects.js';
import statsRoutes from './routes/stats.js';
import syncRoutes, { runGitHubSync } from './routes/sync.js';
import githubRoutes from './routes/github.js';
import plansRoutes from './routes/plans.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: env.isProduction ? 'info' : 'debug' } });

await app.register(cookie);
attachAuth(app);

app.get('/health', async () => ({ ok: true }));

await app.register(authRoutes,    { prefix: '/api/auth' });
await app.register(timerRoutes,   { prefix: '/api/timer' });
await app.register(entryRoutes,   { prefix: '/api/entries' });
await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(statsRoutes,   { prefix: '/api/stats' });
await app.register(syncRoutes,    { prefix: '/api/sync' });
await app.register(githubRoutes,  { prefix: '/api/github' });
await app.register(plansRoutes,   { prefix: '/api/plans' });

const publicDir = path.join(__dirname, '..', 'public');

if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    return reply.sendFile('index.html');
  });
} else {
  await app.register(middie);
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: new URL('../../frontend', import.meta.url).pathname,
    server: { middlewareMode: true, hmr: { server: app.server } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.log.info('[dev] Vite middleware mounted — port 5173 not used');
}

try {
  await app.listen({ port: env.port, host: '0.0.0.0' });
  console.log(`[tempo] listening on :${env.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

if (env.github.token) {
  const expr = `*/${env.syncIntervalMinutes} * * * *`;
  cron.schedule(expr, () => {
    runGitHubSync().catch((err: Error) => app.log.error({ err: err.message }, '[sync] github failed'));
  });
  app.log.info(`[sync] github scheduled every ${env.syncIntervalMinutes}m`);
  runGitHubSync().catch((err: Error) => app.log.warn({ err: err.message }, '[sync] initial github run failed'));
}
