// Finanças — contas, lançamentos, orçamentos e a leitura do mês.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import {
  el, money, today, monthKey, addMonths, fmtDate, parseMoney, norm, monthName, parseDate, download,
} from '../core/util.js';
import { statTile, meter, sectionCard, emptyState, formModal, confirmDialog, toast } from '../ui/components.js';

let mes = monthKey(today());
let filtroCategoria = '';
let filtroTexto = '';

export function render(root) {
  const resumo = store.monthSummary(mes);

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn sm', text: '‹', onclick: () => { mes = monthKey(addMonths(`${mes}-01`, -1)); emit('nav:refresh'); } }),
    el('strong', { style: 'min-width:160px;text-align:center;text-transform:capitalize', text: rotuloMes() }),
    el('button', { class: 'btn sm', text: '›', onclick: () => { mes = monthKey(addMonths(`${mes}-01`, 1)); emit('nav:refresh'); } }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Analisar com JARBAS', onclick: analisar }),
    el('button', { class: 'btn sm', text: 'Exportar CSV', onclick: exportarCsv }),
    el('button', { class: 'btn primary sm', text: '+ Lançamento', onclick: () => editarTransacao() }),
  ));

  root.append(el('div', { class: 'grid dash-stats' },
    statTile({ label: 'Entradas', value: money(resumo.income), tone: 'ok' }),
    statTile({ label: 'Saídas', value: money(resumo.expense), tone: 'bad' }),
    statTile({ label: 'Resultado', value: money(resumo.net), tone: resumo.net < 0 ? 'bad' : 'ok', sub: `${resumo.count} lançamentos` }),
    statTile({ label: 'Saldo total', value: money(store.totalBalance()), sub: `${store.list('accounts').length} conta(s)` }),
  ));

  root.append(el('div', { class: 'grid fin-grid' },
    el('div', { class: 'grid', style: 'align-content:start' }, cardLancamentos(resumo)),
    el('div', { class: 'grid', style: 'align-content:start' }, cardContas(), cardCategorias(resumo), cardOrcamentos())));
}

const rotuloMes = () => {
  const d = parseDate(`${mes}-01`);
  return `${monthName(d.getMonth())} ${d.getFullYear()}`;
};

/* ---------- lançamentos ---------- */

function cardLancamentos(resumo) {
  let txs = store.monthTransactions(mes);
  if (filtroCategoria) txs = txs.filter((t) => t.category === filtroCategoria);
  if (filtroTexto) txs = txs.filter((t) => norm(t.desc).includes(norm(filtroTexto)));

  const filtros = el('div', { class: 'toolbar', style: 'margin:0 0 12px' },
    el('input', {
      type: 'text', placeholder: 'Filtrar por descrição…', value: filtroTexto,
      style: 'max-width:220px',
      oninput: (e) => { filtroTexto = e.target.value; atualizarTabela(); },
    }),
    el('select', {
      style: 'max-width:180px',
      onchange: (e) => { filtroCategoria = e.target.value; emit('nav:refresh'); },
    },
    el('option', { value: '', selected: !filtroCategoria }, 'todas as categorias'),
    ...store.CATEGORIES_FIN.map((c) => el('option', { value: c, selected: filtroCategoria === c }, c))),
  );

  const tabela = el('div', { class: 'table' });
  const atualizarTabela = () => {
    let lista = store.monthTransactions(mes);
    if (filtroCategoria) lista = lista.filter((t) => t.category === filtroCategoria);
    if (filtroTexto) lista = lista.filter((t) => norm(t.desc).includes(norm(filtroTexto)));
    tabela.innerHTML = '';
    if (!lista.length) { tabela.append(emptyState('Nenhum lançamento neste filtro.', '+ Lançamento', () => editarTransacao())); return; }
    for (const t of lista) tabela.append(linhaTransacao(t));
  };

  if (!txs.length) tabela.append(emptyState('Nenhum lançamento neste mês.', '+ Lançamento', () => editarTransacao()));
  else for (const t of txs) tabela.append(linhaTransacao(t));

  return sectionCard(`Lançamentos · ${resumo.count} no mês`, null, filtros, tabela);
}

function linhaTransacao(t) {
  const conta = store.get('accounts', t.accountId);
  return el('div', { class: 'tx-row clickable', onclick: () => editarTransacao(t) },
    el('span', { class: 'tx-date mono tiny', text: fmtDate(t.date) }),
    el('div', { class: 'tx-main' },
      el('div', { text: t.desc }),
      el('div', { class: 'tiny dim', text: [t.category, conta?.name, t.recurring ? 'recorrente' : ''].filter(Boolean).join(' · ') })),
    el('span', { class: `tx-amount mono ${t.type === 'out' ? 'bad' : 'ok'}`, text: `${t.type === 'out' ? '−' : '+'} ${money(t.amount)}` }));
}

