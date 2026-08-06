import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { accessRepo } from './auth.js';
import { config } from './config.js';
import { ingestRepo, outputRepo } from './db.js';
import {
  requireIngestAccess,
  requirePermission,
  requireUser,
  visibleIngestIds,
} from './guards.js';
import { probeCapabilities } from './media/capabilities.js';
import { allocateListenerPort, engine, maxOutputsPerIngest } from './media/engine.js';
import { outputUrl } from './media/uri.js';
import { effectivePermissions, isAdmin } from './permissions.js';
import { presetRepo, settingsRepo } from './presets.js';
import type { Ingest, Output } from './types.js';

/**
 * Hostname to advertise in connect URLs. Platform settings win over the
 * environment, which wins over the request host — the last is a guess and is
 * usually wrong behind NAT.
 */
export function publicHostFor(req: FastifyRequest): string {
  const configured = settingsRepo.read().publicHost ?? config.publicHost;
  if (configured) return configured;
  const host = req.headers.host ?? 'localhost';
  return host.split(':')[0] ?? 'localhost';
}

const srtMode = z.enum(['listener', 'caller']);

const ingestInput = z.object({
  name: z.string().min(1).max(80),
  mode: srtMode.default('listener'),
  port: z.number().int().min(1).max(65535).optional(),
  host: z.string().min(1).max(255).nullable().default(null),
  streamId: z.string().max(512).nullable().default(null),
  passphrase: z
    .string()
    .min(10, 'O SRT exige uma passphrase de no mínimo 10 caracteres')
    .max(79)
    .nullable()
    .default(null),
  latencyUs: z.number().int().min(20_000).max(8_000_000).default(120_000),
  previewEnabled: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

const outputInput = z.object({
  name: z.string().min(1).max(80),
  protocol: z.enum(['srt', 'udp', 'rtp', 'rtmp', 'omt']),
  host: z.string().min(1).max(512),
  port: z.number().int().min(1).max(65535).nullable().default(null),
  mode: srtMode.default('caller'),
  streamId: z.string().max(512).nullable().default(null),
  passphrase: z.string().min(10).max(79).nullable().default(null),
  latencyUs: z.number().int().min(20_000).max(8_000_000).default(120_000),
  enabled: z.boolean().default(true),
  /** When set, the destination comes from an admin-defined preset. */
  presetId: z.string().nullable().default(null),
});

/** Strips secrets an operator has no business reading back. */
function publicIngest(ingest: Ingest, viewer: { role: string }): Ingest {
  if (viewer.role === 'admin') return ingest;
  return { ...ingest, passphrase: ingest.passphrase ? '••••••••' : null };
}

function publicOutput(output: Output, viewer: { role: string }): Output {
  if (viewer.role === 'admin') return output;
  return { ...output, passphrase: output.passphrase ? '••••••••' : null };
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ system

  app.get('/api/system', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const capabilities = await probeCapabilities();
    const settings = settingsRepo.read();
    return {
      capabilities,
      publicHost: publicHostFor(req),
      srtPortRange: [config.srtPortMin, config.srtPortMax],
      maxOutputsPerIngest: maxOutputsPerIngest(),
      siteName: settings.siteName,
      defaultLatencyMs: settings.defaultLatencyMs,
      requirePassphrase: settings.requirePassphrase,
      me: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        permissions: effectivePermissions(user),
      },
    };
  });

  // ----------------------------------------------------------------- ingests

  app.get('/api/ingests', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;

    const host = publicHostFor(req);
    const visible = new Set(visibleIngestIds(user));

    return ingestRepo
      .list()
      .filter((ingest) => visible.has(ingest.id))
      .map((ingest) => ({
        ...publicIngest(ingest, user),
        outputs: outputRepo.listByIngest(ingest.id).map((o) => publicOutput(o, user)),
        status: engine.status(ingest.id, host),
      }));
  });

  app.get('/api/ingests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id);
    if (!user) return;

    const ingest = ingestRepo.get(id);
    if (!ingest) return reply.code(404).send({ error: 'Recepção não encontrada' });

    return {
      ...publicIngest(ingest, user),
      outputs: outputRepo.listByIngest(id).map((o) => publicOutput(o, user)),
      status: engine.status(id, publicHostFor(req)),
    };
  });

  app.post('/api/ingests', async (req, reply) => {
    const user = requirePermission(req, reply, 'ingest.create');
    if (!user) return;

    const parsed = ingestInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const body = parsed.data;

    if (body.mode === 'caller' && !body.host) {
      return reply.code(400).send({ error: 'O modo caller precisa de um host remoto' });
    }
    if (body.mode === 'caller' && !body.port) {
      return reply.code(400).send({ error: 'O modo caller precisa de uma porta remota' });
    }
    if (settingsRepo.read().requirePassphrase && !body.passphrase) {
      return reply
        .code(400)
        .send({ error: 'Esta plataforma exige passphrase em todas as recepções' });
    }

    let port: number;
    try {
      port = body.port ?? allocateListenerPort();
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }

    const ingest: Ingest = {
      id: nanoid(10),
      name: body.name,
      mode: body.mode,
      port,
      host: body.host,
      streamId: body.streamId,
      passphrase: body.passphrase,
      latencyUs: body.latencyUs,
      previewEnabled: body.previewEnabled,
      enabled: body.enabled,
      createdAt: new Date().toISOString(),
    };

    try {
      ingestRepo.insert(ingest);
    } catch (err) {
      const message = (err as Error).message.includes('UNIQUE')
        ? `A porta ${port} já está em uso por outra recepção`
        : (err as Error).message;
      return reply.code(409).send({ error: message });
    }

    // Whoever creates a feed keeps access to it; otherwise an operator would
    // create something and immediately lose sight of it.
    if (!isAdmin(user)) accessRepo.grant(user.id, ingest.id);

    if (ingest.enabled) engine.startIngest(ingest.id);
    return reply.code(201).send({
      ...publicIngest(ingest, user),
      outputs: [],
      status: engine.status(ingest.id, publicHostFor(req)),
    });
  });

  app.patch('/api/ingests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id, 'ingest.configure');
    if (!user) return;

    const parsed = ingestInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }

    const updated = ingestRepo.update(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'Recepção não encontrada' });

    engine.reloadIngest(id);
    return {
      ...publicIngest(updated, user),
      outputs: outputRepo.listByIngest(id).map((o) => publicOutput(o, user)),
      status: engine.status(id, publicHostFor(req)),
    };
  });

  app.delete('/api/ingests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id, 'ingest.configure');
    if (!user) return;

    engine.stopIngest(id);
    ingestRepo.remove(id);
    return reply.code(204).send();
  });

  app.post('/api/ingests/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id, 'ingest.configure');
    if (!user) return;

    ingestRepo.update(id, { enabled: true });
    engine.startIngest(id);
    return engine.status(id, publicHostFor(req));
  });

  app.post('/api/ingests/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id, 'ingest.configure');
    if (!user) return;

    ingestRepo.update(id, { enabled: false });
    engine.stopIngest(id);
    return engine.status(id, publicHostFor(req));
  });

  app.get('/api/ingests/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id, 'ingest.monitor');
    if (!user) return;
    return engine.logs(id);
  });

  // ----------------------------------------------------------------- outputs

  app.post('/api/ingests/:id/outputs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireIngestAccess(req, reply, id, 'output.manage');
    if (!user) return;

    const parsed = outputInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    let body = parsed.data;

    // A preset overrides the submitted destination wholesale. Operators pick a
    // vetted endpoint by id; they never get to smuggle a host past it.
    if (body.presetId) {
      const preset = presetRepo.get(body.presetId);
      if (!preset) return reply.code(404).send({ error: 'Preset não encontrado' });
      body = {
        ...body,
        protocol: preset.protocol,
        host: preset.host,
        port: preset.port,
        mode: preset.mode,
        streamId: preset.streamId,
        passphrase: preset.passphrase,
        latencyUs: preset.latencyUs,
      };
    }

    if (body.protocol === 'omt') {
      if (!requirePermission(req, reply, 'output.omt')) return;
      const caps = await probeCapabilities();
      if (!caps.omtMuxer) {
        return reply.code(409).send({
          error:
            'Este build do ffmpeg não tem suporte a Open Media Transport. ' +
            'Recompile com OMT habilitado para usar saídas OMT.',
        });
      }
    }

    if (body.protocol !== 'omt' && body.protocol !== 'rtmp' && body.port === null) {
      return reply
        .code(400)
        .send({ error: `Saídas ${body.protocol.toUpperCase()} precisam de uma porta` });
    }

    const existing = outputRepo.listByIngest(id).filter((o) => o.enabled).length;
    if (body.enabled && existing >= maxOutputsPerIngest()) {
      return reply.code(409).send({
        error: `Esta recepção já atingiu o máximo de ${maxOutputsPerIngest()} saídas ativas`,
      });
    }

    const output: Output = {
      id: nanoid(10),
      ingestId: id,
      name: body.name,
      protocol: body.protocol,
      host: body.host,
      port: body.port,
      mode: body.mode,
      streamId: body.streamId,
      passphrase: body.passphrase,
      latencyUs: body.latencyUs,
      enabled: body.enabled,
      createdAt: new Date().toISOString(),
    };

    outputRepo.insert(output);
    if (output.enabled) engine.startOutput(output);
    return reply.code(201).send({
      ...publicOutput(output, user),
      targetUrl: isAdmin(user) ? outputUrl(output) : null,
    });
  });

  app.patch('/api/outputs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = outputRepo.get(id);
    if (!existing) return reply.code(404).send({ error: 'Saída não encontrada' });

    const user = requireIngestAccess(req, reply, existing.ingestId, 'output.manage');
    if (!user) return;

    const parsed = outputInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    if (parsed.data.protocol === 'omt' && !requirePermission(req, reply, 'output.omt')) return;

    const updated = outputRepo.update(id, parsed.data);
    engine.reloadOutput(id);
    return updated ? publicOutput(updated, user) : null;
  });

  app.delete('/api/outputs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = outputRepo.get(id);
    if (!existing) return reply.code(404).send({ error: 'Saída não encontrada' });

    const user = requireIngestAccess(req, reply, existing.ingestId, 'output.manage');
    if (!user) return;

    engine.stopOutput(id);
    outputRepo.remove(id);
    return reply.code(204).send();
  });

  app.post('/api/outputs/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = outputRepo.get(id);
    if (!existing) return reply.code(404).send({ error: 'Saída não encontrada' });

    const user = requireIngestAccess(req, reply, existing.ingestId, 'output.manage');
    if (!user) return;

    const output = outputRepo.update(id, { enabled: true });
    if (!output) return reply.code(404).send({ error: 'Saída não encontrada' });
    engine.startOutput(output);
    return publicOutput(output, user);
  });

  app.post('/api/outputs/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = outputRepo.get(id);
    if (!existing) return reply.code(404).send({ error: 'Saída não encontrada' });

    const user = requireIngestAccess(req, reply, existing.ingestId, 'output.manage');
    if (!user) return;

    const output = outputRepo.update(id, { enabled: false });
    if (!output) return reply.code(404).send({ error: 'Saída não encontrada' });
    engine.stopOutput(id);
    return publicOutput(output, user);
  });
}
