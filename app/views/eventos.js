// Eventos — a produção inteira num lugar: orçamento, equipe e o que precisa
// estar feito antes, durante e depois.
//
// O checklist é dividido em três tempos de propósito. Uma lista única vira um
// amontoado onde "levar cartão SD reserva" e "mandar nota fiscal" convivem, e
// no dia do evento você não acha nem uma nem outra.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { emit } from '../core/bus.js';
import { el, money, today, addDays, fmtDate, relDay, parseMoney, sum, uid } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, statTile, toast } from '../ui/components.js';

export const PAPEIS = [
  ['contrato', 'Eu contrato a equipe'],
  ['integrante', 'Eu sou parte da equipe'],
  ['sozinho', 'Eu faço sozinho'],
];

const TEMPOS = [['antes', 'Antes'], ['durante', 'Durante'], ['depois', 'Depois']];

/** Ponto de partida editável — ninguém quer digitar isto do zero toda vez. */
const MODELO = {
  antes: ['Fechar contrato e valor', 'Confirmar equipe', 'Checar equipamento', 'Visita técnica ao local', 'Confirmar horário de chegada'],
  durante: ['Chegar com antecedência', 'Testar áudio', 'Registrar making of'],
  depois: ['Backup do material', 'Enviar nota fiscal', 'Pagar a equipe', 'Cobrar o pagamento'],
};

let selecionado = null;
let filtro = 'proximos';
let tempo = 'antes';

export function render(root, params = {}) {
  if (params.id) selecionado = params.id;

  const todos = store.list('producoes').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const t = today();
  const visiveis = todos.filter((e) => (
    filtro === 'todos' ? true : filtro === 'passados' ? (e.date && e.date < t) : (!e.date || e.date >= t)
  ));
  if (!visiveis.some((e) => e.id === selecionado)) selecionado = visiveis[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    ...[['proximos', 'Próximos'], ['passados', 'Passados'], ['todos', 'Todos']].map(([k, rot]) =>
      el('button', {
        class: `chip ${filtro === k ? 'on' : ''}`, text: rot,
        onclick: () => { filtro = k; emit('nav:refresh'); },
      })),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Analisar com JARBAS', onclick: analisar }),
    el('button', { class: 'btn primary sm', text: '+ Evento', onclick: () => editar() }),
  ));

  root.append(el('div', { class: 'grid dash-stats' }, ...indicadores(todos)));

  if (!todos.length) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhum evento registrado ainda.', 'Registrar o primeiro', () => editar())));
    return;
  }

  root.append(el('div', { class: 'grid compras-grid' },
    cardLista(visiveis),
    selecionado ? cardDetalhe(store.get('producoes', selecionado)) : el('div', { class: 'card' }, emptyState('Selecione um evento.')),
  ));
}

/* ---------- contas de um evento ---------- */

export function orcamento(e) {
  const receita = Number(e?.cache) || 0;
  const equipe = sum(e?.equipe ?? [], (m) => Number(m.valor) || 0);
  const custos = sum(e?.custos ?? [], (c) => Number(c.valor) || 0);
  return { receita, equipe, custos, saida: equipe + custos, resultado: receita - equipe - custos };
}

export function pendencias(e) {
  const itens = [...(e?.checklist?.antes ?? []), ...(e?.checklist?.durante ?? []), ...(e?.checklist?.depois ?? [])];
  return itens.filter((i) => !i.done).length;
}

function indicadores(todos) {
  const t = today();
  const futuros = todos.filter((e) => !e.date || e.date >= t);
  const proximo = futuros[0];
  const aReceber = todos.filter((e) => !e.pago && (Number(e.cache) || 0) > 0);
  const equipeAPagar = todos.flatMap((e) => (e.equipe ?? []).filter((m) => !m.pago));

  return [
    statTile({
      label: 'Próximo evento',
      value: proximo ? (proximo.date ? relDay(proximo.date) : 'sem data') : '—',
      sub: proximo ? (proximo.title || 'sem título') : 'nada marcado',
    }),
    statTile({
      label: 'A receber',
      value: money(sum(aReceber, (e) => Number(e.cache) || 0)),
      sub: `${aReceber.length} evento(s)`,
    }),
    statTile({
      label: 'A pagar à equipe',
      value: money(sum(equipeAPagar, (m) => Number(m.valor) || 0)),
      tone: equipeAPagar.length ? 'bad' : '',
      sub: `${equipeAPagar.length} pessoa(s)`,
    }),
    statTile({
      label: 'Pendências abertas',
      value: String(sum(futuros, (e) => pendencias(e))),
      sub: 'nos eventos que ainda vêm',
    }),
  ];
}

