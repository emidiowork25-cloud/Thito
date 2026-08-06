import { useEffect, useRef, useState } from 'react';
import { streamUrl } from './api';
import type { IngestStatus } from './types';

/**
 * Live telemetry over the hub websocket, with reconnect. The server pushes a
 * full snapshot every second, so there is no incremental state to reconcile —
 * a dropped connection costs at most one tick.
 */
export function useLive(): {
  statuses: Record<string, IngestStatus>;
  connected: boolean;
} {
  const [statuses, setStatuses] = useState<Record<string, IngestStatus>>({});
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = (): void => {
      if (disposed) return;
      socket = new WebSocket(streamUrl());

      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type: string;
            statuses?: IngestStatus[];
          };
          if (payload.type === 'snapshot' && payload.statuses) {
            const next: Record<string, IngestStatus> = {};
            for (const status of payload.statuses) next[status.ingestId] = status;
            setStatuses(next);
          }
        } catch {
          /* ignore malformed frame */
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (disposed) return;
        retryRef.current = Math.min(retryRef.current + 1, 5);
        timer = setTimeout(connect, 500 * 2 ** (retryRef.current - 1));
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, []);

  return { statuses, connected };
}
