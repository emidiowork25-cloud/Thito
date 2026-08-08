// Compras — listas, itens e a ponte para o financeiro.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import { el, money, today, parseMoney, sum } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, toast, statTile } from '../ui/components.js';

let listaAtiva = null;

export function render(root, params = {}) {
  const listas = store.activeLists();
  if (params.id) {
    const item = store.get('items', params.id);
    if (item) listaAtiva = item.listId;
  }
  if (!listas.some((l) => l.id === listaAtiva)) listaAtiva = listas[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    ...listas.map((l) => {
      const t = store.listTotal(l.id);
      return el('button', {
        class: `chip ${l.id === listaAtiva ? 'on' : ''}`,
        onclick: () => { listaAtiva = l.id; emit('nav:refresh'); },
      }, el('span', { text: l.name }), t.pending ? el('span', { class: 'chip-count', text: String(t.pending) }) : null);
    }),
    el('button', { class: 'btn sm', text: '+ lista', onclick: () => editarLista() }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Sugerir com JARBAS', onclick: sugerir }),
  ));

  if (!listaAtiva) {
    root.append(el('div', { class: 'card' }, emptyState('Nenhuma lista ainda.', 'Criar a primeira lista', () => editarLista())));
    return;
  }

  const lista = store.get('lists', listaAtiva);
  const total = store.listTotal(listaAtiva);

  root.append(el('div', { class: 'grid dash-stats' },
    statTile({ label: 'A comprar', value: String(total.pending) }),
    statTile({ label: 'No carrinho', value: String(total.count - total.pending) }),
    statTile({ label: 'Estimativa total', value: money(total.estimate) }),
    statTile({ label: 'Já pego', value: money(total.spent), tone: 'ok' }),
  ));

  root.append(el('div', { class: 'grid compras-grid' }, cardItens(lista, total), cardAcoes(lista, total)));
}

/* ---------- itens ---------- */

function cardItens(lista, total) {
  const itens = store.listItems(lista.id);
  const pendentes = itens.filter((i) => !i.done);
  const feitos = itens.filter((i) => i.done);

  const entrada = el('input', {
    type: 'text', placeholder: 'Adicionar item e apertar Enter…  (ex.: arroz 2 12,90)',
    onkeydown: async (e) => {
      if (e.key !== 'Enter') return;
      const texto = e.target.value.trim();
      if (!texto) return;
      e.target.value = '';
      await adicionarRapido(lista.id, texto);
      emit('nav:refresh');
    },
  });

  const body = el('div', { class: 'list-plain' });
  if (!itens.length) body.append(emptyState('Lista vazia.'));

  for (const i of pendentes) body.append(linhaItem(i));
  if (feitos.length) {
    body.append(el('div', { class: 'tiny dim', style: 'margin:14px 0 6px', text: `No carrinho (${feitos.length})` }));
    for (const i of feitos) body.append(linhaItem(i));
  }

  return sectionCard(lista.name, [
    el('button', { class: 'btn sm', text: 'Renomear', onclick: () => editarLista(lista) }),
    feitos.length ? el('button', { class: 'btn sm', text: 'Limpar comprados', onclick: () => limparComprados(lista.id) }) : null,
  ].filter(Boolean), entrada, body);
}

function linhaItem(i) {
  const preco = (Number(i.price) || 0) * (Number(i.qty) || 1);
  return el('div', { class: `item-row ${i.done ? 'done' : ''}` },
    el('input', {
      type: 'checkbox', checked: i.done,
      onchange: async (e) => { await store.save('items', { id: i.id, done: e.target.checked }); emit('nav:refresh'); },
    }),
    el('div', { class: 'item-main', onclick: () => editarItem(i) },
      el('div', { text: `${i.name}${i.qty > 1 ? `  ×${i.qty}` : ''}` }),
      i.category ? el('div', { class: 'tiny dim', text: i.category }) : null),
    preco ? el('span', { class: 'mono tiny dim', text: money(preco) }) : null,
    el('button', {
      class: 'icon-btn sm', text: '✕', title: 'Remover',
      onclick: async (e) => { e.stopPropagation(); await store.remove('items', i.id); emit('nav:refresh'); },
    }));
}

/* ---------- ações ---------- */

function cardAcoes(lista, total) {
  const body = el('div', { class: 'grid', style: 'gap:10px' });

  body.append(el('p', { class: 'tiny dim', style: 'margin:0', text: 'Terminou a compra? Lance o valor gasto no financeiro e limpe a lista de uma vez.' }));
  body.append(el('button', {
    class: 'btn primary', text: `Finalizar compra (${money(total.spent || total.estimate)})`,
    onclick: () => finalizarCompra(lista, total),
  }));
  body.append(el('button', {
    class: 'btn', text: 'Copiar lista',
    onclick: async () => {
      const texto = store.listItems(lista.id).filter((i) => !i.done)
        .map((i) => `- ${i.name}${i.qty > 1 ? ` (${i.qty})` : ''}`).join('\n');
      try {
        await navigator.clipboard.writeText(`${lista.name}\n${texto}`);
        toast('Lista copiada.', 'ok');
      } catch { toast('Não consegui copiar — permissão negada pelo navegador.', 'err'); }
    },
  }));
  body.append(el('button', {
    class: 'btn', text: 'Estimar preços com JARBAS',
    onclick: () => jarbas.askFrom(
      `Olhe os itens pendentes da minha lista "${lista.name}". Estime um preço médio de mercado no Brasil para cada um `
      + 'e me diga o total aproximado. Não altere nada ainda — só me mostre a estimativa.',
    ),
  }));
  body.append(el('button', {
    class: 'btn danger', text: 'Excluir lista',
    onclick: async () => {
      if (!await confirmDialog(`Excluir a lista "${lista.name}" e todos os seus itens?`, { danger: true, okLabel: 'Excluir' })) return;
      for (const i of store.listItems(lista.id)) await store.remove('items', i.id);
      await store.remove('lists', lista.id);
      listaAtiva = null;
      toast('Lista excluída.');
      emit('nav:refresh');
    },
  }));

  return sectionCard('Ações', null, body);
}

