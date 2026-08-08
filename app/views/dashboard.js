// Painel — a primeira tela do dia: o que importa agora, num olhar.

import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as ctx from '../assistant/context.js';
import * as jarbas from '../assistant/jarbas.js';
import { el, money, fmtDate, fmtTime, relDay, today, addDays, monthKey, truncate } from '../core/util.js';
import { statTile, meter, sectionCard, emptyState } from '../ui/components.js';
import { emit } from '../core/bus.js';

export function render(root) {
  const t = today();

  root.append(hero());
  root.append(el('div', { class: 'grid dash-stats' },
    tileAgenda(t), tileTarefas(t), tileFinancas(), tileCompras()));

  root.append(el('div', { class: 'grid dash-main' },
    el('div', { class: 'grid', style: 'align-content:start' }, cardHoje(t), cardProximos(t)),
    el('div', { class: 'grid', style: 'align-content:start' }, cardSinais(), cardFinancas(), cardPendencias())));
}

/* ---------- topo ---------- */

function hero() {
  const resumo = ctx.briefing();
  return el('div', { class: 'hero card' },
    el('div', { class: 'hero-text' },
      el('div', { class: 'hero-greet', text: ctx.greeting() }),
      el('p', { class: 'hero-brief', text: resumo }),
    ),
    el('div', { class: 'hero-actions' },
      el('button', {
        class: 'btn primary', text: '◈  Falar com o JARBAS',
        onclick: () => { jarbas.open(); },
      }),
      el('button', {
        class: 'btn', text: '🎤  Comando de voz',
        onclick: () => { jarbas.open({ focus: false }); jarbas.startListening(); },
      }),
      el('button', {
        class: 'btn', text: 'Resumir meu dia',
        onclick: () => jarbas.askFrom('Faça um resumo do meu dia: agenda, tarefas mais urgentes e qualquer coisa financeira que eu deva olhar. Seja direto.'),
      }),
    ));
}

/* ---------- indicadores ---------- */

function tileAgenda(t) {
  const hoje = store.eventsOn(t);
  const proximo = hoje.find((e) => !e.time || e.time >= new Date().toTimeString().slice(0, 5));
  return statTile({
    label: 'Hoje na agenda',
    value: String(hoje.length),
    sub: proximo ? `próximo: ${truncate(proximo.title, 26)}${proximo.time ? ` ${fmtTime(proximo.time)}` : ''}` : 'nada marcado',
  });
}

function tileTarefas(t) {
  const abertas = store.openTasks();
  const atrasadas = abertas.filter((x) => x.due && x.due < t);
  return statTile({
    label: 'Tarefas abertas',
    value: String(abertas.length),
    sub: atrasadas.length ? `${atrasadas.length} atrasada(s)` : 'nada atrasado',
    tone: atrasadas.length ? 'bad' : '',
  });
}

function tileFinancas() {
  const r = store.monthSummary();
  return statTile({
    label: `Resultado de ${monthKey(today())}`,
    value: money(r.net),
    sub: `${money(r.income)} entrou · ${money(r.expense)} saiu`,
    tone: r.net < 0 ? 'bad' : 'ok',
  });
}

function tileCompras() {
  const pendentes = store.activeLists().reduce((a, l) => a + store.listTotal(l.id).pending, 0);
  const estimativa = store.activeLists().reduce((a, l) => a + store.listTotal(l.id).estimate, 0);
  return statTile({
    label: 'Itens a comprar',
    value: String(pendentes),
    sub: estimativa ? `estimativa ${money(estimativa)}` : 'sem estimativa',
  });
}

/* ---------- cartões ---------- */

function cardHoje(t) {
  const eventos = store.eventsOn(t);
  const tarefas = store.openTasks().filter((x) => x.due && x.due <= t);
  const body = el('div', { class: 'timeline' });

  if (!eventos.length && !tarefas.length) {
    body.append(emptyState('Dia livre. Aproveite — ou planeje algo.', 'Novo compromisso',
      () => emit('action:new-event')));
  }

  for (const e of eventos) {
    body.append(el('div', { class: 'tl-row' },
      el('div', { class: 'tl-time mono', text: e.time ? fmtTime(e.time) : '—' }),
      el('div', { class: 'tl-body' },
        el('div', { class: 'tl-title', text: e.title }),
        e.notes ? el('div', { class: 'tiny dim', text: truncate(e.notes, 70) }) : null),
      e.category ? el('span', { class: 'pill', text: e.category }) : null));
  }

  for (const x of tarefas) {
    body.append(el('div', { class: 'tl-row' },
      el('div', { class: 'tl-time mono', text: '☐' }),
      el('div', { class: 'tl-body' },
        el('div', { class: 'tl-title', text: x.title }),
        el('div', { class: 'tiny dim', text: `prazo ${relDay(x.due)}` })),
      el('button', {
        class: 'btn sm', text: 'Feito',
        onclick: async () => { await store.save('tasks', { id: x.id, done: true }); emit('nav:refresh'); },
      })));
  }

  return sectionCard('Hoje', [
    el('button', { class: 'btn sm', text: '+ compromisso', onclick: () => emit('action:new-event') }),
  ], body);
}

