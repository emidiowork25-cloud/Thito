import { useEffect, useRef, useState } from 'react';
import { streamUrl } from './api';
import type { IngestStatus } from './types';

/**
 * Live telemetry over the hub websocket, with reconnect.
 *
 * The server pushes a complete snapshot every second, so there is no
 * incremental state to reconcile and a dropped connection costs at most one
 * tick. That is also why the reducer just replaces the map wholesale.
 */
export function useLive(): { statuses: Record<string, IngestStatus>; connected: boolean } {
  const [statuses, setStatuses] = useState<Record<string, IngestStatus>>({});
  const [connected, setConnected] = useState(false);
  const attemptRef = useRef(0);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = (): void => {
      if (disposed) return;
      socket = new WebSocket(streamUrl());

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as {
            type: string;
            statuses?: IngestStatus[];
          };
          if (payload.type !== 'snapshot' || !payload.statuses) return;
          const next: Record<string, IngestStatus> = {};
          for (const status of payload.statuses) next[status.ingestId] = status;
          setStatuses(next);
        } catch {
          // A malformed frame is not worth tearing the socket down over.
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (disposed) return;
        attemptRef.current = Math.min(attemptRef.current + 1, 5);
        timer = setTimeout(connect, 500 * 2 ** (attemptRef.current - 1));
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
