import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { engine } from './media/engine.js';
import { publicHostFor } from './routes.js';

/** Push cadence for the dashboard. Fast enough to feel live, cheap enough to ignore. */
const TICK_MS = 1_000;

export async function registerRealtime(app: FastifyInstance): Promise<void> {
  const clients = new Set<{ socket: WebSocket; host: string }>();

  app.get('/api/stream', { websocket: true }, (connection, req) => {
    // @fastify/websocket v10 wraps the socket; v11 passes it directly.
    const socket = ((connection as unknown as { socket?: WebSocket }).socket ??
      connection) as unknown as WebSocket;

    const client = { socket, host: publicHostFor(req) };
    clients.add(client);

    send(client, { type: 'snapshot', statuses: engine.allStatuses(client.host) });

    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
  });

  function send(
    client: { socket: WebSocket; host: string },
    payload: Record<string, unknown>,
  ): void {
    if (client.socket.readyState !== 1) return;
    try {
      client.socket.send(JSON.stringify(payload));
    } catch {
      clients.delete(client);
    }
  }

  const timer = setInterval(() => {
    if (clients.size === 0) return;
    for (const client of clients) {
      send(client, { type: 'snapshot', statuses: engine.allStatuses(client.host) });
    }
  }, TICK_MS);
  timer.unref();

  // Config changes need to reach the UI immediately, not on the next tick.
  engine.on('change', () => {
    for (const client of clients) {
      send(client, { type: 'snapshot', statuses: engine.allStatuses(client.host) });
    }
  });

  app.addHook('onClose', async () => {
    clearInterval(timer);
    for (const client of clients) client.socket.close();
  });
}