/* ---------- lista ---------- */

function cardLista(lista) {
  const body = el('div', { class: 'list-plain' });
  if (!lista.length) body.append(emptyState('Nada neste filtro.'));

  for (const e of lista) {
    const o = orcamento(e);
    const abertas = pendencias(e);
    body.append(el('div', {
      class: `lp-row clickable ${e.id === selecionado ? 'sel' : ''}`,
      onclick: () => { selecionado = e.id; emit('nav:refresh'); },
    },
      el('div', { class: 'lp-main' },
        el('div', { text: e.title || 'Sem título' }),
        el('div', { class: 'tiny dim', text: [e.date ? fmtDate(e.date) : 'sem data', e.local].filter(Boolean).join(' · ') }),
      ),
      el('div', { style: 'text-align:right' },
        el('div', { class: 'mono', text: money(o.resultado) }),
        el('div', {
          class: `tiny ${e.pago ? 'ok' : abertas ? 'warn' : 'dim'}`,
          text: e.pago ? 'recebido' : abertas ? `${abertas} pendência(s)` : 'tudo feito',
        }),
      ),
    ));
  }
  return sectionCard(`Eventos · ${lista.length}`, null, body);
}

/* ---------- detalhe ---------- */

function cardDetalhe(e) {
  if (!e) return el('div', { class: 'card' }, emptyState('Evento não encontrado.'));
  const o = orcamento(e);
  const papel = PAPEIS.find(([k]) => k === e.papel)?.[1] ?? '—';

  const cabecalho = el('div', { class: 'tiny dim', style: 'margin-bottom:10px' },
    [e.date ? `${fmtDate(e.date)} · ${relDay(e.date)}` : 'sem data', e.local, papel].filter(Boolean).join('  ·  '));

  const contas = el('div', { class: 'grid dash-stats', style: 'margin-bottom:14px' },
    statTile({ label: 'Cachê', value: money(o.receita), sub: e.pago ? 'recebido' : 'a receber' }),
    statTile({ label: 'Equipe', value: money(o.equipe) }),
    statTile({ label: 'Outros custos', value: money(o.custos) }),
    statTile({ label: 'Sobra', value: money(o.resultado), tone: o.resultado < 0 ? 'bad' : 'ok' }),
  );

  const abas = el('div', { class: 'tabs' },
    ...TEMPOS.map(([k, rot]) => {
      const itens = e.checklist?.[k] ?? [];
      const abertas = itens.filter((i) => !i.done).length;
      return el('button', {
        class: `tab ${tempo === k ? 'on' : ''}`,
        text: abertas ? `${rot} (${abertas})` : rot,
        onclick: () => { tempo = k; emit('nav:refresh'); },
      });
    }));

  return sectionCard(e.title || 'Sem título', [
    el('button', {
      class: `btn sm ${e.pago ? '' : 'primary'}`,
      text: e.pago ? 'Desmarcar recebido' : '✓ Recebi o cachê',
      onclick: () => alternarPago(e),
    }),
    el('button', { class: 'btn sm', text: 'Editar', onclick: () => editar(e) }),
    el('button', { class: 'btn sm danger', text: 'Excluir', onclick: () => excluir(e) }),
  ],
    cabecalho, contas,
    abas, checklist(e, tempo),
    equipe(e),
    e.notes ? el('p', { class: 'tiny dim', style: 'white-space:pre-wrap;margin-top:14px', text: e.notes }) : null,
  );
}

/* ---------- checklist ---------- */

