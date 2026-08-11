// Store: cache em memória sobre o IndexedDB + regras de domínio.
// Views leem de forma síncrona; escritas persistem e emitem eventos.

import * as db from './db.js';
import { emit } from './bus.js';
import {
  uid, now, today, isoDate, parseDate, addDays, addMonths, monthKey,
  diffDays, sum, norm,
} from './util.js';

const cache = new Map(); // collection -> Map(id, record)

export async function load() {
  for (const c of db.COLLECTIONS) {
    const rows = await db.allRaw(c);
    cache.set(c, new Map(rows.map((r) => [r.id, r])));
  }
  await seedIfEmpty();
}

/** Registros vivos de uma coleção, opcionalmente filtrados. */
export function list(collection, filter) {
  const rows = [...(cache.get(collection)?.values() ?? [])].filter((r) => !r.deleted);
  return filter ? rows.filter(filter) : rows;
}

export function get(collection, id) {
  const row = cache.get(collection)?.get(id);
  return row && !row.deleted ? row : null;
}

/** Cria ou atualiza. Sem `id` cria um novo. Retorna o registro salvo. */
export async function save(collection, patch, { silent = false } = {}) {
  const existing = patch.id ? cache.get(collection)?.get(patch.id) : null;
  const record = {
    ...(existing ?? {}),
    ...patch,
    id: patch.id ?? uid(),
    updatedAt: now(),
    deleted: false,
  };
  if (!record.createdAt) record.createdAt = record.updatedAt;
  cache.get(collection).set(record.id, record);
  await db.put(collection, record);
  if (!silent) emit('data:changed', { collection, id: record.id, action: existing ? 'update' : 'create' });
  return record;
}

export async function saveMany(collection, patches) {
  const out = [];
  for (const p of patches) out.push(await save(collection, p, { silent: true }));
  emit('data:changed', { collection, action: 'bulk' });
  return out;
}

/** Exclusão lógica — preserva o registro para a sincronização propagar. */
export async function remove(collection, id) {
  const existing = cache.get(collection)?.get(id);
  if (!existing) return null;
  const record = { ...existing, deleted: true, updatedAt: now() };
  cache.get(collection).set(id, record);
  await db.put(collection, record);
  emit('data:changed', { collection, id, action: 'delete' });
  return record;
}

/** Aplica registros vindos da nuvem sem reemitir escrita (usado pela sync). */
export async function applyRemote(collection, records) {
  const map = cache.get(collection);
  const toWrite = [];
  for (const r of records) {
    const local = map.get(r.id);
    // último a escrever vence, comparando o carimbo de atualização
    if (local && local.updatedAt >= r.updatedAt) continue;
    map.set(r.id, r);
    toWrite.push(r);
  }
  if (toWrite.length) {
    await db.putMany(collection, toWrite);
    emit('data:changed', { collection, action: 'remote' });
  }
  return toWrite.length;
}

/** Registros alterados desde um carimbo — o que a sync precisa enviar. */
export function changedSince(iso) {
  const out = {};
  for (const c of db.COLLECTIONS) {
    const rows = [...(cache.get(c)?.values() ?? [])].filter((r) => !iso || r.updatedAt > iso);
    if (rows.length) out[c] = rows;
  }
  return out;
}

export async function reload() {
  await load();
  emit('data:changed', { action: 'reload' });
}

/* ================= sementes ================= */

async function seedIfEmpty() {
  if (list('accounts').length === 0) {
    await save('accounts', { name: 'Conta corrente', kind: 'corrente', initial: 0 }, { silent: true });
    await save('accounts', { name: 'Dinheiro', kind: 'carteira', initial: 0 }, { silent: true });
  }
  if (list('lists').length === 0) {
    await save('lists', { name: 'Mercado', archived: false }, { silent: true });
  }
}

/* ================= AGENDA ================= */

export const CATEGORIES_EVENT = ['trabalho', 'pessoal', 'estudo', 'saúde', 'financeiro', 'outro'];

/**
 * Expande eventos recorrentes dentro de um intervalo.
 * recur: null | 'diario' | 'semanal' | 'quinzenal' | 'mensal' | 'anual'
 */
