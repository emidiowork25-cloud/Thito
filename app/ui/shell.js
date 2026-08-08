// Casca do app: navegação, roteamento por hash, relógio, paleta de comandos
// e o indicador de sincronização.

import { $, el, debounce, norm } from '../core/util.js';
import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as sync from '../core/sync.js';
import { on, emit } from '../core/bus.js';
import { modal, toast } from './components.js';
import * as jarbas from '../assistant/jarbas.js';

import * as dashboard from '../views/dashboard.js';
import * as agenda from '../views/agenda.js';
import * as financas from '../views/financas.js';
import * as compras from '../views/compras.js';
import * as mindmap from '../views/mindmap.js';
import * as reunioes from '../views/reunioes.js';
import * as apresentacoes from '../views/apresentacoes.js';
import * as ajustes from '../views/ajustes.js';

export const VIEWS = {
  dashboard: { mod: dashboard, title: 'Painel', icon: '◉' },
  agenda: { mod: agenda, title: 'Agenda', icon: '▤' },
  financas: { mod: financas, title: 'Finanças', icon: '◈' },
  compras: { mod: compras, title: 'Compras', icon: '▦' },
  mindmap: { mod: mindmap, title: 'Mind maps', icon: '⁂' },
  reunioes: { mod: reunioes, title: 'Reuniões', icon: '❐' },
  apresentacoes: { mod: apresentacoes, title: 'Apresentações', icon: '▷' },
  ajustes: { mod: ajustes, title: 'Ajustes', icon: '⚙' },
};

let current = null;
let currentParams = {};

/* ============================ navegação ============================ */

