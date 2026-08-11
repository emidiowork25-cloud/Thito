// Casca do app: navegação, roteamento por hash, relógio, paleta de comandos
// e o indicador de sincronização.

import { $, el, debounce, norm } from '../core/util.js';
import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as sync from '../core/sync.js';
import * as cofre from '../core/cofre.js';
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
import * as freela from '../views/freela.js';
import * as eventos from '../views/eventos.js';
import * as copywriter from '../views/copywriter.js';
import * as rotina from '../views/rotina.js';
import * as senhas from '../views/senhas.js';
import * as teleprompter from '../views/teleprompter.js';
import * as ajustes from '../views/ajustes.js';

// Ordem alfabética entre os módulos, com duas exceções deliberadas: Painel
// abre no topo porque é a casa, e Ajustes fica no fim porque é configuração.
// Nenhum dos dois é módulo — alfabetá-los junto jogaria a tela inicial para o
// meio da lista.
export const VIEWS = {
  dashboard: { mod: dashboard, title: 'Painel', icon: '◉' },

  agenda: { mod: agenda, title: 'Agenda', icon: '▤' },
  apresentacoes: { mod: apresentacoes, title: 'Apresentações', icon: '▷' },
  compras: { mod: compras, title: 'Compras', icon: '▦' },
  copywriter: { mod: copywriter, title: 'Copywriter', icon: '✎' },
  eventos: { mod: eventos, title: 'Eventos', icon: '◎' },
  financas: { mod: financas, title: 'Finanças', icon: '◈' },
  freela: { mod: freela, title: 'Freela', icon: '◆' },
  mindmap: { mod: mindmap, title: 'Mind maps', icon: '⁂' },
  reunioes: { mod: reunioes, title: 'Reuniões', icon: '❐' },
  rotina: { mod: rotina, title: 'Rotina', icon: '↻' },
  senhas: { mod: senhas, title: 'Senhas e acessos', icon: '⛨' },
  teleprompter: { mod: teleprompter, title: 'Teleprompter', icon: '▤▤' },

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
      const hoje = store.agendaOn(store.today()).length
        + store.openTasks().filter((t) => t.due && t.due <= store.today()).length;
      return hoje || null;
    }
    case 'compras': {
      const n = store.activeLists().reduce((a, l) => a + store.listTotal(l.id).pending, 0);
      return n || null;
    }
    case 'reunioes': return store.openActionItems().length || null;
    // Freela conta o que está a receber; Eventos, as pendências do que ainda vem.
    // Badge é lembrete do que trava, não contador de linhas.
    // Só o que foi fechado. Proposta pendente não é pendência sua — a bola
    // está com o cliente, e contá-la aqui faz o selo cobrar o que não existe.
    case 'freela': return store.freelasAReceber().length || null;
    case 'eventos': {
      const t = store.today();
      const futuros = store.list('producoes', (e) => !e.date || e.date >= t);
      const n = futuros.reduce((a, e) => a + [
        ...(e.checklist?.antes ?? []), ...(e.checklist?.durante ?? []), ...(e.checklist?.depois ?? []),
      ].filter((i) => !i.done).length, 0);
      return n || null;
    }
    case 'copywriter': return store.list('copies', (c) => c.status === 'revisar').length || null;
    // O que falta hoje. Zerou, o selo some — e sumir é o prêmio.
    case 'rotina': return store.rotinaResumo().pendentes || null;
    // Cofre trancado é o normal e não merece aviso. O que merece é o cofre
    // aberto: dá para esquecer que ele está assim e sair de perto da tela.
    case 'senhas': return cofre.destrancado() ? '🔓' : null;
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
  { title: 'Nova peça de texto', sub: 'copywriter', run: () => { go('copywriter'); emit('action:new-copy'); } },
  { title: 'Nova campanha', sub: 'copywriter', run: () => { go('copywriter'); emit('action:new-campaign'); } },
  { title: 'Novo roteiro de teleprompter', sub: 'teleprompter', run: () => { go('teleprompter'); emit('action:new-script'); } },
  { title: 'Nova tarefa da rotina', sub: 'rotina', run: () => { go('rotina'); emit('action:new-rotina'); } },
  { title: 'Abrir o cofre', sub: 'senhas e acessos', run: () => go('senhas') },
  { title: 'Trancar o cofre', sub: 'senhas e acessos', run: () => { cofre.trancar(); toast('Cofre trancado.', 'ok'); } },
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
    else if (!typing && !e.ctrlKey && !e.metaKey && e.key >= '0' && e.key <= '9') {
      // 1..9 nas nove primeiras seções, 0 na décima
      const keys = Object.keys(VIEWS);
      const target = keys[(Number(e.key) + 9) % 10];
      if (target) go(target);
    }
  });

  window.addEventListener('hashchange', () => {
    const { view, id } = parseHash();
    if (view && (view !== current || id !== currentParams.id)) go(view, id ? { id } : {});
  });

  // O JARBAS pede para abrir seções e recarregar a tela após agir.
  // `date` além de `id`: abrir a agenda num dia (o próximo compromisso, por
  // exemplo) não é a mesma coisa que abrir um registro pelo identificador.
  on('nav:go', ({ view, id, date }) => go(view, { ...(id ? { id } : {}), ...(date ? { date } : {}) }));
  on('nav:refresh', () => render());
  on('data:changed', debounce(() => { renderNav(); }, 200));
  on('cofre:estado', () => renderNav());
  on('settings:changed', () => render());

  const { view, id } = parseHash();
  go(view ?? settings.get('startView') ?? 'dashboard', id ? { id } : {});
}