export function eventsBetween(from, to) {
  const out = [];
  for (const ev of list('events')) {
    if (!ev.date) continue;
    if (!ev.recur) {
      if (ev.date >= from && ev.date <= to) out.push({ ...ev, occurrence: ev.date });
      continue;
    }
    let cursor = ev.date;
    let guard = 0;
    // avança até a janela sem gerar milhares de ocorrências
    while (cursor < from && guard++ < 2000) cursor = nextOccurrence(cursor, ev.recur);
    guard = 0;
    while (cursor <= to && guard++ < 500) {
      if (cursor >= from && !(ev.skip ?? []).includes(cursor)) {
        out.push({ ...ev, occurrence: cursor });
      }
      cursor = nextOccurrence(cursor, ev.recur);
    }
  }
  return out.sort((a, b) =>
    (a.occurrence + (a.time || '')).localeCompare(b.occurrence + (b.time || '')));
}

function nextOccurrence(dateStr, recur) {
  switch (recur) {
    case 'diario': return addDays(dateStr, 1);
    case 'semanal': return addDays(dateStr, 7);
    case 'quinzenal': return addDays(dateStr, 14);
    case 'mensal': return addMonths(dateStr, 1);
    case 'anual': return addMonths(dateStr, 12);
    default: return addDays(dateStr, 3650);
  }
}

export const eventsOn = (date) => eventsBetween(date, date);

export function upcoming(days = 7) {
  return eventsBetween(today(), addDays(today(), days));
}

/**
 * O próximo compromisso depois de uma data — o que preencher a tela quando o
 * dia está vazio. "Nada marcado" e ponto final é verdade inútil: quem abre a
 * agenda num dia livre quer saber o que vem.
 *
 * A janela cresce em degraus em vez de varrer o ano de uma vez: expandir um
 * evento diário por 365 dias para descobrir que havia algo amanhã é trabalho
 * jogado fora a cada desenho de tela.
 */
export function nextEventAfter(date = today()) {
  const inicio = addDays(date, 1);
  for (const janela of [14, 60, 365]) {
    const achados = eventsBetween(inicio, addDays(date, janela));
    if (achados.length) return achados[0];
  }
  return null;
}

/**
 * O próximo compromisso a partir de agora: o que ainda não passou hoje e,
 * se hoje já acabou, o primeiro dos dias seguintes.
 */
export function nextEvent() {
  const t = today();
  const agora = new Date().toTimeString().slice(0, 5);
  // eventsOn já devolve cada item com `occurrence` preenchido.
  return eventsOn(t).find((e) => !e.time || e.time >= agora) ?? nextEventAfter(t);
}

/* ================= TAREFAS ================= */

export function openTasks() {
  return list('tasks', (t) => !t.done)
    .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}

export const overdueTasks = () => openTasks().filter((t) => t.due && t.due < today());

/* ================= FINANCEIRO ================= */

export const CATEGORIES_FIN = [
  'moradia', 'alimentação', 'transporte', 'saúde', 'educação', 'lazer',
  'assinaturas', 'compras', 'impostos', 'salário', 'investimento', 'outro',
];

export function accountBalance(accountId) {
  const acc = get('accounts', accountId);
  if (!acc) return 0;
  const txs = list('transactions', (t) => t.accountId === accountId && !t.pending);
  return (Number(acc.initial) || 0) + sum(txs, (t) => (t.type === 'out' ? -t.amount : t.amount));
}

export const totalBalance = () => sum(list('accounts'), (a) => accountBalance(a.id));

