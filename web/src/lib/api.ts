import type {
  Bucket,
  Ingest,
  MailMessage,
  MailStatus,
  Me,
  Output,
  PlatformSettings,
  Preset,
  SignupRequest,
  SystemInfo,
  TrafficSummary,
  User,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  /** Set when the server tags the failure, e.g. PASSWORD_CHANGE_REQUIRED. */
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * The session lives in an httpOnly cookie, so every call just needs
 * `credentials: same-origin` — there is no token for the client to hold, and
 * therefore none for a script on the page to steal.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const shaped = body as { error?: string; code?: string } | null;
    throw new ApiError(
      res.status,
      shaped?.error ?? `A requisição falhou (${res.status})`,
      shaped?.code ?? null,
    );
  }
  return body as T;
}

const post = (path: string, body?: unknown): Promise<unknown> =>
  request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

export const api = {
  // ------------------------------------------------------------------- auth
  branding: () => request<{ siteName: string }>('/api/branding'),

  session: () =>
    request<{ authenticated: boolean; mustChangePassword?: boolean; user?: Me }>(
      '/api/auth/session',
    ),

  login: (username: string, password: string) =>
    request<{ mustChangePassword: boolean; user: Me }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () => post('/api/auth/logout'),

  changePassword: (currentPassword: string, newPassword: string) =>
    post('/api/auth/password', { currentPassword, newPassword }),

  updateProfile: (patch: Record<string, unknown>) =>
    request<{ user: Me }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // ----------------------------------------------------------------- signup
  signup: (body: Record<string, unknown>) =>
    request<{ ok: boolean; message: string }>('/api/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  usernamePreview: (firstName: string, lastName: string) =>
    request<{ username: string | null }>(
      `/api/signup/username-preview?firstName=${encodeURIComponent(firstName)}` +
        `&lastName=${encodeURIComponent(lastName)}`,
    ),

  signups: (status?: string) =>
    request<{
      requests: SignupRequest[];
      pendingCount: number;
      mail: MailStatus;
      queuedMail: number;
    }>(`/api/signups${status ? `?status=${status}` : ''}`),

  approveSignup: (id: string, body: Record<string, unknown>) =>
    request<{ credentials: { username: string; password: string }; mail: MailStatus }>(
      `/api/signups/${id}/approve`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  rejectSignup: (id: string, note: string | null) =>
    post(`/api/signups/${id}/reject`, { note }),

  mail: () => request<{ messages: MailMessage[]; status: MailStatus }>('/api/mail'),

  // ----------------------------------------------------------------- system
  system: () => request<SystemInfo>('/api/system'),

  // ---------------------------------------------------------------- ingests
  listIngests: () => request<Ingest[]>('/api/ingests'),

  getIngest: (id: string) => request<Ingest>(`/api/ingests/${id}`),

  createIngest: (body: Record<string, unknown>) =>
    request<Ingest>('/api/ingests', { method: 'POST', body: JSON.stringify(body) }),

  updateIngest: (id: string, body: Record<string, unknown>) =>
    request<Ingest>(`/api/ingests/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteIngest: (id: string) => request<void>(`/api/ingests/${id}`, { method: 'DELETE' }),

  rotateKey: (id: string) => request<Ingest>(`/api/ingests/${id}/rotate-key`, { method: 'POST' }),

  clearKey: (id: string) => request<Ingest>(`/api/ingests/${id}/clear-key`, { method: 'POST' }),

  startIngest: (id: string) => post(`/api/ingests/${id}/start`),
  stopIngest: (id: string) => post(`/api/ingests/${id}/stop`),

  logs: (id: string) =>
    request<{ relay: string[]; outputs: Record<string, string[]> }>(
      `/api/ingests/${id}/logs`,
    ),

  // ---------------------------------------------------------------- outputs
  createOutput: (ingestId: string, body: Record<string, unknown>) =>
    request<Output>(`/api/ingests/${ingestId}/outputs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateOutput: (id: string, body: Record<string, unknown>) =>
    request<Output>(`/api/outputs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteOutput: (id: string) => request<void>(`/api/outputs/${id}`, { method: 'DELETE' }),
  startOutput: (id: string) => post(`/api/outputs/${id}/start`),
  stopOutput: (id: string) => post(`/api/outputs/${id}/stop`),

  // ------------------------------------------------------------------ admin
  users: () => request<User[]>('/api/users'),

  createUser: (body: Record<string, unknown>) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify(body) }),

  updateUser: (id: string, body: Record<string, unknown>) =>
    request<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteUser: (id: string) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),

  presets: () => request<Preset[]>('/api/presets'),

  createPreset: (body: Record<string, unknown>) =>
    request<Preset>('/api/presets', { method: 'POST', body: JSON.stringify(body) }),

  updatePreset: (id: string, body: Record<string, unknown>) =>
    request<Preset>(`/api/presets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deletePreset: (id: string) => request<void>(`/api/presets/${id}`, { method: 'DELETE' }),

  settings: () => request<PlatformSettings>('/api/settings'),

  updateSettings: (body: Record<string, unknown>) =>
    request<PlatformSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  traffic: (bucket: Bucket) => request<TrafficSummary>(`/api/traffic?bucket=${bucket}`),
};

/** Websocket for live telemetry. Same-origin, so the session cookie rides along. */
export function streamUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/stream`;
}
