import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
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
import tasksRoutes from './routes/tasks.js';

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
await app.register(tasksRoutes,   { prefix: '/api/tasks' });

const publicDir = path.join(__dirname, '..', 'public');
const viteUpstream = process.env['VITE_UPSTREAM'] ?? 'http://localhost:5173';

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
  await app.register(fastifyHttpProxy, {
    upstream: viteUpstream,
    prefix: '/',
    rewritePrefix: '/',
    websocket: true,
    http2: false
  });
  app.log.info(`[dev] proxying non-/api requests to ${viteUpstream}`);
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
