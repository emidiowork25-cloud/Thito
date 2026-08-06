import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { config } from './config.js';
import { probeCapabilities } from './media/capabilities.js';
import { engine } from './media/engine.js';
import { registerRoutes } from './routes.js';
import { registerRealtime } from './ws.js';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, '../../web/dist');

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  // Preview playlists are tiny; the default body limit is plenty.
  trustProxy: true,
});

await app.register(cookie);
await app.register(websocket);

/**
 * Token gate. Applied to the API only — the SPA and preview segments are
 * static assets, and gating the HLS segments would break <video> playback,
 * which cannot attach an Authorization header.
 */
if (config.adminToken) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer ?? (req.query as { token?: string } | undefined)?.token ?? req.cookies.thito_token;
    if (token !== config.adminToken) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
} else {
  app.log.warn('THITO_ADMIN_TOKEN is unset — the API is unauthenticated.');
}

await registerRoutes(app);
await registerRealtime(app);

// HLS preview output, written by the preview ffmpeg processes.
await app.register(fastifyStatic, {
  root: config.previewDir,
  prefix: '/preview/',
  decorateReply: false,
  cacheControl: false,
  setHeaders(res) {
    // Live playlists must never be cached, or the player replays old segments.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
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

engine.bootstrap();

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`${signal} received, stopping media pipelines`);
  engine.shutdown();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: config.host });
