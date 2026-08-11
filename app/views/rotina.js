// Rotina — o que se repete toda semana, e se está feito hoje.
//
// Duas telas numa só, de propósito:
//
// 1. "Hoje" é o que você olha de manhã e vai riscando. Grande, com barra de
//    progresso, sem nada para configurar.
// 2. A grade da semana é o calendário editável: linhas são as tarefas, colunas
//    são os dias, e clicar numa célula liga ou desliga a tarefa naquele dia.
//    Está sempre à vista — mudar a rotina não exige abrir menu nenhum.
//
// O histórico de feitos mora dentro da própria tarefa, num mapa por data. É o
// que permite mostrar sequência ("6 semanas seguidas") sem criar uma coleção
// nova só para marcar caixinha.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import { el, today, addDays, parseDate, truncate } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, meter, toast } from '../ui/components.js';

// As regras de domínio (quais tarefas caem em que dia, o que está feito, onde
// começa a semana) moram no store — o contexto do JARBAS e o Painel leem de lá
// também, e duas cópias da mesma conta é como elas passam a discordar.
const { DIAS_SEMANA: DIAS, rotinasAtivas: ativas, rotinasDoDia: doDia, rotinaFeita: feito, segundaDe } = store;

/** Sugestões de partida, para a tela não abrir vazia pedindo inspiração. */
const EXEMPLOS = [
  { title: 'Checar o Trello — tarefas da semana em dia?', contexto: 'Trabalho', dias: [1, 2, 3, 4, 5], horario: '09:00' },
  { title: 'Postagens da Universidade conforme a programação', contexto: 'Universidade', dias: [1, 3, 5] },
  { title: 'Postagens do Seminário Pernambucano de Autismo', contexto: 'Seminário', dias: [2, 4] },
  { title: 'Acompanhar o perfil do Kadu.lins', contexto: 'Kadu', dias: [1, 2, 3, 4, 5], link: 'https://instagram.com/kadu.lins' },
];

let semanaBase = null; // segunda-feira da semana exibida; null = a semana atual

/* ============================ render ============================ */

export function render(root) {
  const t = today();
  const itens = ativas();

  if (!itens.length) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhuma rotina ainda. Comece pelas tarefas que se repetem toda semana — as que você esquece justamente por serem óbvias.',
        'Criar as minhas', () => semear())));
    root.append(el('div', { class: 'card' },
      el('p', { class: 'tiny dim', style: 'margin:0', text: 'Ou crie uma do zero:' }),
      el('button', { class: 'btn primary', style: 'margin-top:10px', text: '+ Nova tarefa da rotina', onclick: () => editar() })));
    return;
  }

  root.append(hoje(t));
  root.append(grade(t));
}

/* ---------- hoje ---------- */

function hoje(t) {
  const itens = doDia(t);
  const prontos = itens.filter((r) => feito(r, t));
  const pct = itens.length ? prontos.length / itens.length : 0;
  const completo = itens.length > 0 && prontos.length === itens.length;

  const corpo = el('div');

  if (!itens.length) {
    corpo.append(el('div', { class: 'empty', text: 'Nada na rotina para hoje. Dia limpo.' }));
  }

  for (const r of itens) {
    const marcado = feito(r, t);
    const linha = el('div', { class: `rot-item ${marcado ? 'ok' : ''}` });

    linha.append(el('button', {
      class: `rot-check ${marcado ? 'on' : ''}`,
      title: marcado ? 'Desmarcar' : 'Marcar como feito',
      text: marcado ? '✓' : '',
      onclick: () => alternar(r, t),
    }));

    const meio = el('div', { class: 'rot-meio' },
      el('div', { class: 'rot-titulo', text: r.title }),
      el('div', { class: 'rot-meta' },
        r.horario ? el('span', { class: 'mono', text: r.horario }) : null,
        r.contexto ? el('span', { class: 'pill', text: r.contexto }) : null,
        sequencia(r) >= 2 ? el('span', { class: 'rot-seq', text: `🔥 ${sequencia(r)}` }) : null,
        r.notes ? el('span', { class: 'tiny dim', text: truncate(r.notes, 60) }) : null));
    linha.append(meio);

    if (r.link) {
      linha.append(el('a', {
        class: 'btn sm', href: r.link, target: '_blank', rel: 'noopener noreferrer',
        text: '↗', title: r.link,
      }));
    }
    linha.append(el('button', { class: 'icon-btn sm', text: '✎', title: 'Editar', onclick: () => editar(r) }));

    corpo.append(linha);
  }

  const cabecalho = el('div', { class: `rot-hero ${completo ? 'completo' : ''}` },
    el('div', { class: 'rot-hero-num', text: `${prontos.length}/${itens.length}` },),
    el('div', { class: 'rot-hero-txt' },
      el('div', { class: 'rot-hero-tit', text: completo ? 'Rotina de hoje fechada.' : 'Rotina de hoje' }),
      el('div', { class: 'tiny dim', text: completo ? 'Tudo riscado. Pode tocar a vida.' : `${itens.length - prontos.length} pendente(s)` }),
      meter(pct, completo ? 'ok' : 'warn')));

  return sectionCard('Hoje', [
    el('button', { class: 'btn sm', text: '+ tarefa', onclick: () => editar() }),
  ], cabecalho, corpo);
}

