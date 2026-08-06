import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessRepo, sessionRepo, userRepo } from './auth.js';
import { ingestRepo } from './db.js';
import { requireAdmin } from './guards.js';
import { ALL_PERMISSIONS, isPermission, type Permission } from './permissions.js';
import { presetRepo, settingsRepo } from './presets.js';

const permissionList = z
  .array(z.string())
  .transform((values) => values.filter(isPermission) as Permission[]);

const userCreate = z.object({
  username: z
    .string()
    .min(3, 'O usuário precisa de ao menos 3 caracteres')
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou underscore'),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8, 'A senha precisa de ao menos 8 caracteres').max(256),
  role: z.enum(['admin', 'operator']).default('operator'),
  permissions: permissionList.default([]),
  ingestIds: z.array(z.string()).default([]),
});

const userUpdate = z.object({
  displayName: z.string().min(1).max(80).optional(),
  password: z.string().min(8, 'A senha precisa de ao menos 8 caracteres').max(256).optional(),
  role: z.enum(['admin', 'operator']).optional(),
  permissions: permissionList.optional(),
  enabled: z.boolean().optional(),
  ingestIds: z.array(z.string()).optional(),
});

const presetInput = z.object({
  name: z.string().min(1).max(80),
  protocol: z.enum(['srt', 'udp', 'rtp', 'rtmp', 'omt']),
  host: z.string().min(1).max(512),
  port: z.number().int().min(1).max(65535).nullable().default(null),
  mode: z.enum(['listener', 'caller']).default('caller'),
  streamId: z.string().max(512).nullable().default(null),
  passphrase: z.string().min(10).max(79).nullable().default(null),
  latencyUs: z.number().int().min(20_000).max(8_000_000).default(120_000),
  locked: z.boolean().default(true),
});

const settingsInput = z.object({
  siteName: z.string().min(1).max(60).optional(),
  publicHost: z.string().max(255).nullable().optional(),
  defaultLatencyMs: z.number().int().min(20).max(8000).optional(),
  requirePassphrase: z.boolean().optional(),
});

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------- permissions

  app.get('/api/permissions', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return ALL_PERMISSIONS;
  });

  // -------------------------------------------------------------------- users

  app.get('/api/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return userRepo.list().map((user) => ({
      ...user,
      ingestIds: accessRepo.listForUser(user.id),
    }));
  });

  app.post('/api/users', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;

    const parsed = userCreate.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const body = parsed.data;

    if (userRepo.getByUsername(body.username)) {
      return reply.code(409).send({ error: 'Já existe um usuário com esse nome' });
    }

    const user = userRepo.create({
      username: body.username,
      displayName: body.displayName,
      password: body.password,
      role: body.role,
      permissions: body.permissions,
    });

    // Only grant access to ingests that actually exist, so a stale id in the
    // request cannot leave a dangling row behind.
    const known = new Set(ingestRepo.list().map((i) => i.id));
    accessRepo.set(
      user.id,
      body.ingestIds.filter((id) => known.has(id)),
    );

    return reply.code(201).send({ ...user, ingestIds: accessRepo.listForUser(user.id) });
  });

  app.patch('/api/users/:id', async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const { id } = req.params as { id: string };
    const target = userRepo.get(id);
    if (!target) return reply.code(404).send({ error: 'Usuário não encontrado' });

    const parsed = userUpdate.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const body = parsed.data;

    // Losing the last administrator would lock everyone out of the platform.
    const demoting = body.role === 'operator' || body.enabled === false;
    if (demoting && target.role === 'admin' && userRepo.countAdmins(target.id) === 0) {
      return reply.code(409).send({
        error: 'Este é o último administrador ativo — promova outro antes de alterar este.',
      });
    }

    const updated = userRepo.update(id, {
      displayName: body.displayName,
      password: body.password,
      role: body.role,
      permissions: body.permissions,
      enabled: body.enabled,
    });

    if (body.ingestIds) {
      const known = new Set(ingestRepo.list().map((i) => i.id));
      accessRepo.set(
        id,
        body.ingestIds.filter((ingestId) => known.has(ingestId)),
      );
    }

    return { ...updated, ingestIds: accessRepo.listForUser(id) };
  });

  app.delete('/api/users/:id', async (req, reply) => {
    const admin = requireAdmin(req, reply);
    if (!admin) return;

    const { id } = req.params as { id: string };
    const target = userRepo.get(id);
    if (!target) return reply.code(404).send({ error: 'Usuário não encontrado' });

    if (target.id === admin.id) {
      return reply.code(409).send({ error: 'Você não pode apagar a própria conta' });
    }
    if (target.role === 'admin' && userRepo.countAdmins(target.id) === 0) {
      return reply.code(409).send({ error: 'Este é o último administrador ativo' });
    }

    sessionRepo.removeForUser(id);
    userRepo.remove(id);
    return reply.code(204).send();
  });

  // ------------------------------------------------------------------ presets

  /**
   * Readable by any authenticated user: an operator needs the list to pick a
   * destination. Secrets are stripped — a locked preset exists precisely so the
   * operator never handles the passphrase.
   */
  app.get('/api/presets', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'Sessão expirada ou inexistente' });
    const admin = req.user.role === 'admin';
    return presetRepo.list().map((preset) => ({
      ...preset,
      passphrase: admin ? preset.passphrase : null,
      hasPassphrase: preset.passphrase !== null,
    }));
  });

  app.post('/api/presets', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = presetInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    return reply.code(201).send(presetRepo.create(parsed.data));
  });

  app.patch('/api/presets/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const parsed = presetInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const updated = presetRepo.update(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'Preset não encontrado' });
    return updated;
  });

  app.delete('/api/presets/:id', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    if (!presetRepo.remove(id)) return reply.code(404).send({ error: 'Preset não encontrado' });
    return reply.code(204).send();
  });

  // ----------------------------------------------------------------- settings

  app.get('/api/settings', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return settingsRepo.read();
  });

  app.patch('/api/settings', async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const parsed = settingsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    return settingsRepo.write(parsed.data);
  });
}
