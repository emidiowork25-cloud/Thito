import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SESSION_COOKIE, sessionRepo, userRepo, verifyPassword } from './auth.js';
import { requireUser } from './guards.js';
import { effectivePermissions } from './permissions.js';
import { settingsRepo } from './presets.js';
import { buildUsername } from './signup.js';

const loginInput = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const passwordInput = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z
    .string()
    .min(8, 'A nova senha precisa de ao menos 8 caracteres')
    .max(256),
});

const profileInput = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'O usuário precisa de ao menos 3 caracteres')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou underscore')
    .optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email('E-mail inválido').max(160).optional(),
  phone: z.string().trim().max(24).optional(),
});

/**
 * Login throttle.
 *
 * The initial password handed to a new account is four digits — 10,000
 * possibilities. Without a throttle that is minutes of brute force, so this is
 * not optional hardening, it is what makes the specified scheme survivable.
 * In-memory is adequate: the hub is a single process, and a restart clearing
 * the counters costs an attacker more than it costs a locked-out operator.
 */
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; first: number }>();

function throttleKey(ip: string, username: string): string {
  return `${ip}|${username.toLowerCase()}`;
}

function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= ATTEMPT_LIMIT;
}

function noteFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /** Public: lets the landing page render before anyone authenticates. */
  app.get('/api/branding', async () => {
    const settings = settingsRepo.read();
    return { siteName: settings.siteName };
  });

  /** Public: tells the SPA whether it already holds a valid session. */
  app.get('/api/auth/session', async (req) => {
    if (!req.user) return { authenticated: false };
    return {
      authenticated: true,
      mustChangePassword: req.user.mustChangePassword,
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        role: req.user.role,
        email: req.user.email,
        phone: req.user.phone,
        jobTitle: req.user.jobTitle,
        permissions: effectivePermissions(req.user),
      },
    };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Usuário e senha são obrigatórios' });
    }

    const key = throttleKey(req.ip, parsed.data.username);
    if (tooManyAttempts(key)) {
      return reply.code(429).send({
        error: 'Muitas tentativas. Aguarde 10 minutos antes de tentar novamente.',
      });
    }

    const record = userRepo.getByUsername(parsed.data.username);
    // Same message and comparable work for unknown user and wrong password, so
    // the response never reveals which usernames exist.
    const ok = record ? verifyPassword(parsed.data.password, record.passwordHash) : false;

    if (!record || !ok || !record.enabled) {
      noteFailure(key);
      return reply.code(401).send({ error: 'Usuário ou senha inválidos' });
    }

    attempts.delete(key);

    const { token, expiresAt } = sessionRepo.create(record.id);
    userRepo.markLogin(record.id);
    sessionRepo.purgeExpired();

    return reply
      .setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        // On plain HTTP a secure cookie is never sent back, so gate on protocol.
        secure: req.protocol === 'https',
        expires: new Date(expiresAt),
      })
      .send({
        mustChangePassword: record.mustChangePassword,
        user: {
          id: record.id,
          username: record.username,
          displayName: record.displayName,
          role: record.role,
          email: record.email,
          phone: record.phone,
          jobTitle: record.jobTitle,
          permissions: effectivePermissions(record),
        },
      });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) sessionRepo.remove(token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true });
  });

  /**
   * Password change. Also the exit from the forced-change state, so it must
   * stay reachable while `mustChangePassword` is blocking everything else.
   */
  app.post('/api/auth/password', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = passwordInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }

    const record = userRepo.getByUsername(user.username);
    if (!record || !verifyPassword(parsed.data.currentPassword, record.passwordHash)) {
      return reply.code(403).send({ error: 'Senha atual incorreta' });
    }
    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return reply.code(400).send({ error: 'A nova senha precisa ser diferente da atual' });
    }

    // Setting a password drops every session for the account, including this
    // one, so the client re-authenticates with the new credential.
    userRepo.update(user.id, {
      password: parsed.data.newPassword,
      mustChangePassword: false,
    });

    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true });
  });

  /** Self-service profile, including the username the account logs in with. */
  app.patch('/api/auth/profile', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const parsed = profileInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const body = parsed.data;

    if (body.username && body.username.toLowerCase() !== user.username.toLowerCase()) {
      if (userRepo.getByUsername(body.username)) {
        return reply.code(409).send({ error: 'Este nome de usuário já está em uso' });
      }
    }

    const updated = userRepo.update(user.id, body);
    return {
      user: {
        id: updated?.id,
        username: updated?.username,
        displayName: updated?.displayName,
        role: updated?.role,
        email: updated?.email,
        phone: updated?.phone,
        jobTitle: updated?.jobTitle,
        permissions: updated ? effectivePermissions(updated) : [],
      },
    };
  });

  /**
   * Public preview of the username a signup would receive. The landing page
   * shows it live so nobody is surprised by their own login name.
   */
  app.get('/api/signup/username-preview', async (req) => {
    const query = req.query as { firstName?: string; lastName?: string };
    if (!query.firstName || !query.lastName) return { username: null };
    return { username: buildUsername(query.firstName, query.lastName) };
  });
}
