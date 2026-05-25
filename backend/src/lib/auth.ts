import jwt from 'jsonwebtoken';
import type { FastifyInstance, FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import '@fastify/cookie';
import { env } from './env.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: jwt.JwtPayload | null;
  }
}

const COOKIE_NAME = 'tempo_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function signToken(payload: object): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '90d' });
}

export function verifyToken(token: string): jwt.JwtPayload | null {
  try {
    const result = jwt.verify(token, env.jwtSecret);
    return result as jwt.JwtPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.secureCookie,
    path: '/',
    maxAge: COOKIE_MAX_AGE
  });
}

export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function attachAuth(fastify: FastifyInstance): void {
  fastify.decorateRequest('user', null);
  fastify.addHook('preHandler', async (req: FastifyRequest) => {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return;
    const payload = verifyToken(token);
    if (payload) req.user = payload;
  });
}

export function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  if (!req.user) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  done();
}