function checklist(e, quando) {
  const itens = e.checklist?.[quando] ?? [];
  const box = el('div', { class: 'list-plain', style: 'margin-bottom:8px' });

  if (!itens.length) box.append(emptyState('Nada nesta etapa ainda.'));

  for (const i of itens) {
    box.append(el('div', { class: `task-row ${i.done ? 'done' : ''}` },
      el('input', {
        type: 'checkbox', checked: !!i.done,
        onchange: () => alternarItem(e, quando, i.id),
      }),
      el('div', { class: 'task-main', text: i.text, onclick: () => renomearItem(e, quando, i) }),
      el('button', { class: 'icon-btn sm', text: '✕', title: 'Remover', onclick: () => removerItem(e, quando, i.id) }),
    ));
  }

  const entrada = el('input', {
    type: 'text', placeholder: `Adicionar em "${TEMPOS.find(([k]) => k === quando)[1]}" e apertar Enter…`,
    onkeydown: async (ev) => {
      if (ev.key !== 'Enter') return;
      const texto = ev.target.value.trim();
      if (!texto) return;
      ev.target.value = '';
      await adicionarItem(e, quando, texto);
    },
  });

  return el('div', {}, box, entrada);
}

async function mexerNoChecklist(e, quando, fn) {
  const atual = {
    antes: [...(e.checklist?.antes ?? [])],
    durante: [...(e.checklist?.durante ?? [])],
    depois: [...(e.checklist?.depois ?? [])],
  };
  atual[quando] = fn(atual[quando]);
  await store.save('producoes', { id: e.id, checklist: atual });
  emit('nav:refresh');
}

const adicionarItem = (e, quando, text) =>
  mexerNoChecklist(e, quando, (l) => [...l, { id: uid(), text, done: false }]);

