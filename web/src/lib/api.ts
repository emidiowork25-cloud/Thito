import type { Ingest, Output, SystemInfo } from './types';

/**
 * When the hub runs with THITO_ADMIN_TOKEN set, the operator pastes the token
 * once and we keep it in localStorage. It is sent as a bearer header on every
 * API call and as a query param on the websocket, which cannot carry headers.
 */
const TOKEN_KEY = 'thito.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return body as T;
}

export const api = {
  system: () => request<SystemInfo>('/api/system'),

  listIngests: () => request<Ingest[]>('/api/ingests'),

  createIngest: (body: Record<string, unknown>) =>
    request<Ingest>('/api/ingests', { method: 'POST', body: JSON.stringify(body) }),

  updateIngest: (id: string, body: Record<string, unknown>) =>
    request<Ingest>(`/api/ingests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteIngest: (id: string) => request<void>(`/api/ingests/${id}`, { method: 'DELETE' }),

  startIngest: (id: string) => request<unknown>(`/api/ingests/${id}/start`, { method: 'POST' }),

  stopIngest: (id: string) => request<unknown>(`/api/ingests/${id}/stop`, { method: 'POST' }),

  logs: (id: string) =>
    request<{ relay: string[]; outputs: Record<string, string[]> }>(
      `/api/ingests/${id}/logs`,
    ),

  createOutput: (ingestId: string, body: Record<string, unknown>) =>
    request<Output>(`/api/ingests/${ingestId}/outputs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateOutput: (id: string, body: Record<string, unknown>) =>
    request<Output>(`/api/outputs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteOutput: (id: string) => request<void>(`/api/outputs/${id}`, { method: 'DELETE' }),

  startOutput: (id: string) => request<Output>(`/api/outputs/${id}/start`, { method: 'POST' }),

  stopOutput: (id: string) => request<Output>(`/api/outputs/${id}/stop`, { method: 'POST' }),
};

export function streamUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${proto}//${location.host}/api/stream${qs}`;
}
