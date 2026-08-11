// Painel — a primeira tela do dia: o que importa agora, num olhar.

import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as noticias from '../core/noticias.js';
import * as ctx from '../assistant/context.js';
import * as jarbas from '../assistant/jarbas.js';
import { el, money, fmtDate, fmtTime, relDay, today, addDays, monthKey, truncate } from '../core/util.js';
import { statTile, meter, sectionCard, emptyState, proximoCompromisso } from '../ui/components.js';
import { emit } from '../core/bus.js';

export function render(root) {
  const t = today();

  root.append(hero());

  // O topo mostra o que precisa de você, não como você está indo. Saldo do mês
  // é boa informação e péssima manchete: some do painel e continua em Finanças,
  // onde alguém vai olhar querendo saber disso.
  const tiles = [tileRotina(t), tileAgenda(t), tileTarefas(t), tileReceber(), tileProximaEntrega(t)].filter(Boolean);
  root.append(el('div', { class: 'grid dash-stats' }, ...tiles));

  root.append(el('div', { class: 'grid dash-main' },
    el('div', { class: 'grid', style: 'align-content:start' }, cardNoticias(), cardHoje(t), cardProximos(t)),
    el('div', { class: 'grid', style: 'align-content:start' }, cardSinais(), cardFinancas(), cardPendencias())));
}

/* ---------- notícias ---------- */

/**
 * As manchetes do dia. Desenha o que já está em cache na hora (render é
 * síncrono) e busca por trás quando ainda não buscou hoje — o cartão se
 * preenche sozinho em vez de segurar a tela inteira esperando a rede.
 */
function cardNoticias() {
  const corpo = el('div', { class: 'list-plain' });
  const card = sectionCard('Notícias de hoje', [
    el('button', { class: 'btn sm', text: '⟳', title: 'Buscar de novo', onclick: () => atualizarNoticias(corpo, true) }),
  ], corpo);

  corpo.append(el('div', { class: 'tiny dim', text: 'Carregando…' }));
  atualizarNoticias(corpo, false);
  return card;
}

