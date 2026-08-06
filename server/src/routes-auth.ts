import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SESSION_COOKIE, sessionRepo, userRepo, verifyPassword } from './auth.js';
import { requireUser } from './guards.js';
import { effectivePermissions } from './permissions.js';
import { settingsRepo } from './presets.js';

const loginInput = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

const passwordInput = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8, 'A nova senha precisa de ao menos 8 caracteres').max(256),
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /** Public: lets the login screen show the platform name before authenticating. */
  app.get('/api/branding', async () => {
    const settings = settingsRepo.read();
    return { siteName: settings.siteName };
  });

  /** Public: tells the SPA whether it already holds a valid session. */
  app.get('/api/auth/session', async (req) => {
    if (!req.user) return { authenticated: false };
    return {
      authenticated: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        displayName: req.user.displayName,
        role: req.user.role,
        permissions: effectivePermissions(req.user),
      },
    };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Usuário e senha são obrigatórios' });
    }

    const record = userRepo.getByUsername(parsed.data.username);
    // Same message and same work for unknown user and wrong password, so the
    // response does not reveal which usernames exist.
    const ok = record ? verifyPassword(parsed.data.password, record.passwordHash) : false;

    if (!record || !ok || !record.enabled) {
      return reply.code(401).send({ error: 'Usuário ou senha inválidos' });
    }

    const { token, expiresAt } = sessionRepo.create(record.id);
    userRepo.markLogin(record.id);
    sessionRepo.purgeExpired();

    return reply
      .setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        // Set only over TLS; on plain HTTP a secure cookie is never sent back.
        secure: req.protocol === 'https',
        expires: new Date(expiresAt),
      })
      .send({
        user: {
          id: record.id,
          username: record.username,
          displayName: record.displayName,
          role: record.role,
          permissions: effectivePermissions(record),
        },
      });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) sessionRepo.remove(token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true });
  });

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

    // Changing the password drops every session, including this one — the
    // client is expected to send the user back to the login screen.
    userRepo.update(user.id, { password: parsed.data.newPassword });
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ ok: true });
  });
}