async function finalizarCompra(lista, total) {
  const contas = store.list('accounts');
  const valorSugerido = total.spent || total.estimate;
  const valores = await formModal({
    title: 'Finalizar compra',
    okLabel: 'Lançar e limpar',
    values: { valor: valorSugerido.toFixed(2), conta: contas[0]?.id ?? '', limpar: true },
    fields: [
      { name: 'valor', label: 'Valor total gasto (R$)', type: 'number', step: '0.01' },
      { name: 'conta', label: 'Conta', type: 'select', options: contas.map((a) => [a.id, a.name]) },
      { name: 'limpar', label: 'Remover os itens comprados da lista', type: 'checkbox' },
    ],
  });
  if (!valores) return;
  const valor = parseMoney(valores.valor);
  if (!valor) { toast('Informe o valor gasto.', 'err'); return; }

  await store.save('transactions', {
    desc: `Compras — ${lista.name}`,
    amount: valor,
    type: 'out',
    date: today(),
    category: 'alimentação',
    accountId: valores.conta,
  });
  if (valores.limpar) await limparComprados(lista.id, { silencioso: true });
  toast(`Lançado ${money(valor)} no financeiro.`, 'ok');
  emit('nav:refresh');
}

async function limparComprados(listId, { silencioso = false } = {}) {
  const feitos = store.listItems(listId).filter((i) => i.done);
  for (const i of feitos) await store.remove('items', i.id);
  if (!silencioso) { toast(`${feitos.length} item(ns) removido(s).`); emit('nav:refresh'); }
}

/* ---------- entrada rápida ---------- */

/**
 * Interpreta "arroz 2 12,90" → item "arroz", quantidade 2, preço 12,90.
 * Os números do fim são opcionais: quantidade primeiro, preço depois.
 */
async function adicionarRapido(listId, texto) {
  const m = /^(.+?)\s+(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?))?$/.exec(texto);
  let nome = texto;
  let qty = 1;
  let price = 0;
  if (m) {
    nome = m[1].trim();
    if (m[3] !== undefined) { qty = Math.max(1, Math.round(parseMoney(m[2]))); price = parseMoney(m[3]); }
    else { const n = parseMoney(m[2]); if (Number.isInteger(n) && n <= 99) qty = n; else price = n; }
  }
  await store.save('items', { listId, name: nome, qty, price, done: false });
}

/* ---------- edição ---------- */

async function editarItem(i) {
  const valores = await formModal({
    title: i.id ? 'Editar item' : 'Novo item',
    values: { nome: i.name, quantidade: i.qty ?? 1, preco: i.price ?? '', categoria: i.category ?? '' },
    fields: [
      { name: 'nome', label: 'Item', required: true },
      { name: 'quantidade', label: 'Quantidade', type: 'number', min: '1', step: '1', inline: true },
      { name: 'preco', label: 'Preço unitário (R$)', type: 'number', step: '0.01', inline: true },
      { name: 'categoria', label: 'Categoria', placeholder: 'hortifrúti, limpeza…' },
    ],
    extraButtons: i.id ? (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => { close(); await store.remove('items', i.id); emit('nav:refresh'); },
      }),
    ] : null,
  });
  if (!valores?.nome?.trim()) return;
  await store.save('items', {
    id: i.id,
    listId: i.listId,
    done: i.done ?? false,
    name: valores.nome.trim(),
    qty: Number(valores.quantidade) || 1,
    price: parseMoney(valores.preco),
    category: valores.categoria,
  });
  emit('nav:refresh');
}

async function editarLista(l = {}) {
  const valores = await formModal({
    title: l.id ? 'Renomear lista' : 'Nova lista',
    values: { nome: l.name ?? '' },
    fields: [{ name: 'nome', label: 'Nome da lista', required: true, placeholder: 'Mercado, farmácia, feira…' }],
  });
  if (!valores?.nome?.trim()) return;
  const salva = await store.save('lists', { id: l.id, name: valores.nome.trim(), archived: false });
  listaAtiva = salva.id;
  emit('nav:refresh');
}

function sugerir() {
  const lista = store.get('lists', listaAtiva);
  jarbas.askFrom(
    `Com base no meu histórico de compras e gastos, sugira itens que provavelmente estão faltando na lista "${lista?.name ?? 'Mercado'}". `
    + 'Me mostre a sugestão primeiro e pergunte quais eu quero adicionar.',
  );
}

on('action:new-item', () => {
  const lista = store.get('lists', listaAtiva) ?? store.activeLists()[0];
  if (lista) editarItem({ listId: lista.id, name: '', qty: 1 });
});