function cardProximos(t) {
  const proximos = store.eventsBetween(addDays(t, 1), addDays(t, 7));
  const body = el('div', { class: 'list-plain' });
  if (!proximos.length) body.append(emptyState('Nada nos próximos 7 dias.'));
  for (const e of proximos.slice(0, 8)) {
    body.append(el('div', { class: 'lp-row' },
      el('span', { class: 'lp-date mono', text: fmtDate(e.occurrence, { weekday: true }) }),
      el('span', { class: 'lp-main', text: e.title }),
      el('span', { class: 'tiny dim', text: e.time ? fmtTime(e.time) : '' })));
  }
  return sectionCard('Próximos 7 dias', null, body);
}

function cardSinais() {
  const sinais = store.insights();
  const body = el('div', { class: 'list-plain' });
  if (!sinais.length) {
    body.append(el('div', { class: 'empty', text: 'Nada fora do lugar. Tudo sob controle.' }));
  }
  for (const s of sinais.slice(0, 6)) {
    body.append(el('div', { class: `signal ${s.level}` },
      el('span', { class: 'signal-kind', text: s.kind }),
      el('span', { text: s.text })));
  }
  return sectionCard('Sinais', [
    el('button', {
      class: 'btn sm', text: 'Analisar',
      onclick: () => jarbas.askFrom('Olhe os sinais detectados no meu contexto e me diga, em no máximo 5 linhas, o que eu deveria fazer hoje a respeito. Priorize pelo impacto.'),
    }),
  ], body);
}

function cardFinancas() {
  const r = store.monthSummary();
  const body = el('div');
  const top = Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maior = top[0]?.[1] || 1;

  if (!top.length) body.append(emptyState('Nenhum gasto lançado neste mês.', 'Novo lançamento',
    () => emit('action:new-transaction')));

  for (const [cat, val] of top) {
    body.append(el('div', { class: 'bar-row' },
      el('span', { class: 'bar-label', text: cat }),
      el('div', { class: 'bar-track' }, el('span', { class: 'bar-fill', style: `width:${(val / maior) * 100}%` })),
      el('span', { class: 'bar-value mono', text: money(val) })));
  }

  const orcamentos = store.budgetStatus().slice(0, 3);
  if (orcamentos.length) {
    body.append(el('div', { class: 'tiny dim', style: 'margin:14px 0 6px', text: 'Orçamentos' }));
    for (const b of orcamentos) {
      body.append(el('div', { class: 'budget-row' },
        el('div', { class: 'budget-top' },
          el('span', { text: b.category }),
          el('span', { class: 'mono tiny', text: `${money(b.spent)} / ${money(b.limit)}` })),
        meter(b.pct)));
    }
  }

  return sectionCard(`Gastos de ${monthKey(today())}`, [
    el('button', { class: 'btn sm', text: '+ lançamento', onclick: () => emit('action:new-transaction') }),
  ], body);
}

function cardPendencias() {
  const acoes = store.openActionItems().slice(0, 6);
  const body = el('div', { class: 'list-plain' });
  if (!acoes.length) body.append(el('div', { class: 'empty', text: 'Sem encaminhamentos pendentes.' }));
  for (const a of acoes) {
    body.append(el('div', { class: 'lp-row' },
      el('input', {
        type: 'checkbox',
        onchange: async () => {
          const m = store.get('meetings', a.meetingId);
          if (!m) return;
          const actions = m.actions.map((x) => (x.id === a.id ? { ...x, done: true } : x));
          await store.save('meetings', { id: m.id, actions });
          emit('nav:refresh');
        },
      }),
      el('span', { class: 'lp-main', text: a.text }),
      el('span', { class: 'tiny dim', text: a.due ? relDay(a.due) : a.meetingTitle })));
  }
  return sectionCard('Encaminhamentos', null, body);
}
