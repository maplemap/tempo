import { env } from '../lib/env.js';
import { signToken, setAuthCookie, clearAuthCookie } from '../lib/auth.js';

export default async function authRoutes(fastify) {
  fastify.post('/login', async (req, reply) => {
    const { password } = req.body || {};
    if (!password || password !== env.adminPassword) {
      reply.code(401).send({ error: 'invalid password' });
      return;
    }
    const token = signToken({ sub: 'admin' });
    setAuthCookie(reply, token);
    return { ok: true };
  });

  fastify.post('/logout', async (_req, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  fastify.get('/me', async (req, reply) => {
    if (!req.user) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    return { user: req.user.sub };
  });
}