async function atualizarNoticias(corpo, forcar) {
  let pacote = forcar ? null : await noticias.cache();

  if (!pacote) {
    // Sem cache: só busca sozinho depois da hora combinada. Antes disso o
    // cartão explica por que está vazio, em vez de parecer quebrado.
    if (!forcar && !(settings.get('noticiasAuto') && noticias.estaNaHora())) {
      corpo.innerHTML = '';
      corpo.append(el('div', { class: 'tiny dim', text: `As manchetes chegam às ${settings.get('noticiasHora') || '08:00'}. Use ⟳ para ver agora.` }));
      return;
    }
    corpo.innerHTML = '';
    corpo.append(el('div', { class: 'tiny dim', text: 'Buscando manchetes…' }));
    pacote = await noticias.buscar();
  }

  corpo.innerHTML = '';

  if (pacote.erro) {
    corpo.append(el('div', { class: 'tiny dim', text: pacote.erro }));
    return;
  }

  const comConteudo = (pacote.temas ?? []).filter((t) => t.itens?.length);
  const falhou = (pacote.temas ?? []).filter((t) => t.erro);

  // Quando tudo falha é justamente quando o motivo importa. A versão anterior
  // saía por aqui com "nenhuma manchete veio" e engolia os erros de cada tema,
  // deixando o único diagnóstico útil sem chegar à tela.
  if (!comConteudo.length) {
    corpo.append(el('div', { class: 'tiny dim', text: 'Nenhuma manchete veio.' }));
    for (const t of falhou) {
      corpo.append(el('div', { class: 'tiny dim', style: 'margin-top:4px', text: `· ${t.label}: ${t.erro}` }));
    }
    if (!falhou.length) {
      corpo.append(el('div', { class: 'tiny dim', style: 'margin-top:4px', text: 'Os feeds responderam, mas sem nenhuma notícia dentro.' }));
    }
    return;
  }

  for (const tema of comConteudo) {
    corpo.append(el('div', { class: 'noticia-tema', text: tema.label }));
    for (const item of tema.itens) {
      corpo.append(el('a', {
        class: 'noticia', href: item.link, target: '_blank', rel: 'noopener noreferrer',
      },
      el('span', { class: 'noticia-titulo', text: item.titulo }),
      item.fonte ? el('span', { class: 'noticia-fonte', text: item.fonte }) : null));
    }
  }

  if (falhou.length) {
    corpo.append(el('div', { class: 'tiny dim', style: 'margin-top:10px', text: `Não veio: ${falhou.map((t) => `${t.label} (${t.erro})`).join(', ')}.` }));
  }

  corpo.append(el('button', {
    class: 'btn sm', style: 'margin-top:12px',
    text: 'Pedir a leitura do JARBAS',
    onclick: () => jarbas.askFrom(
      `Estas são as manchetes de hoje. Me diga em no máximo 6 linhas o que realmente importa `
      + `para mim e por quê. Se tiver algo do Sport ou dos Seahawks, comente como você comentaria.\n\n${noticias.comoTexto(pacote)}`,
    ),
  }));
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

/**
 * A rotina do dia é o primeiro quadro porque é a única coisa do topo que você
 * resolve hoje mesmo, riscando. Some quando não há rotina para o dia — quadro
 * "0 de 0" é ruído com cara de dado.
 */
function tileRotina(t) {
  const r = store.rotinaResumo(t);
  if (!r.total) return null;
  return statTile({
    label: 'Rotina de hoje',
    value: `${r.feitos}/${r.total}`,
    tone: r.completo ? 'ok' : '',
    sub: r.completo ? 'tudo feito' : `${r.pendentes} pendente(s)`,
  });
}

function tileAgenda(t) {
  const hoje = store.eventsOn(t);
  const proximo = hoje.find((e) => !e.time || e.time >= new Date().toTimeString().slice(0, 5));

  // Com o dia vazio, o rodapé aponta para o próximo compromisso em vez de
  // repetir "nada marcado" — que é a mesma informação do número grande.
  let sub;
  if (proximo) {
    sub = `próximo: ${truncate(proximo.title, 26)}${proximo.time ? ` ${fmtTime(proximo.time)}` : ''}`;
  } else if (hoje.length) {
    sub = 'tudo já passou';
  } else {
    const futuro = store.nextEventAfter(t);
    sub = futuro
      ? `próximo ${relDay(futuro.occurrence)}: ${truncate(futuro.title, 22)}`
      : 'nada marcado';
  }

  return statTile({ label: 'Hoje na agenda', value: String(hoje.length), sub });
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

/**
 * Dinheiro que alguém te deve — a única cifra que pede ação. Some quando não
 * há nada a receber: quadro zerado no topo é ruído com aparência de dado.
 */
function tileReceber() {
  const abertos = ['proposta', 'fechado', 'em andamento', 'entregue'];
  const freelas = store.list('freelas', (f) => !f.pago && abertos.includes(f.status ?? 'proposta'));
  const eventos = store.list('producoes', (e) => !e.pago && (Number(e.cache) || 0) > 0);
  const total = freelas.reduce((a, f) => a + (Number(f.valor) || 0), 0)
    + eventos.reduce((a, e) => a + (Number(e.cache) || 0), 0);
  if (!total) return null;

  const t = today();
  const vencidos = freelas.filter((f) => f.pagaEm && f.pagaEm < t).length
    + eventos.filter((e) => e.date && e.date < t).length;

  return statTile({
    label: 'A receber',
    value: money(total),
    tone: vencidos ? 'bad' : '',
    sub: vencidos ? `${vencidos} já venceu — cobre` : `${freelas.length + eventos.length} trabalho(s)`,
  });
}

/** O próximo compromisso com consequência: entrega de freela ou evento. */
function tileProximaEntrega(t) {
  const candidatos = [
    ...store.list('freelas', (f) => f.entregaEm && f.entregaEm >= t && f.status !== 'entregue' && f.status !== 'cancelado')
      .map((f) => ({ quando: f.entregaEm, o_que: f.title, tipo: 'entrega' })),
    ...store.list('producoes', (e) => e.date && e.date >= t)
      .map((e) => ({ quando: e.date, o_que: e.title, tipo: 'evento' })),
  ].sort((a, b) => a.quando.localeCompare(b.quando));

  const proximo = candidatos[0];
  if (!proximo) return null;

  return statTile({
    label: proximo.tipo === 'evento' ? 'Próximo evento' : 'Próxima entrega',
    value: relDay(proximo.quando),
    sub: truncate(proximo.o_que || 'sem título', 30),
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

  // Sem compromisso hoje, o cartão mostra o próximo. Vale mesmo quando há
  // tarefas: elas não respondem "quando é meu próximo compromisso?".
  if (!eventos.length) {
    const bloco = proximoCompromisso(store.nextEventAfter(t), {
      relDay,
      fmtDate,
      fmtTime,
      onOpen: (date) => emit('nav:go', { view: 'agenda', date }),
    });
    if (bloco) body.append(bloco);
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
