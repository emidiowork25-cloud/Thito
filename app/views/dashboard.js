// Painel — a primeira tela do dia: o que importa agora, num olhar.

import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as noticias from '../core/noticias.js';
import * as rotina from './rotina.js';
import * as ctx from '../assistant/context.js';
import * as jarbas from '../assistant/jarbas.js';
import { el, fmtDate, fmtTime, relDay, today, addDays, truncate } from '../core/util.js';
import { statTile, sectionCard, emptyState, proximoCompromisso } from '../ui/components.js';
import { emit } from '../core/bus.js';

export function render(root) {
  const t = today();

  root.append(hero());

  // O topo mostra o que precisa de você, não como você está indo. Saldo do mês
  // é boa informação e péssima manchete: some do painel e continua em Finanças,
  // onde alguém vai olhar querendo saber disso.
  //
  // "A receber" e "Tarefas abertas" saíram pelo mesmo motivo: são números que
  // ficam parados por semanas. Um número que não muda todo dia, num painel que
  // se olha todo dia, vira paisagem — e paisagem no topo rouba o lugar do que
  // realmente mudou desde ontem. Cada um continua no seu módulo, onde se vai
  // justamente para olhar aquilo. "A receber" agora vive em Finanças.
  //
  // O quadro da rotina saiu por outro motivo: o cartão da rotina, aqui embaixo,
  // já traz o mesmo "0/3" com a barra e a lista do que falta. Repetir o número
  // três vezes na mesma tela não o torna mais visível — torna a tela mais cheia.
  const tiles = [tileAgenda(t), tileProximaEntrega(t)].filter(Boolean);
  root.append(el('div', { class: 'grid dash-stats' }, ...tiles));

  // Coluna da esquerda: compromissos antes das notícias. O painel é para
  // decidir o que fazer hoje — o que está marcado para você vem primeiro, e a
  // manchete por último; ela informa, mas não cobra nada de ninguém.
  //
  // Coluna da direita: a rotina do dia. É o mesmo cartão da aba Hoje do módulo
  // Rotina, e não uma cópia dele — marcar aqui marca lá, porque é o mesmo
  // botão. Ele tomou o lugar de Sinais, Gastos do mês e Encaminhamentos: os
  // três respondiam "como você está indo", e este responde "o que falta fazer
  // hoje", que é a pergunta que se leva para a primeira tela da manhã. Os três
  // continuam inteiros nos seus módulos, que é onde se vai para olhá-los.
  root.append(el('div', { class: 'grid dash-main' },
    el('div', { class: 'grid', style: 'align-content:start' }, cardHoje(t), cardProximos(t), cardNoticias()),
    el('div', { class: 'grid', style: 'align-content:start' }, rotina.cartaoHoje(t, { titulo: 'Rotina de hoje' }))));
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


function tileAgenda(t) {
  const hoje = store.agendaOn(t);
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

/** O próximo compromisso com consequência: entrega de freela ou evento. */
function tileProximaEntrega(t) {
  const candidatos = [
    ...store.list('freelas', (f) => f.entregaEm && f.entregaEm >= t && store.freelaStatus(f) !== 'entregue' && store.freelaStatus(f) !== 'cancelado')
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
  const eventos = store.agendaOn(t);
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
      onOpen: (date, ev) => emit('nav:go', ev?.virtual ? { view: ev.origem.view, id: ev.origem.id } : { view: 'agenda', date }),
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
  const proximos = store.agendaBetween(addDays(t, 1), addDays(t, 7));
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



