// Sincronização com o Supabase.
//
// Modelo: uma única tabela `records(user_id, collection, id, data, updated_at, deleted)`.
// Resolução de conflito: quem escreveu por último vence, comparando `updatedAt`.
// Exclusões são lógicas (deleted = true) para que se propaguem entre dispositivos.

import * as db from './db.js';
import * as store from './store.js';
import * as sb from './supabase.js';
import * as settings from './settings.js';
import { emit, on } from './bus.js';

const LAST_PULL = 'sync:lastPull';
const LAST_PUSH = 'sync:lastPush';

let running = false;
let queued = false;
let timer = null;

export function status(state, detail = '') {
  emit('sync:status', { state, detail });
}

export function available() {
  return settings.isCloudConfigured() && sb.isSignedIn();
}

/** Executa um ciclo completo (enviar + receber). Nunca lança: reporta pelo barramento. */
export async function run({ full = false } = {}) {
  if (!available()) { status('local'); return { ok: false, reason: 'offline' }; }
  if (running) { queued = true; return { ok: false, reason: 'busy' }; }

  running = true;
  status('sync');
  try {
    const pushed = await push({ full });
    const pulled = await pull();
    await db.kvSet(LAST_PUSH, new Date().toISOString());
    status('ok', `↑${pushed} ↓${pulled}`);
    return { ok: true, pushed, pulled };
  } catch (err) {
    console.error('[sync]', err);
    status('err', err.message);
    return { ok: false, error: err.message };
  } finally {
    running = false;
    if (queued) { queued = false; setTimeout(() => run(), 400); }
  }
}

async function push({ full = false } = {}) {
  const since = full ? null : await db.kvGet(LAST_PUSH, null);
  const changed = store.changedSince(since);
  const userId = sb.getUser()?.id;
  if (!userId) throw new Error('Sessão sem usuário.');

  const rows = [];
  for (const [collection, records] of Object.entries(changed)) {
    for (const r of records) {
      rows.push({
        user_id: userId,
        collection,
        id: r.id,
        data: r,
        updated_at: r.updatedAt,
        deleted: !!r.deleted,
      });
    }
  }
  // envia em lotes para não estourar o limite de payload
  const BATCH = 400;
  for (let i = 0; i < rows.length; i += BATCH) {
    await sb.pushRecords(rows.slice(i, i + BATCH));
  }
  return rows.length;
}

async function pull() {
  const since = await db.kvGet(LAST_PULL, null);
  const rows = await sb.pullRecords(since);
  if (!Array.isArray(rows) || !rows.length) return 0;

  const byCollection = {};
  let newest = since;
  for (const row of rows) {
    const record = { ...(row.data || {}), id: row.id, updatedAt: row.updated_at, deleted: !!row.deleted };
    (byCollection[row.collection] ||= []).push(record);
    if (!newest || row.updated_at > newest) newest = row.updated_at;
  }

  let applied = 0;
  for (const [collection, records] of Object.entries(byCollection)) {
    if (!db.COLLECTIONS.includes(collection)) continue;
    applied += await store.applyRemote(collection, records);
  }
  if (newest) await db.kvSet(LAST_PULL, newest);
  return applied;
}

/** Reenvia tudo e rebaixa os marcadores — usado após trocar de conta/dispositivo. */
export async function resync() {
  await db.kvDel(LAST_PULL);
  await db.kvDel(LAST_PUSH);
  return run({ full: true });
}

let started = false;

export function start() {
  if (started) return;
  started = true;

  // sincroniza logo após qualquer alteração, agrupando rajadas
  on('data:changed', () => {
    if (!settings.get('autoSync') || !available()) return;
    clearTimeout(timer);
    timer = setTimeout(() => run(), 2500);
  });

  // ciclo periódico e ao voltar o foco/rede
  setInterval(() => { if (settings.get('autoSync')) run(); }, 5 * 60 * 1000);
  window.addEventListener('online', () => run());
  window.addEventListener('focus', () => { if (settings.get('autoSync')) run(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && settings.get('autoSync')) run();
  });

  if (available()) run();
  else status(settings.isCloudConfigured() ? 'auth' : 'local');
}

export async function lastSyncAt() {
  return db.kvGet(LAST_PUSH, null);
}
