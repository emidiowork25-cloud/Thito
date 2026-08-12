// Compras — listas, itens e a ponte para o financeiro.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import * as visao from '../core/visao.js';
import { on, emit } from '../core/bus.js';
import { el, money, today, parseMoney, sum, pickFile, truncate } from '../core/util.js';
import { sectionCard, emptyState, formModal, modal, confirmDialog, toast, statTile } from '../ui/components.js';

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
    el('button', {
      class: 'btn sm', text: 'Ler nota fiscal',
      title: 'Fotografe o cupom: os itens entram na lista e o total vai para o financeiro',
      onclick: () => lerNota(),
    }),
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
      el('div', { class: 'tiny dim', text: [i.category, i.lancado ? 'já lançado' : null].filter(Boolean).join(' · ') })),
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

  // O que veio de nota fiscal já foi lançado na hora da leitura. Somar de novo
  // aqui pagaria a mesma compra duas vezes no extrato — e o erro só apareceria
  // semanas depois, quando o saldo não fechasse com o do banco.
  const jaLancado = sum(
    store.listItems(lista.id).filter((i) => i.done && i.lancado),
    (i) => (Number(i.price) || 0) * (Number(i.qty) || 1),
  );
  const valorSugerido = Math.max(0, (total.spent || total.estimate) - jaLancado);

  const valores = await formModal({
    title: 'Finalizar compra',
    okLabel: 'Lançar e limpar',
    values: { valor: valorSugerido.toFixed(2), conta: contas[0]?.id ?? '', limpar: true },
    fields: [
      {
        name: 'valor', label: 'Valor total gasto (R$)', type: 'number', step: '0.01',
        hint: jaLancado
          ? `${money(jaLancado)} desta lista já foi lançado pela leitura da nota fiscal e está fora deste valor.`
          : null,
      },
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

/* ---------- nota fiscal ---------- */

const FERRAMENTA_NOTA = {
  name: 'ler_nota',
  description: 'Registra o que está escrito num cupom fiscal ou nota de compra.',
  input_schema: {
    type: 'object',
    properties: {
      estabelecimento: { type: 'string', description: 'Nome da loja, mercado ou farmácia como aparece na nota.' },
      data: { type: 'string', description: 'Data da compra no formato AAAA-MM-DD. Vazio se não estiver legível.' },
      total: { type: 'number', description: 'O valor total pago, em reais, já com descontos — o número que a nota apresenta como total.' },
      itens: {
        type: 'array',
        description: 'Uma entrada por linha de produto da nota.',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Descrição do produto. Se vier abreviada na nota, escreva por extenso quando o significado for óbvio (ex.: "REFRIG COCA 2L" → "Refrigerante Coca-Cola 2L").' },
            quantidade: { type: 'number', description: 'Quantidade comprada. 1 quando a nota não disser.' },
            preco_unitario: { type: 'number', description: 'Preço de UMA unidade, em reais. Se a nota só trouxer o valor da linha, divida pela quantidade.' },
            categoria: { type: 'string', description: 'Uma palavra: hortifrúti, carnes, limpeza, higiene, bebidas, padaria, mercearia, farmácia, outro.' },
          },
          required: ['nome'],
        },
      },
    },
    required: ['itens'],
  },
};

const INSTRUCAO_NOTA = [
  'Esta é a foto de um cupom fiscal ou nota de compra. Registre o conteúdo com a ferramenta ler_nota.',
  '',
  'Regras: copie os valores como estão na nota, sem arredondar e sem estimar preço que não esteja escrito.',
  'Ignore as linhas que não são produto — subtotal, troco, forma de pagamento, CNPJ, tributos, mensagens',
  'do fisco. Se uma linha estiver ilegível, deixe-a de fora em vez de adivinhar.',
  '',
  'Se a foto não for uma nota de compra, não use a ferramenta: responda em uma frase o que você está vendo.',
].join('\n');

async function lerNota() {
  if (!listaAtiva) { toast('Crie uma lista antes — é nela que os itens vão entrar.', 'err'); return; }

  const file = await pickFile(visao.TIPOS);
  if (!file) return;

  const estado = el('div', { class: 'tiny dim', text: `Lendo "${truncate(file.name, 30)}"…` });
  const m = modal({ title: 'Ler nota fiscal', render: () => el('div', {}, estado) });

  let lido;
  try {
    lido = await visao.lerImagem(file, { instrucao: INSTRUCAO_NOTA, ferramenta: FERRAMENTA_NOTA });
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = visao.explicarFalha(err);
    return;
  }

  if (lido.texto) {
    estado.className = 'aviso';
    estado.textContent = lido.texto;
    return;
  }

  const itens = (lido.dados.itens ?? [])
    .map((i) => ({
      nome: String(i?.nome ?? '').trim(),
      qtd: Math.max(1, Number(i?.quantidade) || 1),
      preco: Math.max(0, Number(i?.preco_unitario) || 0),
      categoria: String(i?.categoria ?? '').trim().toLowerCase(),
    }))
    .filter((i) => i.nome);

  if (!itens.length) {
    estado.className = 'aviso';
    estado.textContent = 'Li a foto, mas não consegui separar nenhum item de produto nela.';
    return;
  }

  m.close();
  await conferirNota(lido.dados, itens);
}

/**
 * A tela de conferência. Nada entra no sistema antes de passar por aqui: uma
 * foto torta troca 8 por 3 sem avisar, e um erro que vira lançamento financeiro
 * some no meio do extrato semanas depois.
 */
async function conferirNota(dados, itens) {
  const lista = store.get('lists', listaAtiva);
  const contas = store.list('accounts');
  const somaItens = sum(itens, (i) => i.qtd * i.preco);
  const totalNota = Number(dados.total) || 0;
  const dataNota = /^\d{4}-\d{2}-\d{2}$/.test(String(dados.data ?? '')) ? dados.data : today();
  const loja = String(dados.estabelecimento ?? '').trim();

  const marcados = itens.map(() => true);
  const linhas = el('div', { class: 'list-plain' });
  itens.forEach((i, idx) => {
    const caixa = el('input', { type: 'checkbox' });
    caixa.checked = true;
    caixa.addEventListener('change', () => { marcados[idx] = caixa.checked; });
    linhas.append(el('div', { class: 'item-row' },
      caixa,
      el('div', { class: 'item-main' },
        el('div', { text: `${i.nome}${i.qtd > 1 ? `  ×${i.qtd}` : ''}` }),
        i.categoria ? el('div', { class: 'tiny dim', text: i.categoria }) : null),
      el('span', { class: 'mono tiny dim', text: money(i.qtd * i.preco) })));
  });

  const campoTotal = el('input', { type: 'number', step: '0.01' });
  campoTotal.value = (totalNota || somaItens).toFixed(2);
  const campoData = el('input', { type: 'date' });
  campoData.value = dataNota;
  const campoConta = el('select', {}, ...contas.map((a) => el('option', { value: a.id }, a.name)));
  const campoCategoria = el('select', {}, ...store.CATEGORIES_FIN.map((c) => el('option', { value: c, selected: c === 'alimentação' }, c)));
  const campoLancar = el('input', { type: 'checkbox' });
  campoLancar.checked = true;

  // Nota quase nunca fecha na soma dos itens: desconto, taxa de serviço e
  // sacola entram no total e não em linha de produto. Quem manda no extrato é o
  // total — mas a diferença tem que aparecer, senão ela vira erro silencioso.
  const diferenca = totalNota && Math.abs(totalNota - somaItens) > 0.05
    ? el('div', { class: 'aviso', style: 'margin-top:10px' },
      `A soma dos itens dá ${money(somaItens)} e a nota diz ${money(totalNota)} `
      + `(${money(Math.abs(totalNota - somaItens))} de diferença). `
      + 'Vou lançar o total da nota; confira se foi desconto, taxa ou item que não consegui ler.')
    : null;

  const corpo = el('div', {},
    el('p', { class: 'tiny dim', style: 'margin-top:0' },
      `${loja ? `${loja} · ` : ''}${itens.length} itens lidos. Desmarque o que não quiser trazer.`),
    linhas,
    diferenca,
    el('div', { class: 'row', style: 'margin-top:14px' },
      el('div', { class: 'field' }, el('label', { text: 'Total pago (R$)' }), campoTotal),
      el('div', { class: 'field' }, el('label', { text: 'Data' }), campoData)),
    el('div', { class: 'row' },
      el('div', { class: 'field' }, el('label', { text: 'Conta' }), campoConta),
      el('div', { class: 'field' }, el('label', { text: 'Categoria' }), campoCategoria)),
    el('div', { class: 'field' },
      el('label', { style: 'display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)' },
        campoLancar, 'Lançar o total no financeiro')),
  );

  const confirmado = await new Promise((resolve) => {
    let respondido = false;
    const fim = (v) => { if (!respondido) { respondido = true; resolve(v); } };
    modal({
      title: loja ? `Nota de ${truncate(loja, 32)}` : 'Nota fiscal',
      wide: true,
      onClose: () => fim(false),
      render: () => corpo,
      footer: (close) => [
        el('button', { class: 'btn', text: 'Descartar', onclick: () => { fim(false); close(); } }),
        el('button', { class: 'btn primary', text: 'Registrar', onclick: () => { fim(true); close(); } }),
      ],
    });
  });
  if (!confirmado) return;

  const escolhidos = itens.filter((_, idx) => marcados[idx]);
  for (const i of escolhidos) {
    // Já comprados: a nota é o comprovante de que saíram da prateleira. Entram
    // no carrinho, não na lista do que ainda falta pegar.
    await store.save('items', {
      listId: listaAtiva,
      name: i.nome,
      qty: i.qtd,
      price: i.preco,
      category: i.categoria,
      done: true,
      // Marca de que este item já foi pago e já virou lançamento. Sem ela,
      // "Finalizar compra" somaria de novo o que a nota acabou de lançar.
      lancado: campoLancar.checked && parseMoney(campoTotal.value) > 0,
    });
  }

  const valor = parseMoney(campoTotal.value);
  if (campoLancar.checked && valor > 0) {
    await store.save('transactions', {
      desc: `Compras — ${loja || lista?.name || 'nota fiscal'}`,
      amount: valor,
      type: 'out',
      date: campoData.value || today(),
      category: campoCategoria.value,
      accountId: campoConta.value,
    });
  }

  const aviso = campoLancar.checked && valor > 0 ? ` e ${money(valor)} lançado no financeiro` : '';
  toast(`${escolhidos.length} item(ns) da nota adicionados${aviso}.`, 'ok');
  emit('nav:refresh');
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
