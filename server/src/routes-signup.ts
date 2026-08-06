import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessRepo, userRepo } from './auth.js';
import { ingestRepo } from './db.js';
import { requireAdmin } from './guards.js';
import {
  composeSignupApproved,
  composeSignupReceived,
  composeSignupRejected,
  loginUrl,
  mailStatus,
  outboxRepo,
  queueMail,
} from './mailer.js';
import { isPermission, type Permission } from './permissions.js';
import { settingsRepo } from './presets.js';
import {
  buildInitialPassword,
  buildUsername,
  normalizePhone,
  signupRepo,
} from './signup.js';

const signupInput = z.object({
  firstName: z.string().trim().min(2, 'Informe seu nome').max(60),
  lastName: z.string().trim().min(2, 'Informe seu sobrenome').max(80),
  jobTitle: z.string().trim().min(2, 'Informe sua função').max(80),
  phone: z
    .string()
    .trim()
    .refine((v) => {
      const digits = normalizePhone(v);
      // Brazilian mobile with area code is 11 digits; 10 covers landlines.
      return digits.length >= 10 && digits.length <= 13;
    }, 'Informe o celular com DDD, ex: (11) 98765-4321'),
  email: z.string().trim().email('E-mail inválido').max(160),
});

const approveInput = z.object({
  permissions: z.array(z.string()).default([]),
  ingestIds: z.array(z.string()).default([]),
  role: z.enum(['admin', 'operator']).default('operator'),
});

const rejectInput = z.object({
  note: z.string().trim().max(300).nullable().default(null),
});

export async function registerSignupRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Public. Rate limited by a simple per-address check rather than a token
   * bucket — the expensive side effect is a pending row an admin must read, and
   * one pending request per address is the natural cap.
   */
  app.post('/api/signup', async (req, reply) => {
    const parsed = signupInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const body = parsed.data;

    const settings = settingsRepo.read();

    // Answer identically whether or not the address is already known. A signup
    // form that distinguishes them is an account-enumeration oracle.
    const duplicate =
      signupRepo.pendingByEmail(body.email) !== null ||
      userRepo.list().some((u) => u.username === buildUsername(body.firstName, body.lastName));

    if (!duplicate) {
      signupRepo.create(body);
      queueMail(
        body.email,
        'signup.received',
        composeSignupReceived(body.firstName, settings.siteName),
      );
    }

    return reply.code(202).send({
      ok: true,
      message:
        'Solicitação enviada. Você receberá um e-mail assim que um administrador analisar o pedido.',
    });
  });

  // ------------------------------------------------------------ admin review

  app.get('/api/signups', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const status = (req.query as { status?: string } | undefined)?.status;
    const filter =
      status === 'pending' || status === 'approved' || status === 'rejected' ? status : undefined;
    return {
      requests: signupRepo.list(filter),
      pendingCount: signupRepo.countPending(),
      mail: mailStatus(),
      queuedMail: outboxRepo.countQueued(),
    };
  });

  app.post('/api/signups/:id/approve', async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const { id } = req.params as { id: string };
    const request = signupRepo.get(id);
    if (!request) return reply.code(404).send({ error: 'Solicitação não encontrada' });
    if (request.status !== 'pending') {
      return reply.code(409).send({ error: 'Esta solicitação já foi analisada' });
    }

    const parsed = approveInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const body = parsed.data;

    const username = buildUsername(request.firstName, request.lastName);
    const password = buildInitialPassword(request.phone);
    const permissions = body.permissions.filter(isPermission) as Permission[];

    const user = userRepo.create({
      username,
      displayName: `${request.firstName} ${request.lastName}`.trim(),
      password,
      role: body.role,
      permissions,
    });

    userRepo.update(user.id, {
      email: request.email,
      phone: request.phone,
      jobTitle: request.jobTitle,
      // Credentials an administrator can read are provisional by definition.
      mustChangePassword: true,
    });

    const known = new Set(ingestRepo.list().map((i) => i.id));
    accessRepo.set(
      user.id,
      body.ingestIds.filter((ingestId) => known.has(ingestId)),
    );

    signupRepo.markApproved(id, admin.id, user.id);

    const settings = settingsRepo.read();
    const host = req.headers.host?.split(':')[0] ?? 'localhost';
    const mailId = queueMail(
      request.email,
      'signup.approved',
      composeSignupApproved(
        request.firstName,
        username,
        password,
        loginUrl(host),
        settings.siteName,
      ),
    );

    return {
      user: { ...userRepo.get(user.id), ingestIds: accessRepo.listForUser(user.id) },
      credentials: { username, password },
      mailId,
      mail: mailStatus(),
    };
  });

  app.post('/api/signups/:id/reject', async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const { id } = req.params as { id: string };
    const request = signupRepo.get(id);
    if (!request) return reply.code(404).send({ error: 'Solicitação não encontrada' });
    if (request.status !== 'pending') {
      return reply.code(409).send({ error: 'Esta solicitação já foi analisada' });
    }

    const parsed = rejectInput.safeParse(req.body ?? {});
    const note = parsed.success ? parsed.data.note : null;

    signupRepo.markRejected(id, admin.id, note);
    queueMail(
      request.email,
      'signup.rejected',
      composeSignupRejected(request.firstName, note, settingsRepo.read().siteName),
    );

    return { ok: true };
  });

  /**
   * The outbox is admin-only and shows subjects, not bodies — the approval
   * mail contains a live credential and does not belong in a list view.
   */
  app.get('/api/mail', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return { messages: outboxRepo.list(), status: mailStatus() };
  });
}