export function monthTransactions(mk = monthKey(today())) {
  return list('transactions', (t) => monthKey(t.date) === mk)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function monthSummary(mk = monthKey(today())) {
  const txs = monthTransactions(mk);
  const income = sum(txs.filter((t) => t.type === 'in'), (t) => t.amount);
  const expense = sum(txs.filter((t) => t.type === 'out'), (t) => t.amount);
  const byCategory = {};
  for (const t of txs.filter((x) => x.type === 'out')) {
    byCategory[t.category || 'outro'] = (byCategory[t.category || 'outro'] || 0) + t.amount;
  }
  return { month: mk, income, expense, net: income - expense, byCategory, count: txs.length };
}

/** Orçamentos do mês com o quanto já foi gasto em cada categoria. */
export function budgetStatus(mk = monthKey(today())) {
  const { byCategory } = monthSummary(mk);
  return list('budgets').map((b) => {
    const spent = byCategory[b.category] || 0;
    const limit = Number(b.monthly) || 0;
    return { ...b, spent, limit, pct: limit ? spent / limit : 0, remaining: limit - spent };
  }).sort((a, b) => b.pct - a.pct);
}

/** Contas recorrentes ainda não lançadas no mês corrente. */
export function dueRecurring(mk = monthKey(today())) {
  const paidThisMonth = new Set(
    monthTransactions(mk).map((t) => t.recurringId).filter(Boolean),
  );
  return list('transactions', (t) => t.recurring && !t.recurringTemplateOf)
    .filter((t) => !paidThisMonth.has(t.id))
    .map((t) => ({ ...t, dueDate: `${mk}-${String(parseDate(t.date).getDate()).padStart(2, '0')}` }));
}

/* ================= COMPRAS ================= */

export const activeLists = () => list('lists', (l) => !l.archived);

export const listItems = (listId) =>
  list('items', (i) => i.listId === listId)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.createdAt || '').localeCompare(b.createdAt || ''));

export function listTotal(listId) {
  const items = listItems(listId);
  return {
    count: items.length,
    pending: items.filter((i) => !i.done).length,
    estimate: sum(items, (i) => (Number(i.price) || 0) * (Number(i.qty) || 1)),
    spent: sum(items.filter((i) => i.done), (i) => (Number(i.price) || 0) * (Number(i.qty) || 1)),
  };
}

/* ================= REUNIÕES ================= */

export const recentMeetings = (n = 10) =>
  list('meetings').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, n);

/** Action items abertos, achatados de todas as reuniões. */
export function openActionItems() {
  const out = [];
  for (const m of list('meetings')) {
    for (const a of m.actions ?? []) {
      if (!a.done) out.push({ ...a, meetingId: m.id, meetingTitle: m.title, meetingDate: m.date });
    }
  }
  return out.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
}

/* ================= ROTINA ================= */

/** Domingo é 0 no JavaScript; quem monta a semana começa na segunda. */
export const DIAS_SEMANA = [
  { n: 1, curto: 'seg', longo: 'segunda' },
  { n: 2, curto: 'ter', longo: 'terça' },
  { n: 3, curto: 'qua', longo: 'quarta' },
  { n: 4, curto: 'qui', longo: 'quinta' },
  { n: 5, curto: 'sex', longo: 'sexta' },
  { n: 6, curto: 'sáb', longo: 'sábado' },
  { n: 0, curto: 'dom', longo: 'domingo' },
];

export const rotinasAtivas = () => list('rotinas', (r) => !r.arquivada)
  .sort((a, b) => (a.horario || '99').localeCompare(b.horario || '99')
    || (a.createdAt || '').localeCompare(b.createdAt || ''));

/** As tarefas que valem para uma data, pelo dia da semana dela. */
export function rotinasDoDia(date = today()) {
  const dow = parseDate(date).getDay();
  return rotinasAtivas().filter((r) => (r.dias ?? []).includes(dow));
}

export const rotinaFeita = (r, date) => !!(r.feitos ?? {})[date];

export function rotinaResumo(date = today()) {
  const itens = rotinasDoDia(date);
  const feitos = itens.filter((r) => rotinaFeita(r, date));
  return {
    total: itens.length,
    feitos: feitos.length,
    pendentes: itens.length - feitos.length,
    pct: itens.length ? feitos.length / itens.length : 0,
    completo: itens.length > 0 && feitos.length === itens.length,
  };
}

