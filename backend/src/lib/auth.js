import jwt from 'jsonwebtoken';
import { env } from './env.js';

const COOKIE_NAME = 'tempo_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function signToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '90d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}

export function setAuthCookie(reply, token) {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
}

export function clearAuthCookie(reply) {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function attachAuth(fastify) {
  fastify.decorateRequest('user', null);
  fastify.addHook('preHandler', async (req) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return;
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  });
}

export function requireAuth(req, reply, done) {
  if (!req.user) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  done();
}
