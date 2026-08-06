import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { visibleIngestIds } from './guards.js';
import { engine } from './media/engine.js';
import type { User } from './permissions.js';
import { publicHostFor } from './routes.js';

/** Push cadence for the dashboard. Fast enough to feel live, cheap enough to ignore. */
const TICK_MS = 1_000;

interface Client {
  socket: WebSocket;
  host: string;
  user: User;
}

export async function registerRealtime(app: FastifyInstance): Promise<void> {
  const clients = new Set<Client>();

  /**
   * Telemetry is scoped per socket, not broadcast wholesale — an operator must
   * not learn the bitrate of feeds they were never granted.
   */
  function snapshotFor(client: Client): Record<string, unknown> {
    const visible = new Set(visibleIngestIds(client.user));
    return {
      type: 'snapshot',
      statuses: engine
        .allStatuses(client.host)
        .filter((status) => visible.has(status.ingestId)),
    };
  }

  function send(client: Client, payload: Record<string, unknown>): void {
    if (client.socket.readyState !== 1) return;
    try {
      client.socket.send(JSON.stringify(payload));
    } catch {
      clients.delete(client);
    }
  }

  app.get('/api/stream', { websocket: true }, (connection, req) => {
    // The blanket API gate rejects unauthenticated upgrades, so this is belt
    // and braces rather than the real check.
    if (!req.user) {
      (connection as unknown as { socket?: WebSocket }).socket?.close();
      return;
    }

    // @fastify/websocket v10 wraps the socket; v11 passes it directly.
    const socket = ((connection as unknown as { socket?: WebSocket }).socket ??
      connection) as unknown as WebSocket;

    const client: Client = { socket, host: publicHostFor(req), user: req.user };
    clients.add(client);
    send(client, snapshotFor(client));

    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));
  });

  const broadcast = (): void => {
    for (const client of clients) send(client, snapshotFor(client));
  };

  const timer = setInterval(() => {
    if (clients.size > 0) broadcast();
  }, TICK_MS);
  timer.unref();

  // Config changes need to reach the UI immediately, not on the next tick.
  engine.on('change', broadcast);

  app.addHook('onClose', async () => {
    clearInterval(timer);
    for (const client of clients) client.socket.close();
  });
}