/** A segunda-feira da semana em que a data cai. */
export function segundaDe(date) {
  const dow = parseDate(date).getDay();
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/* ================= BUSCA GLOBAL ================= */

const SEARCHABLE = {
  events: { label: 'Agenda', view: 'agenda', fields: ['title', 'notes', 'category'] },
  tasks: { label: 'Tarefa', view: 'agenda', fields: ['title', 'notes'] },
  transactions: { label: 'Financeiro', view: 'financas', fields: ['desc', 'category', 'note'] },
  items: { label: 'Compras', view: 'compras', fields: ['name', 'category'] },
  mindmaps: { label: 'Mind map', view: 'mindmap', fields: ['title'] },
  meetings: { label: 'Reunião', view: 'reunioes', fields: ['title', 'notes', 'participants', 'decisions'] },
  decks: { label: 'Apresentação', view: 'apresentacoes', fields: ['title', 'topic'] },
  notes: { label: 'Nota', view: 'dashboard', fields: ['title', 'body'] },
};

export function search(query, limit = 30) {
  const q = norm(query).trim();
  if (q.length < 2) return [];
  const out = [];
  for (const [collection, meta] of Object.entries(SEARCHABLE)) {
    for (const row of list(collection)) {
      const hay = norm(meta.fields.map((f) => {
        const v = row[f];
        return Array.isArray(v) ? v.join(' ') : v;
      }).filter(Boolean).join(' '));
      if (!hay.includes(q)) continue;
      out.push({
        collection,
        id: row.id,
        view: meta.view,
        label: meta.label,
        title: row.title || row.desc || row.name || '(sem título)',
        date: row.date || row.due || row.updatedAt?.slice(0, 10),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/* ================= ESTATÍSTICAS / HÁBITOS ================= */

/** Sinais que o assistente usa para dar dicas com base no histórico. */
export function insights() {
  const out = [];
  const mk = monthKey(today());
  const prevMk = monthKey(addMonths(`${mk}-01`, -1));
  const cur = monthSummary(mk);
  const prev = monthSummary(prevMk);

  if (cur.net < 0) {
    out.push({
      kind: 'financeiro', level: 'warn',
      text: `Você está no vermelho neste mês: gastou ${fmt(cur.expense)} contra ${fmt(cur.income)} de entrada.`,
    });
  }
  for (const [cat, val] of Object.entries(cur.byCategory)) {
    const before = prev.byCategory[cat] || 0;
    if (before > 0 && val > before * 1.4 && val - before > 100) {
      out.push({
        kind: 'financeiro', level: 'warn',
        text: `Gasto em ${cat} subiu ${Math.round((val / before - 1) * 100)}% vs. o mês passado (${fmt(before)} → ${fmt(val)}).`,
      });
    }
  }
  for (const b of budgetStatus(mk)) {
    if (b.pct >= 1) out.push({ kind: 'financeiro', level: 'bad', text: `Orçamento de ${b.category} estourado: ${fmt(b.spent)} de ${fmt(b.limit)}.` });
    else if (b.pct >= 0.8) out.push({ kind: 'financeiro', level: 'warn', text: `Orçamento de ${b.category} em ${Math.round(b.pct * 100)}%.` });
  }

  const late = overdueTasks();
  if (late.length) {
    out.push({ kind: 'tarefas', level: 'warn', text: `${late.length} tarefa(s) atrasada(s), a mais antiga desde ${late[0].due}.` });
  }
  const actions = openActionItems();
  if (actions.length >= 3) {
    out.push({ kind: 'reuniões', level: 'info', text: `${actions.length} encaminhamentos de reunião ainda abertos.` });
  }
  const tomorrow = eventsOn(addDays(today(), 1));
  if (tomorrow.length >= 4) {
    out.push({ kind: 'agenda', level: 'info', text: `Amanhã está cheio: ${tomorrow.length} compromissos.` });
  }
  const staleMaps = list('mindmaps').filter((m) => diffDays(m.updatedAt?.slice(0, 10) || today(), today()) > 21);
  if (staleMaps.length) {
    out.push({ kind: 'estudos', level: 'info', text: `${staleMaps.length} mind map(s) sem revisão há mais de 3 semanas — bom momento para uma revisão espaçada.` });
  }
  return out;
}

const fmt = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

/* Reexports usados pelas views */
export { isoDate, today, addDays, addMonths, monthKey };
