import type { FastifyInstance, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { config } from './config.js';
import { ingestRepo, outputRepo } from './db.js';
import { probeCapabilities } from './media/capabilities.js';
import { allocateListenerPort, engine, maxOutputsPerIngest } from './media/engine.js';
import { outputUrl } from './media/uri.js';
import type { Ingest, Output } from './types.js';

/** Hostname to advertise in connect URLs. */
export function publicHostFor(req: FastifyRequest): string {
  if (config.publicHost) return config.publicHost;
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
    .min(10, 'SRT requires a passphrase of at least 10 characters')
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
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ system

  app.get('/api/system', async (req) => {
    const capabilities = await probeCapabilities();
    return {
      capabilities,
      publicHost: publicHostFor(req),
      srtPortRange: [config.srtPortMin, config.srtPortMax],
      maxOutputsPerIngest: maxOutputsPerIngest(),
    };
  });

  // ----------------------------------------------------------------- ingests

  app.get('/api/ingests', async (req) => {
    const host = publicHostFor(req);
    return ingestRepo.list().map((ingest) => ({
      ...ingest,
      outputs: outputRepo.listByIngest(ingest.id),
      status: engine.status(ingest.id, host),
    }));
  });

  app.get('/api/ingests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ingest = ingestRepo.get(id);
    if (!ingest) return reply.code(404).send({ error: 'Ingest not found' });
    return {
      ...ingest,
      outputs: outputRepo.listByIngest(id),
      status: engine.status(id, publicHostFor(req)),
    };
  });

  app.post('/api/ingests', async (req, reply) => {
    const parsed = ingestInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    }
    const body = parsed.data;

    if (body.mode === 'caller' && !body.host) {
      return reply.code(400).send({ error: 'Caller mode needs a remote host to dial' });
    }
    if (body.mode === 'caller' && !body.port) {
      return reply.code(400).send({ error: 'Caller mode needs a remote port' });
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
        ? `Port ${port} is already taken by another ingest`
        : (err as Error).message;
      return reply.code(409).send({ error: message });
    }

    if (ingest.enabled) engine.startIngest(ingest.id);
    return reply.code(201).send({ ...ingest, outputs: [], status: engine.status(ingest.id, publicHostFor(req)) });
  });

  app.patch('/api/ingests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ingestRepo.get(id)) return reply.code(404).send({ error: 'Ingest not found' });

    const parsed = ingestInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    }

    const updated = ingestRepo.update(id, parsed.data);
    engine.reloadIngest(id);
    return { ...updated, outputs: outputRepo.listByIngest(id), status: engine.status(id, publicHostFor(req)) };
  });

  app.delete('/api/ingests/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    engine.stopIngest(id);
    if (!ingestRepo.remove(id)) return reply.code(404).send({ error: 'Ingest not found' });
    return reply.code(204).send();
  });

  app.post('/api/ingests/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ingestRepo.get(id)) return reply.code(404).send({ error: 'Ingest not found' });
    ingestRepo.update(id, { enabled: true });
    engine.startIngest(id);
    return engine.status(id, publicHostFor(req));
  });

  app.post('/api/ingests/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ingestRepo.get(id)) return reply.code(404).send({ error: 'Ingest not found' });
    ingestRepo.update(id, { enabled: false });
    engine.stopIngest(id);
    return engine.status(id, publicHostFor(req));
  });

  app.get('/api/ingests/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ingestRepo.get(id)) return reply.code(404).send({ error: 'Ingest not found' });
    return engine.logs(id);
  });

  // ----------------------------------------------------------------- outputs

  app.post('/api/ingests/:id/outputs', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ingestRepo.get(id)) return reply.code(404).send({ error: 'Ingest not found' });

    const parsed = outputInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    }
    const body = parsed.data;

    if (body.protocol !== 'omt' && body.protocol !== 'rtmp' && body.port === null) {
      return reply.code(400).send({ error: `${body.protocol.toUpperCase()} outputs need a port` });
    }
    if (body.protocol === 'omt') {
      const caps = await probeCapabilities();
      if (!caps.omtMuxer) {
        return reply.code(409).send({
          error:
            'This ffmpeg build has no Open Media Transport support. ' +
            'Rebuild the image with OMT enabled to add OMT outputs.',
        });
      }
    }

    const existing = outputRepo.listByIngest(id).filter((o) => o.enabled).length;
    if (body.enabled && existing >= maxOutputsPerIngest()) {
      return reply.code(409).send({
        error: `This ingest already has the maximum of ${maxOutputsPerIngest()} active outputs`,
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
    return reply.code(201).send({ ...output, targetUrl: outputUrl(output) });
  });

  app.patch('/api/outputs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!outputRepo.get(id)) return reply.code(404).send({ error: 'Output not found' });

    const parsed = outputInput.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    }

    const updated = outputRepo.update(id, parsed.data);
    engine.reloadOutput(id);
    return updated;
  });

  app.delete('/api/outputs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    engine.stopOutput(id);
    if (!outputRepo.remove(id)) return reply.code(404).send({ error: 'Output not found' });
    return reply.code(204).send();
  });

  app.post('/api/outputs/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    const output = outputRepo.update(id, { enabled: true });
    if (!output) return reply.code(404).send({ error: 'Output not found' });
    engine.startOutput(output);
    return output;
  });

  app.post('/api/outputs/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    const output = outputRepo.update(id, { enabled: false });
    if (!output) return reply.code(404).send({ error: 'Output not found' });
    engine.stopOutput(id);
    return output;
  });
}
