// Cliente Supabase mínimo, feito com fetch — sem dependências externas.
// Cobre exatamente o que o hub precisa: autenticação por e-mail/senha,
// leitura/escrita na tabela `records` e chamada da Edge Function do JARBAS.

import * as db from './db.js';
import * as settings from './settings.js';

const SESSION_KEY = 'sb-session';

let session = null;   // { access_token, refresh_token, expires_at, user }
let refreshing = null;

/* ---------- configuração ---------- */

const base = () => String(settings.get('supabaseUrl') || '').replace(/\/+$/, '');
const anon = () => String(settings.get('supabaseKey') || '');
export const configured = () => !!(base() && anon());

/* ---------- sessão ---------- */

export async function loadSession() {
  session = await db.kvGet(SESSION_KEY, null);
  return session;
}

export const getUser = () => session?.user ?? null;
export const isSignedIn = () => !!session?.access_token;

async function persist(s) {
  session = s;
  if (s) await db.kvSet(SESSION_KEY, s);
  else await db.kvDel(SESSION_KEY);
}

function withExpiry(data) {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    // margem de 60 s para não usar um token prestes a expirar
    expires_at: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    user: data.user ?? null,
  };
}

async function authFetch(path, body) {
  const res = await fetch(`${base()}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: anon(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || `Erro ${res.status}`);
  return data;
}

export async function signUp(email, password) {
  const data = await authFetch('signup', { email, password });
  // Se a confirmação de e-mail estiver ligada no projeto, não vem token.
  if (data.access_token) await persist(withExpiry(data));
  return { needsConfirmation: !data.access_token, user: data.user ?? null };
}

export async function signIn(email, password) {
  const data = await authFetch('token?grant_type=password', { email, password });
  await persist(withExpiry(data));
  return session.user;
}

export async function signOut() {
  try {
    if (session?.access_token) {
      await fetch(`${base()}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: anon(), Authorization: `Bearer ${session.access_token}` },
      });
    }
  } catch { /* logout local vale mesmo se a rede falhar */ }
  await persist(null);
}

async function refresh() {
  if (!session?.refresh_token) throw new Error('Sessão expirada. Entre novamente.');
  refreshing ??= (async () => {
    try {
      const data = await authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      await persist(withExpiry(data));
      return session;
    } catch (err) {
      await persist(null);
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Token válido, renovando se estiver perto de expirar. */
async function token() {
  if (!session?.access_token) throw new Error('Não autenticado.');
  if (Date.now() >= (session.expires_at ?? 0)) await refresh();
  return session.access_token;
}

/* ---------- REST (PostgREST) ---------- */

async function rest(path, { method = 'GET', body, headers = {}, retry = true } = {}) {
  const jwt = await token();
  const res = await fetch(`${base()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: anon(),
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) {
    await refresh();
    return rest(path, { method, body, headers, retry: false });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${detail.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

/** Registros alterados na nuvem depois de `since` (ISO). */
export function pullRecords(since) {
  const q = new URLSearchParams({ select: '*', order: 'updated_at.asc', limit: '5000' });
  if (since) q.append('updated_at', `gt.${since}`);
  return rest(`records?${q}`);
}

/** Envia registros (upsert por chave primária user_id+collection+id). */
export function pushRecords(rows) {
  if (!rows.length) return Promise.resolve(null);
  return rest('records', {
    method: 'POST',
    body: rows,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
}

/* ---------- Edge Function (JARBAS) ---------- */

export async function invokeJarbas(payload) {
  const jwt = await token();
  const res = await fetch(`${base()}/functions/v1/jarbas`, {
    method: 'POST',
    headers: {
      apikey: anon(),
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Falha na função JARBAS (${res.status}).`);
  return data;
}