/* ---------- contas ---------- */

function cardContas() {
  const body = el('div', { class: 'list-plain' });
  for (const a of store.list('accounts')) {
    const saldo = store.accountBalance(a.id);
    body.append(el('div', { class: 'lp-row clickable', onclick: () => editarConta(a) },
      el('span', { class: 'lp-main', text: a.name }),
      el('span', { class: 'tiny dim', text: a.kind || '' }),
      el('span', { class: `mono ${saldo < 0 ? 'bad' : ''}`, text: money(saldo) })));
  }
  if (!store.list('accounts').length) body.append(emptyState('Nenhuma conta.', '+ Conta', () => editarConta()));
  return sectionCard('Contas', [
    el('button', { class: 'btn sm', text: '+', onclick: () => editarConta() }),
  ], body);
}

/* ---------- categorias ---------- */

function cardCategorias(resumo) {
  const body = el('div');
  const cats = Object.entries(resumo.byCategory).sort((a, b) => b[1] - a[1]);
  if (!cats.length) { body.append(el('div', { class: 'empty', text: 'Sem gastos para dividir.' })); }
  const maior = cats[0]?.[1] || 1;
  for (const [cat, val] of cats) {
    body.append(el('div', {
      class: 'bar-row clickable',
      onclick: () => { filtroCategoria = filtroCategoria === cat ? '' : cat; emit('nav:refresh'); },
    },
    el('span', { class: 'bar-label', text: cat }),
    el('div', { class: 'bar-track' }, el('span', { class: 'bar-fill', style: `width:${(val / maior) * 100}%` })),
    el('span', { class: 'bar-value mono', text: money(val) })));
  }
  return sectionCard('Gastos por categoria', null, body);
}

/* ---------- orçamentos ---------- */

function cardOrcamentos() {
  const body = el('div');
  const status = store.budgetStatus(mes);
  if (!status.length) body.append(emptyState('Sem orçamentos definidos.', '+ Orçamento', () => editarOrcamento()));
  for (const b of status) {
    body.append(el('div', { class: 'budget-row clickable', onclick: () => editarOrcamento(b) },
      el('div', { class: 'budget-top' },
        el('span', { text: b.category }),
        el('span', { class: 'mono tiny', text: `${money(b.spent)} / ${money(b.limit)}` })),
      meter(b.pct),
      el('div', { class: 'tiny dim', text: b.remaining >= 0 ? `restam ${money(b.remaining)}` : `estourou ${money(-b.remaining)}` })));
  }
  return sectionCard('Orçamentos', [
    el('button', { class: 'btn sm', text: '+', onclick: () => editarOrcamento() }),
  ], body);
}

/* ---------- edição ---------- */

async function editarTransacao(t = {}) {
  const novo = !t.id;
  const contas = store.list('accounts');
  if (!contas.length) { toast('Crie uma conta primeiro.', 'err'); return editarConta(); }

  const valores = await formModal({
    title: novo ? 'Novo lançamento' : 'Editar lançamento',
    okLabel: novo ? 'Lançar' : 'Salvar',
    values: {
      descricao: t.desc ?? '',
      valor: t.amount ?? '',
      tipo: t.type === 'in' ? 'entrada' : 'saida',
      data: t.date ?? today(),
      categoria: t.category ?? 'outro',
      conta: t.accountId ?? contas[0].id,
      recorrente: !!t.recurring,
    },
    fields: [
      { name: 'descricao', label: 'Descrição', required: true, placeholder: 'Supermercado, aluguel, salário…' },
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: '0', inline: true, required: true },
      { name: 'tipo', label: 'Tipo', type: 'select', options: [['saida', 'saída'], ['entrada', 'entrada']], inline: true },
      { name: 'data', label: 'Data', type: 'date', inline: true },
      { name: 'categoria', label: 'Categoria', type: 'select', options: store.CATEGORIES_FIN, inline: true },
      { name: 'conta', label: 'Conta', type: 'select', options: contas.map((a) => [a.id, a.name]), inline: true },
      { name: 'recorrente', label: 'É uma conta fixa mensal', type: 'checkbox' },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => {
          close();
          if (await confirmDialog(`Excluir "${t.desc}"?`, { danger: true, okLabel: 'Excluir' })) {
            await store.remove('transactions', t.id);
            toast('Lançamento excluído.');
            emit('nav:refresh');
          }
        },
      }),
    ],
  });
  if (!valores) return;
  const valor = parseMoney(valores.valor);
  if (!valores.descricao?.trim() || !valor) { toast('Descrição e valor são obrigatórios.', 'err'); return; }

  await store.save('transactions', {
    id: t.id,
    desc: valores.descricao.trim(),
    amount: Math.abs(valor),
    type: valores.tipo === 'entrada' ? 'in' : 'out',
    date: valores.data || today(),
    category: valores.categoria,
    accountId: valores.conta,
    recurring: valores.recorrente,
  });
  toast(novo ? 'Lançamento registrado.' : 'Lançamento atualizado.', 'ok');
  emit('nav:refresh');
}