/** Semanas seguidas em que a tarefa foi cumprida em todos os dias marcados. */
function sequencia(r) {
  const dias = r.dias ?? [];
  if (!dias.length) return 0;
  let n = 0;
  // começa na semana passada: a semana corrente ainda está acontecendo e
  // contá-la incompleta zeraria a sequência de quem só não chegou na sexta.
  for (let semana = 1; semana <= 52; semana += 1) {
    const seg = segundaDe(addDays(today(), -7 * semana));
    const datas = DIAS.filter((d) => dias.includes(d.n))
      .map((d) => addDays(seg, DIAS.findIndex((x) => x.n === d.n)));
    if (!datas.every((data) => feito(r, data))) break;
    n += 1;
  }
  return n;
}

/* ---------- grade da semana ---------- */

function grade(t) {
  const seg = semanaBase ?? segundaDe(t);
  const datas = DIAS.map((_, i) => addDays(seg, i));
  const itens = ativas();

  const tabela = el('div', { class: 'rot-grade' });

  // cabeçalho
  tabela.append(el('div', { class: 'rot-gh' }));
  DIAS.forEach((d, i) => {
    tabela.append(el('div', { class: `rot-gh dia ${datas[i] === t ? 'hoje' : ''}` },
      el('span', { text: d.curto }),
      el('span', { class: 'rot-gh-num', text: String(parseDate(datas[i]).getDate()) })));
  });

  for (const r of itens) {
    tabela.append(el('div', { class: 'rot-gl' },
      el('span', { class: 'rot-gl-tit', text: r.title, title: r.title }),
      r.contexto ? el('span', { class: 'pill sm', text: r.contexto }) : null));

    DIAS.forEach((d, i) => {
      const data = datas[i];
      const marcada = (r.dias ?? []).includes(d.n);
      const cumprida = marcada && feito(r, data);
      const passado = data < t;

      tabela.append(el('button', {
        class: `rot-cel ${marcada ? 'on' : ''} ${cumprida ? 'ok' : ''} ${marcada && passado && !cumprida ? 'perdida' : ''} ${data === t ? 'hoje' : ''}`,
        title: marcada
          ? `${r.title} — ${d.longo}. Clique para tirar deste dia.`
          : `${r.title} — clique para incluir na ${d.longo}.`,
        text: cumprida ? '✓' : marcada ? '·' : '',
        onclick: () => alternarDia(r, d.n),
      }));
    });
  }

  const acoes = [
    el('button', { class: 'btn sm', text: '‹', title: 'Semana anterior', onclick: () => { semanaBase = addDays(seg, -7); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: 'Esta semana', onclick: () => { semanaBase = null; emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: '›', title: 'Próxima semana', onclick: () => { semanaBase = addDays(seg, 7); emit('nav:refresh'); } }),
    el('button', {
      class: 'btn sm', text: 'Revisar com o JARBAS',
      onclick: () => jarbas.askFrom('Olhe a minha rotina semanal e me diga, em no máximo 5 linhas: o que eu venho deixando cair, '
        + 'se tem dia sobrecarregado e se alguma tarefa faz mais sentido em outro dia.'),
    }),
  ];

  return sectionCard(`Semana de ${rotulo(seg)}`, acoes,
    el('div', { class: 'rot-grade-rolagem' }, tabela),
    el('div', { class: 'tiny dim', style: 'margin-top:10px', text: 'Clique numa célula para incluir ou tirar a tarefa daquele dia. ✓ é o que já foi feito; o vermelho é o que passou sem ser feito.' }));
}

const rotulo = (seg) => {
  const a = parseDate(seg);
  const b = parseDate(addDays(seg, 6));
  return `${String(a.getDate()).padStart(2, '0')}/${String(a.getMonth() + 1).padStart(2, '0')}`
    + ` a ${String(b.getDate()).padStart(2, '0')}/${String(b.getMonth() + 1).padStart(2, '0')}`;
};

/* ============================ operações ============================ */

/**
 * Marca ou desmarca o feito de um dia.
 *
 * O histórico é podado para 120 dias. Sem isso, um item de rotina diária
 * carregaria milhares de chaves em poucos anos — e esse objeto sobe inteiro
 * para a nuvem a cada clique.
 */
async function alternar(r, data) {
  const feitos = { ...(r.feitos ?? {}) };
  if (feitos[data]) delete feitos[data];
  else feitos[data] = true;

  const limite = addDays(today(), -120);
  for (const k of Object.keys(feitos)) if (k < limite) delete feitos[k];

  await store.save('rotinas', { id: r.id, feitos });
  emit('nav:refresh');
}

async function alternarDia(r, dow) {
  const dias = (r.dias ?? []).includes(dow)
    ? (r.dias ?? []).filter((d) => d !== dow)
    : [...(r.dias ?? []), dow].sort();
  await store.save('rotinas', { id: r.id, dias });
  emit('nav:refresh');
}

async function editar(r) {
  const novo = !r;
  const v = await formModal({
    title: novo ? 'Nova tarefa da rotina' : 'Editar tarefa',
    values: {
      titulo: r?.title ?? '',
      contexto: r?.contexto ?? '',
      horario: r?.horario ?? '',
      link: r?.link ?? '',
      notas: r?.notes ?? '',
      ...Object.fromEntries(DIAS.map((d) => [`d${d.n}`, (r?.dias ?? (novo ? [1, 2, 3, 4, 5] : [])).includes(d.n)])),
    },
    fields: [
      { name: 'titulo', label: 'O que fazer', required: true, placeholder: 'Checar o Trello, postar no perfil da Universidade…' },
      { name: 'contexto', label: 'Contexto', inline: true, placeholder: 'Universidade, Seminário, Kadu…' },
      { name: 'horario', label: 'Horário', type: 'time', inline: true },
      { name: 'link', label: 'Link', placeholder: 'https://trello.com/… (abre direto da lista)' },
      { name: 'notas', label: 'Observação', type: 'textarea', rows: 2 },
      { type: 'separator', label: 'Em que dias' },
      ...DIAS.map((d) => ({ name: `d${d.n}`, label: d.longo, type: 'checkbox', inline: true })),
    ],
    extraButtons: r ? (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => {
          close();
          if (!await confirmDialog(`Excluir "${r.title}" da rotina? O histórico de feitos vai junto.`, { danger: true, okLabel: 'Excluir' })) return;
          await store.remove('rotinas', r.id);
          emit('nav:refresh');
        },
      }),
    ] : null,
  });
  if (!v?.titulo?.trim()) return;

  const dias = DIAS.filter((d) => v[`d${d.n}`]).map((d) => d.n);
  if (!dias.length) return toast('Escolha pelo menos um dia da semana.', 'bad');

  await store.save('rotinas', {
    id: r?.id,
    title: v.titulo.trim(),
    contexto: v.contexto?.trim() || null,
    horario: v.horario || null,
    link: v.link?.trim() || null,
    notes: v.notas?.trim() || null,
    dias,
  });
  emit('nav:refresh');
}

async function semear() {
  for (const e of EXEMPLOS) await store.save('rotinas', { ...e }, { silent: true });
  emit('data:changed', { collection: 'rotinas', action: 'bulk' });
  toast('Rotina criada. Edite ou apague o que não for seu.', 'ok');
  emit('nav:refresh');
}

on('action:new-rotina', () => editar());
