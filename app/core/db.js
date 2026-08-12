// Camada IndexedDB. Um object store por coleção, todos com a mesma forma:
// { id, updatedAt, deleted, ...campos }

// O banco continua se chamando 'thito' de propósito: o sistema foi renomeado para
// JARBAS, mas trocar o nome aqui esconderia todos os dados que já estão gravados no
// navegador de quem usou a versão anterior. Nome interno não é marca.
const DB_NAME = 'thito';
const DB_VERSION = 6;

export const COLLECTIONS = [
  'events',      // agenda
  'tasks',       // pendências / action items
  'accounts',    // contas financeiras
  'transactions',
  'budgets',
  'lists',       // listas de compras
  'items',       // itens das listas
  'mindmaps',
  'meetings',
  'decks',       // apresentações
  'chats',       // histórico de conversas com o assistente
  'notes',       // anotações avulsas / memória do assistente
  // v3 — módulos FREELA e EVENTOS.
  // 'producoes' e não 'eventos': 'events' já é a agenda, e duas coleções com
  // nomes quase iguais é armadilha garantida na próxima leitura deste arquivo.
  'freelas',
  'producoes',

  // v4 — SENHAS E ACESSOS.
  // Esta coleção é a única do sistema cujo conteúdo está cifrado em repouso:
  // aqui só existem { id, iv, ct }. Quem for mexer nela leia core/cofre.js
  // antes — gravar um campo em texto claro aqui derruba a proteção inteira,
  // porque este banco e a tabela do Supabase recebem exatamente o que vier.
  'cofre',

  // v5 — módulo ROTINA (tarefas que se repetem toda semana).
  'rotinas',

  // v6 — PREFERÊNCIAS que acompanham a pessoa, não o aparelho.
  // Guarda um único registro. Existe porque os ajustes moravam fora das
  // coleções e por isso nunca viajavam: entrar com a mesma conta no celular
  // trazia agenda, finanças e tudo mais, e deixava o "Sobre você" em branco.
  // Ver core/prefs.js para o que entra aqui e, principalmente, o que não entra.
  'prefs',

  // v2 — módulos COPYWRITER e TELEPROMPTER
  'brands',      // vozes de marca (tom, público, o que evitar)
  'copies',      // peças de texto: posts, roteiros, anúncios, e-mails
  'campaigns',   // campanhas que agrupam peças
  'metrics',     // métricas coladas do Meta Business e afins
  'scripts',     // roteiros do teleprompter
];

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode = 'readonly') {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Todos os registros vivos de uma coleção (exclui apagados). */
export async function all(collection) {
  const store = await tx(collection);
  const rows = await wrap(store.getAll());
  return rows.filter((r) => !r.deleted);
}

/** Todos os registros, inclusive os marcados como apagados (usado pela sync). */
export async function allRaw(collection) {
  const store = await tx(collection);
  return wrap(store.getAll());
}

export async function get(collection, id) {
  const store = await tx(collection);
  const row = await wrap(store.get(id));
  return row && !row.deleted ? row : null;
}

export async function put(collection, record) {
  const store = await tx(collection, 'readwrite');
  await wrap(store.put(record));
  return record;
}

export async function putMany(collection, records) {
  if (!records.length) return;
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(collection, 'readwrite');
    const store = t.objectStore(collection);
    for (const r of records) store.put(r);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

export async function hardDelete(collection, id) {
  const store = await tx(collection, 'readwrite');
  return wrap(store.delete(id));
}

export async function clear(collection) {
  const store = await tx(collection, 'readwrite');
  return wrap(store.clear());
}

/* ---------- kv (configurações, tokens, marcadores de sync) ---------- */

export async function kvGet(key, fallback = null) {
  const store = await tx('kv');
  const v = await wrap(store.get(key));
  return v === undefined ? fallback : v;
}

export async function kvSet(key, value) {
  const store = await tx('kv', 'readwrite');
  return wrap(store.put(value, key));
}

export async function kvDel(key) {
  const store = await tx('kv', 'readwrite');
  return wrap(store.delete(key));
}

/* ---------- backup ---------- */

export async function exportAll() {
  const out = { version: DB_VERSION, exportedAt: new Date().toISOString(), data: {} };
  for (const c of COLLECTIONS) out.data[c] = await allRaw(c);
  return out;
}

export async function importAll(dump, { replace = false } = {}) {
  if (!dump?.data) throw new Error('Arquivo de backup inválido.');
  let count = 0;
  for (const c of COLLECTIONS) {
    const rows = dump.data[c];
    if (!Array.isArray(rows)) continue;
    if (replace) await clear(c);
    await putMany(c, rows);
    count += rows.length;
  }
  return count;
}