async function editarConta(a = {}) {
  const novo = !a.id;
  const valores = await formModal({
    title: novo ? 'Nova conta' : 'Editar conta',
    values: { nome: a.name ?? '', tipo: a.kind ?? 'corrente', inicial: a.initial ?? 0 },
    fields: [
      { name: 'nome', label: 'Nome', required: true, placeholder: 'Nubank, carteira, poupança…' },
      { name: 'tipo', label: 'Tipo', type: 'select', options: ['corrente', 'poupança', 'carteira', 'crédito', 'investimento'], inline: true },
      { name: 'inicial', label: 'Saldo inicial (R$)', type: 'number', step: '0.01', inline: true, hint: 'O saldo antes do primeiro lançamento aqui.' },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => {
          close();
          const usada = store.list('transactions', (t) => t.accountId === a.id).length;
          const msg = usada
            ? `A conta "${a.name}" tem ${usada} lançamento(s). Excluir mesmo assim? Os lançamentos permanecem, mas ficam sem conta.`
            : `Excluir a conta "${a.name}"?`;
          if (await confirmDialog(msg, { danger: true, okLabel: 'Excluir' })) {
            await store.remove('accounts', a.id);
            emit('nav:refresh');
          }
        },
      }),
    ],
  });
  if (!valores?.nome?.trim()) return;
  await store.save('accounts', {
    id: a.id, name: valores.nome.trim(), kind: valores.tipo, initial: parseMoney(valores.inicial),
  });
  emit('nav:refresh');
}

async function editarOrcamento(b = {}) {
  const novo = !b.id;
  const valores = await formModal({
    title: novo ? 'Novo orçamento' : 'Editar orçamento',
    values: { categoria: b.category ?? 'alimentação', limite: b.limit ?? b.monthly ?? '' },
    fields: [
      { name: 'categoria', label: 'Categoria', type: 'select', options: store.CATEGORIES_FIN },
      { name: 'limite', label: 'Limite mensal (R$)', type: 'number', step: '0.01', min: '0' },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => { close(); await store.remove('budgets', b.id); emit('nav:refresh'); },
      }),
    ],
  });
  if (!valores) return;
  const limite = parseMoney(valores.limite);
  if (!limite) { toast('Informe um limite maior que zero.', 'err'); return; }
  await store.save('budgets', { id: b.id, category: valores.categoria, monthly: limite });
  emit('nav:refresh');
}

/* ---------- extras ---------- */

function analisar() {
  jarbas.askFrom(
    `Analise minhas finanças de ${mes}. Compare com o mês anterior, aponte a categoria que mais pesou, `
    + 'diga se algum orçamento está em risco e sugira dois cortes concretos com o valor que eu economizaria. '
    + 'Seja específico com números, sem conselhos genéricos.',
  );
}

function exportarCsv() {
  const txs = store.monthTransactions(mes);
  if (!txs.length) { toast('Nada para exportar neste mês.', 'err'); return; }
  const linhas = [
    'data;descricao;tipo;valor;categoria;conta',
    ...txs.map((t) => [
      t.date,
      `"${String(t.desc).replace(/"/g, '""')}"`,
      t.type === 'out' ? 'saida' : 'entrada',
      String(t.amount).replace('.', ','),
      t.category || '',
      store.get('accounts', t.accountId)?.name || '',
    ].join(';')),
  ];
  // BOM para o Excel abrir os acentos corretamente
  download(`thito-financas-${mes}.csv`, `﻿${linhas.join('\n')}`, 'text/csv;charset=utf-8');
  toast('CSV exportado.', 'ok');
}

on('action:new-transaction', () => editarTransacao());
