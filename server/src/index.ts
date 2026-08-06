import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { ensureBootstrapAdmin, sessionRepo } from './auth.js';
import { config } from './config.js';
import { canSeeIngest, isProvisionalPath, isPublicPath, resolveUser } from './guards.js';
import { probeCapabilities } from './media/capabilities.js';
import { engine } from './media/engine.js';
import { flushOutbox, mailStatus } from './mailer.js';
import { pruneOldTraffic } from './traffic.js';
import { registerAdminRoutes } from './routes-admin.js';
import { registerAuthRoutes } from './routes-auth.js';
import { registerSignupRoutes } from './routes-signup.js';
import { registerRoutes } from './routes.js';
import { registerRealtime } from './ws.js';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, '../../web/dist');

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: true,
});

await app.register(cookie, { secret: process.env.THITO_COOKIE_SECRET ?? undefined });
await app.register(websocket);

// Resolve the session once per request; individual routes decide what it buys.
app.decorateRequest('user', null);
app.addHook('onRequest', async (req) => {
  req.user = resolveUser(req);
});

/**
 * Blanket gate on the API. Routes still run their own permission checks — this
 * only guarantees no unauthenticated request reaches one that forgot to.
 */
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/api/')) return;
  if (isPublicPath(req.url)) return;
  if (!req.user) return reply.code(401).send({ error: 'Sessão expirada ou inexistente' });

  // An account still holding provisional credentials can do exactly one thing:
  // replace them.
  if (req.user.mustChangePassword && !isProvisionalPath(req.url)) {
    return reply.code(403).send({
      error: 'Defina uma nova senha antes de continuar',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
});

/**
 * The HLS preview is real video, so it needs the same scoping as the API.
 * A <video> element cannot send an Authorization header, but it does send
 * same-origin cookies — which is exactly what the session uses.
 */
app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/preview/')) return;
  if (!req.user) return reply.code(401).send({ error: 'Sessão expirada ou inexistente' });

  const path = req.url.split('?')[0] ?? req.url;
  const ingestId = path.split('/')[2];
  if (!ingestId) return reply.code(404).send({ error: 'Not found' });
  if (!canSeeIngest(req.user, ingestId)) {
    return reply.code(404).send({ error: 'Not found' });
  }
});

await registerAuthRoutes(app);
await registerSignupRoutes(app);
await registerRoutes(app);
await registerAdminRoutes(app);
await registerRealtime(app);

await app.register(fastifyStatic, {
  root: config.previewDir,
  prefix: '/preview/',
  decorateReply: false,
  cacheControl: false,
  setHeaders(res) {
    // Live playlists must never be cached, or the player replays old segments.
    res.setHeader('Cache-Control', 'no-store');
  },
});

// Built SPA, when present. In dev the Vite server serves it instead.
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: true,
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
    return reply.sendFile('index.html');
  });
}

const seeded = ensureBootstrapAdmin();
if (seeded) {
  app.log.warn(
    `First run — administrator created.\n` +
      `    usuário: ${seeded.username}\n` +
      `    senha:   ${seeded.password}\n` +
      `  This password is shown once and is not recoverable. Change it after logging in.`,
  );
}

try {
  const caps = await probeCapabilities();
  app.log.info(
    { ffmpeg: caps.ffmpegVersion, srt: caps.srt, omt: caps.omtMuxer ?? 'unavailable' },
    'media backend ready',
  );
  if (!caps.srt) {
    app.log.error('This ffmpeg build has no SRT protocol support — ingests will fail.');
  }
} catch (err) {
  app.log.error((err as Error).message);
}

sessionRepo.purgeExpired();
pruneOldTraffic();
engine.bootstrap();

const mail = mailStatus();
if (!mail.configured) {
  app.log.warn(
    'SMTP is not configured (set SMTP_HOST). Signup mail will be queued and ' +
      'visible to administrators under /api/mail, but not delivered.',
  );
}

// Retry queued mail: an SMTP outage at approval time must not strand an
// account whose credentials were never delivered.
const mailTimer = setInterval(() => void flushOutbox(), 60_000);
mailTimer.unref();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`${signal} received, stopping media pipelines`);
  engine.shutdown();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: config.host });