export function go(view, params = {}) {
  if (!VIEWS[view]) view = 'dashboard';
  current = view;
  currentParams = params;
  const hash = params.id ? `#/${view}/${params.id}` : `#/${view}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  render();
  $('#sidebar')?.classList.remove('open');
}

function parseHash() {
  // '#/financas/abc' -> ['financas', 'abc']
  const [view, id] = (location.hash || '').replace(/^#\/?/, '').split('/');
  return { view: VIEWS[view] ? view : null, id: id || null };
}

export function render() {
  const view = VIEWS[current];
  if (!view) return;
  const container = $('#view');
  $('#view-title').textContent = view.title;
  container.innerHTML = '';
  try {
    view.mod.render(container, currentParams);
  } catch (err) {
    console.error(`[view:${current}]`, err);
    container.append(el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h2', { text: 'Erro ao desenhar a tela' })),
      el('pre', { class: 'tiny dim', style: 'white-space:pre-wrap', text: String(err?.stack || err) })));
  }
  renderNav();
}

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  for (const [key, meta] of Object.entries(VIEWS)) {
    const badge = badgeFor(key);
    nav.append(el('button', {
      class: `nav-item ${key === current ? 'active' : ''}`,
      onclick: () => go(key),
    },
    el('span', { class: 'ico', text: meta.icon }),
    el('span', { text: meta.title }),
    badge ? el('span', { class: 'badge', text: String(badge) }) : null));
  }
}

function badgeFor(view) {
  switch (view) {
    case 'agenda': {
      const hoje = store.eventsOn(store.today()).length + store.openTasks().filter((t) => t.due && t.due <= store.today()).length;
      return hoje || null;
    }
    case 'compras': {
      const n = store.activeLists().reduce((a, l) => a + store.listTotal(l.id).pending, 0);
      return n || null;
    }
    case 'reunioes': return store.openActionItems().length || null;
    default: return null;
  }
}

/* ============================ relógio ============================ */

function startClock() {
  const node = $('#clock');
  const tick = () => {
    const d = new Date();
    node.textContent = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
      + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 20000);
}

/* ============================ sincronização ============================ */

const SYNC_LABEL = {
  local: 'só neste PC',
  auth: 'entre na conta',
  sync: 'sincronizando…',
  ok: 'sincronizado',
  err: 'falha na sync',
};

function wireSync() {
  const chip = $('#sync-chip');
  const label = chip.querySelector('.sync-label');
  on('sync:status', ({ state, detail }) => {
    chip.dataset.state = state;
    label.textContent = SYNC_LABEL[state] ?? state;
    chip.title = detail ? `${SYNC_LABEL[state] ?? state} — ${detail}` : (SYNC_LABEL[state] ?? state);
  });
  chip.addEventListener('click', async () => {
    if (!settings.isCloudConfigured()) { go('ajustes'); return; }
    const r = await sync.run();
    if (r.ok) toast(`Sincronizado (↑${r.pushed} ↓${r.pulled}).`, 'ok');
    else if (r.reason === 'offline') go('ajustes');
  });
}

/* ============================ paleta de comandos ============================ */

const ACTIONS = [
  { title: 'Novo compromisso', sub: 'agenda', run: () => { go('agenda'); emit('action:new-event'); } },
  { title: 'Nova tarefa', sub: 'agenda', run: () => { go('agenda'); emit('action:new-task'); } },
  { title: 'Novo lançamento', sub: 'finanças', run: () => { go('financas'); emit('action:new-transaction'); } },
  { title: 'Novo item de compra', sub: 'compras', run: () => { go('compras'); emit('action:new-item'); } },
  { title: 'Nova reunião', sub: 'reuniões', run: () => { go('reunioes'); emit('action:new-meeting'); } },
  { title: 'Novo mind map', sub: 'mind maps', run: () => { go('mindmap'); emit('action:new-mindmap'); } },
  { title: 'Nova apresentação', sub: 'apresentações', run: () => { go('apresentacoes'); emit('action:new-deck'); } },
  { title: 'Perguntar ao JARBAS', sub: 'assistente', run: () => jarbas.open() },
  { title: 'Falar com o JARBAS', sub: 'voz', run: () => { jarbas.open(); jarbas.startListening(); } },
  { title: 'Sincronizar agora', sub: 'nuvem', run: () => sync.run() },
  { title: 'Alternar tema', sub: 'aparência', run: () => settings.set({ theme: settings.get('theme') === 'dark' ? 'light' : 'dark' }) },
];

export function openPalette() {
  let selected = 0;
  let results = [];

  const input = el('input', { type: 'text', placeholder: 'Buscar ou executar…', autocomplete: 'off' });
  const list = el('div', { class: 'palette-list' });

  const m = modal({
    title: null,
    wide: false,
    render: () => el('div', {}, input, list),
  });
  m.root.classList.add('palette');
  m.root.querySelector('.modal-head')?.remove();
  m.body.style.padding = '0';

  const compute = (q) => {
    const nq = norm(q).trim();
    const navResults = Object.entries(VIEWS)
      .filter(([k, v]) => !nq || norm(v.title).includes(nq) || norm(k).includes(nq))
      .map(([k, v]) => ({ title: v.title, sub: 'ir para', run: () => go(k) }));
    const actionResults = ACTIONS.filter((a) => !nq || norm(a.title).includes(nq));
    const dataResults = nq.length >= 2
      ? store.search(q, 12).map((r) => ({
        title: r.title, sub: r.label, run: () => go(r.view, { id: r.id, focus: r.id }),
      }))
      : [];
    const askJarbas = nq.length >= 3
      ? [{ title: `Perguntar ao JARBAS: “${q}”`, sub: 'assistente', run: () => jarbas.askFrom(q) }]
      : [];
    return [...dataResults, ...actionResults, ...navResults, ...askJarbas].slice(0, 14);
  };

  const draw = () => {
    list.innerHTML = '';
    if (!results.length) { list.append(el('div', { class: 'empty', text: 'Nada encontrado.' })); return; }
    results.forEach((r, i) => {
      list.append(el('div', {
        class: `palette-item ${i === selected ? 'sel' : ''}`,
        onclick: () => { m.close(); r.run(); },
      }, el('span', { text: r.title }), el('span', { class: 'sub', text: r.sub })));
    });
  };

  const update = debounce(() => { results = compute(input.value); selected = 0; draw(); }, 90);
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(results.length - 1, selected + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); draw(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[selected];
      if (r) { m.close(); r.run(); }
    }
  });

  results = compute('');
  draw();
  input.focus();
}

/* ============================ inicialização ============================ */

export function init() {
  startClock();
  wireSync();

  $('#btn-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#btn-palette').addEventListener('click', openPalette);
  $('#btn-jarbas').addEventListener('click', () => jarbas.toggle());

  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); jarbas.toggle(); }
    else if (e.key === 'Escape' && jarbas.isOpen() && !document.querySelector('.modal-back')) jarbas.close();
    else if (!typing && !e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '8') {
      const keys = Object.keys(VIEWS);
      const target = keys[Number(e.key) - 1];
      if (target) go(target);
    }
  });

  window.addEventListener('hashchange', () => {
    const { view, id } = parseHash();
    if (view && (view !== current || id !== currentParams.id)) go(view, id ? { id } : {});
  });

  // O JARBAS pede para abrir seções e recarregar a tela após agir.
  on('nav:go', ({ view, id }) => go(view, id ? { id } : {}));
  on('nav:refresh', () => render());
  on('data:changed', debounce(() => { renderNav(); }, 200));
  on('settings:changed', () => render());

  const { view, id } = parseHash();
  go(view ?? settings.get('startView') ?? 'dashboard', id ? { id } : {});
}
