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

/** Executa um ciclo completo (receber + enviar). Nunca lança: reporta pelo barramento. */
export async function run({ full = false } = {}) {
  if (!available()) { status('local'); return { ok: false, reason: 'offline' }; }
  if (running) { queued = true; return { ok: false, reason: 'busy' }; }

  running = true;
  status('sync');
  try {
    // Receber antes de enviar, e não o contrário.
    //
    // O envio é um upsert cego: quem escreve por último no servidor vence, sem
    // olhar carimbo. Enviando primeiro, um aparelho que ficou dias parado
    // empurraria seus registros velhos por cima dos novos — e um `full` (que é
    // o que acontece a cada login) empurraria TODOS eles. Editar no celular e
    // depois abrir o computador apagaria a edição.
    //
    // Recebendo primeiro, a fusão acontece aqui, onde o carimbo é comparado
    // (applyRemote), e o que sai depois já é o estado reconciliado.
    const vindosDeFora = await pull();
    const pushed = await push({ full, pular: vindosDeFora });
    await db.kvSet(LAST_PUSH, new Date().toISOString());
    const pulled = vindosDeFora.size;
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

async function push({ full = false, pular = new Set() } = {}) {
  const since = full ? null : await db.kvGet(LAST_PUSH, null);
  const changed = store.changedSince(since);
  const userId = sb.getUser()?.id;
  if (!userId) throw new Error('Sessão sem usuário.');

  const rows = [];
  for (const [collection, records] of Object.entries(changed)) {
    for (const r of records) {
      // O que acabou de chegar do servidor não precisa voltar para lá.
      if (pular.has(`${collection}/${r.id}`)) continue;
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

/**
 * Recuo de segurança do cursor de recebimento.
 *
 * O cursor é `updated_at > último_visto`, e os carimbos são gerados pelo
 * relógio de CADA aparelho. Basta um estar alguns minutos adiantado para o
 * cursor dele ficar à frente do que o outro acabou de gravar — e a linha nova
 * some do filtro. Some de vez: o cursor nunca volta atrás, então nenhuma
 * sincronização posterior a traz. Foi assim que um perfil preenchido no
 * computador ficou invisível no celular, e apertar "Sincronizar agora" não
 * adiantava nada, porque o pedido saía com o mesmo cursor envenenado.
 *
 * Pior: o veneno é auto-infligido. As próprias linhas do aparelho adiantado
 * voltam no recebimento e empurram o cursor para o futuro dele.
 *
 * Uma hora de recuo cobre a diferença de relógio que se vê no mundo real. As
 * linhas relidas custam quase nada — são pequenas, e applyRemote descarta em
 * memória tudo o que não for mais novo que a cópia local.
 */
const MARGEM_RELOGIO_MS = 60 * 60 * 1000;

/**
 * E a primeira volta de cada sessão vem sem cursor nenhum.
 *
 * É o conserto de quem já está com o cursor estragado: abrir o app reconcilia
 * tudo, sem depender de o dono descobrir que existe um botão "Reenviar tudo".
 */
let primeiraVolta = true;

/** Recebe e funde. Devolve as chaves "coleção/id" que vieram de fora. */
async function pull() {
  const aplicados = new Set();
  const marcador = await db.kvGet(LAST_PULL, null);
  const since = (primeiraVolta || !marcador)
    ? null
    : new Date(Date.parse(marcador) - MARGEM_RELOGIO_MS).toISOString();
  primeiraVolta = false;

  const rows = await sb.pullRecords(since);
  if (!Array.isArray(rows) || !rows.length) return aplicados;

  const byCollection = {};
  // Parte do marcador guardado, e não do `since` recuado: o cursor só anda
  // para a frente, senão o recuo viraria permanente e cresceria a cada volta.
  let newest = marcador;
  for (const row of rows) {
    const record = { ...(row.data || {}), id: row.id, updatedAt: row.updated_at, deleted: !!row.deleted };
    (byCollection[row.collection] ||= []).push(record);
    if (!newest || row.updated_at > newest) newest = row.updated_at;
  }

  for (const [collection, records] of Object.entries(byCollection)) {
    if (!db.COLLECTIONS.includes(collection)) continue;
    for (const id of await store.applyRemote(collection, records)) {
      aplicados.add(`${collection}/${id}`);
    }
  }
  if (newest) await db.kvSet(LAST_PULL, newest);
  return aplicados;
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