const alternarItem = (e, quando, id) =>
  mexerNoChecklist(e, quando, (l) => l.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

const removerItem = (e, quando, id) =>
  mexerNoChecklist(e, quando, (l) => l.filter((i) => i.id !== id));

async function renomearItem(e, quando, item) {
  const v = await formModal({
    title: 'Editar item',
    fields: [{ name: 'text', label: 'Item', type: 'text' }],
    values: { text: item.text },
  });
  if (!v?.text?.trim()) return;
  await mexerNoChecklist(e, quando, (l) => l.map((i) => (i.id === item.id ? { ...i, text: v.text.trim() } : i)));
}

/* ---------- equipe ---------- */

function equipe(e) {
  const membros = e.equipe ?? [];
  const body = el('div', { class: 'list-plain' });

  if (!membros.length) body.append(emptyState('Ninguém na equipe ainda.'));

  for (const m of membros) {
    body.append(el('div', { class: 'lp-row' },
      el('input', {
        type: 'checkbox', checked: !!m.pago, title: 'Pago',
        onchange: () => alternarMembroPago(e, m.id),
      }),
      el('div', { class: 'lp-main clickable', onclick: () => editarMembro(e, m) },
        el('div', { text: m.nome || 'Sem nome' }),
        el('div', { class: 'tiny dim', text: m.funcao || '—' }),
      ),
      el('div', { class: 'mono', style: 'min-width:100px;text-align:right', text: money(Number(m.valor) || 0) }),
      el('div', { class: `tiny ${m.pago ? 'ok' : 'warn'}`, style: 'min-width:56px;text-align:right', text: m.pago ? 'pago' : 'a pagar' }),
      el('button', { class: 'icon-btn sm', text: '✕', title: 'Remover', onclick: () => removerMembro(e, m.id) }),
    ));
  }

  return el('div', { style: 'margin-top:16px' },
    el('div', { class: 'card-head' },
      el('h3', { text: 'Equipe' }),
      el('button', { class: 'btn sm', text: '+ pessoa', onclick: () => editarMembro(e) })),
    body);
}

async function editarMembro(e, m = null) {
  const v = await formModal({
    title: m ? 'Editar pessoa' : 'Adicionar à equipe',
    fields: [
      { name: 'nome', label: 'Nome', type: 'text' },
      { name: 'funcao', label: 'Função', type: 'text', placeholder: 'ex.: câmera 2, som, edição', inline: true },
      { name: 'valor', label: 'Quanto recebe (R$)', type: 'text', inline: true },
    ],
    values: m ?? {},
  });
  if (!v) return;
  const lista = [...(e.equipe ?? [])];
  if (m) {
    const i = lista.findIndex((x) => x.id === m.id);
    lista[i] = { ...m, nome: v.nome, funcao: v.funcao, valor: parseMoney(v.valor) || 0 };
  } else {
    lista.push({ id: uid(), nome: v.nome, funcao: v.funcao, valor: parseMoney(v.valor) || 0, pago: false });
  }
  await store.save('producoes', { id: e.id, equipe: lista });
  emit('nav:refresh');
}

async function alternarMembroPago(e, id) {
  const lista = (e.equipe ?? []).map((m) => (m.id === id ? { ...m, pago: !m.pago } : m));
  await store.save('producoes', { id: e.id, equipe: lista });
  emit('nav:refresh');
}

async function removerMembro(e, id) {
  await store.save('producoes', { id: e.id, equipe: (e.equipe ?? []).filter((m) => m.id !== id) });
  emit('nav:refresh');
}

/* ---------- ações do evento ---------- */

async function alternarPago(e) {
  if (e.pago) {
    await store.save('producoes', { id: e.id, pago: false, pagoEm: null, transactionId: null });
    if (e.transactionId) await store.remove('transactions', e.transactionId);
    emit('nav:refresh');
    return;
  }
  const contas = store.list('accounts');
  const v = await formModal({
    title: 'Registrar recebimento',
    fields: [
      { name: 'quando', label: 'Caiu em', type: 'date' },
      { name: 'valor', label: 'Valor recebido (R$)', type: 'text' },
      { name: 'conta', label: 'Em qual conta', type: 'select', options: contas.map((c) => [c.id, c.name]) },
      { name: 'lancar', label: 'Lançar no financeiro', type: 'checkbox' },
    ],
    values: { quando: today(), valor: String(e.cache ?? ''), conta: contas[0]?.id, lancar: true },
  });
  if (!v) return;

  const valor = parseMoney(v.valor) || Number(e.cache) || 0;
  let transactionId = null;
  if (v.lancar && valor > 0) {
    const tx = await store.save('transactions', {
      desc: `Evento — ${e.title || 'sem título'}`,
      amount: valor, type: 'in', date: v.quando, category: 'salário', accountId: v.conta,
    });
    transactionId = tx.id;
  }
  await store.save('producoes', { id: e.id, pago: true, pagoEm: v.quando, cache: valor, transactionId });
  toast(v.lancar ? 'Recebido e lançado no financeiro.' : 'Marcado como recebido.');
  emit('nav:refresh');
}

async function editar(e = null) {
  const v = await formModal({
    title: e ? 'Editar evento' : 'Novo evento',
    wide: true,
    fields: [
      { name: 'title', label: 'O evento', type: 'text', placeholder: 'ex.: Casamento Ana e Rui' },
      { name: 'date', label: 'Data', type: 'date', inline: true },
      { name: 'local', label: 'Local', type: 'text', inline: true },
      { name: 'papel', label: 'Meu papel', type: 'select', options: PAPEIS, inline: true },
      { name: 'cache', label: 'Cachê / receita (R$)', type: 'text', inline: true },
      { name: 'contato', label: 'Contato', type: 'text', inline: true },
      { name: 'notes', label: 'Anotações', type: 'textarea' },
      ...(e ? [] : [{ name: 'modelo', label: 'Começar com o checklist padrão', type: 'checkbox' }]),
    ],
    values: e ?? { papel: 'contrato', date: addDays(today(), 14), modelo: true },
  });
  if (!v) return;

  const base = {
    id: e?.id,
    title: v.title, date: v.date || null, local: v.local, papel: v.papel,
    cache: parseMoney(v.cache) || 0, contato: v.contato, notes: v.notes,
    equipe: e?.equipe ?? [],
    pago: e?.pago ?? false, pagoEm: e?.pagoEm ?? null, transactionId: e?.transactionId ?? null,
    custos: e?.custos ?? [],
  };
  if (!e) {
    base.checklist = v.modelo
      ? Object.fromEntries(Object.entries(MODELO).map(([k, itens]) =>
        [k, itens.map((text) => ({ id: uid(), text, done: false }))]))
      : { antes: [], durante: [], depois: [] };
  }

  const salvo = await store.save('producoes', base);
  selecionado = salvo.id;
  emit('nav:refresh');
}

async function excluir(e) {
  if (!await confirmDialog(`Excluir "${e.title || 'este evento'}"?`)) return;
  await store.remove('producoes', e.id);
  selecionado = null;
  emit('nav:refresh');
}

function analisar() {
  jarbas.askFrom(
    'Olhe meus eventos: o que vem primeiro, o que ainda está pendente no checklist, '
    + 'quanto sobra de cada um depois de pagar a equipe, e quem eu ainda não paguei.');
}
