import type { FastifyReply, FastifyRequest } from 'fastify';
import { accessRepo, SESSION_COOKIE, sessionRepo } from './auth.js';
import { ingestRepo } from './db.js';
import { can, isAdmin, type Permission, type User } from './permissions.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved session user, or null for anonymous requests. */
    user: User | null;
  }
}

/** Endpoints reachable without a session. */
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/session',
  '/api/branding',
  '/api/signup',
  '/api/signup/username-preview',
]);

export function isPublicPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return PUBLIC_PATHS.has(path);
}

/**
 * The only endpoints an account with provisional credentials may reach. Any
 * wider allowance would let a four-digit password do real work, which is
 * exactly what the forced change exists to prevent.
 */
const PROVISIONAL_PATHS = new Set([
  '/api/auth/session',
  '/api/auth/password',
  '/api/auth/logout',
  '/api/branding',
]);

export function isProvisionalPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return PROVISIONAL_PATHS.has(path);
}

/**
 * Resolves the session from the cookie, or from a bearer token / query param
 * for the websocket, which cannot set headers.
 */
export function resolveUser(req: FastifyRequest): User | null {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const query = (req.query as { token?: string } | undefined)?.token ?? null;
  const token = req.cookies[SESSION_COOKIE] ?? bearer ?? query;
  if (!token) return null;
  return sessionRepo.resolve(token);
}

/** Thrown-free guard: returns the user or sends 401 and returns null. */
export function requireUser(req: FastifyRequest, reply: FastifyReply): User | null {
  if (!req.user) {
    void reply.code(401).send({ error: 'Sessão expirada ou inexistente' });
    return null;
  }
  return req.user;
}

export function requirePermission(
  req: FastifyRequest,
  reply: FastifyReply,
  permission: Permission,
): User | null {
  const user = requireUser(req, reply);
  if (!user) return null;
  if (!can(user, permission)) {
    void reply.code(403).send({ error: 'Você não tem permissão para esta ação' });
    return null;
  }
  return user;
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): User | null {
  const user = requireUser(req, reply);
  if (!user) return null;
  if (!isAdmin(user)) {
    void reply.code(403).send({ error: 'Apenas administradores podem fazer isso' });
    return null;
  }
  return user;
}

/**
 * Scope check. Admins and holders of `ingest.viewAll` see everything; everyone
 * else sees only what was explicitly granted.
 */
export function canSeeIngest(user: User, ingestId: string): boolean {
  if (isAdmin(user) || can(user, 'ingest.viewAll')) return true;
  return accessRepo.has(user.id, ingestId);
}

export function visibleIngestIds(user: User): string[] {
  if (isAdmin(user) || can(user, 'ingest.viewAll')) {
    return ingestRepo.list().map((i) => i.id);
  }
  return accessRepo.listForUser(user.id);
}

/**
 * Guards an ingest-scoped action. Returns the user, or sends the right status:
 * 404 when the ingest is out of scope — an operator should not be able to probe
 * for the existence of feeds they were never granted.
 */
export function requireIngestAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  ingestId: string,
  permission?: Permission,
): User | null {
  const user = requireUser(req, reply);
  if (!user) return null;

  if (!ingestRepo.get(ingestId) || !canSeeIngest(user, ingestId)) {
    void reply.code(404).send({ error: 'Recepção não encontrada' });
    return null;
  }
  if (permission && !can(user, permission)) {
    void reply.code(403).send({ error: 'Você não tem permissão para esta ação' });
    return null;
  }
  return user;
}
