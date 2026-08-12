// Finanças — contas, lançamentos, orçamentos e a leitura do mês.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import * as visao from '../core/visao.js';
import { on, emit } from '../core/bus.js';
import {
  el, money, today, monthKey, addMonths, fmtDate, parseMoney, norm, monthName, parseDate, download, sum, pickFile,
} from '../core/util.js';
import { statTile, meter, sectionCard, emptyState, formModal, modal, confirmDialog, toast } from '../ui/components.js';

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
    el('button', {
      class: 'btn sm', text: 'Importar extrato (PDF)',
      title: 'Lê o extrato do banco e traz os lançamentos, um a um, para você conferir',
      onclick: () => importarExtrato(),
    }),
    el('button', { class: 'btn sm', text: 'Exportar CSV', onclick: exportarCsv }),
    el('button', { class: 'btn primary sm', text: '+ Lançamento', onclick: () => editarTransacao() }),
  ));

  root.append(el('div', { class: 'grid dash-stats' },
    statTile({ label: 'Entradas', value: money(resumo.income), tone: 'ok' }),
    statTile({ label: 'Saídas', value: money(resumo.expense), tone: 'bad' }),
    statTile({ label: 'Resultado', value: money(resumo.net), tone: resumo.net < 0 ? 'bad' : 'ok', sub: `${resumo.count} lançamentos` }),
    statTile({ label: 'Saldo total', value: money(store.totalBalance()), sub: `${store.list('accounts').length} conta(s)` }),
    tileAReceber(),
  ));

  root.append(el('div', { class: 'grid fin-grid' },
    el('div', { class: 'grid', style: 'align-content:start' }, cardLancamentos(resumo)),
    el('div', { class: 'grid', style: 'align-content:start' }, cardContas(), cardCategorias(resumo), cardOrcamentos())));
}

/**
 * Dinheiro que ainda não entrou: freelas fechados e eventos já feitos que não
 * foram pagos. Fica aqui, e não no painel inicial, porque é um número que anda
 * devagar — quem quer saber dele vem procurar, e vem procurar em Finanças.
 *
 * Soma as duas fontes de propósito: no módulo Freela aparece só a parte dos
 * freelas, e quem quer saber quanto tem para receber quer o total, não a metade.
 *
 * Some quando não há nada a receber. Quadro zerado é ruído com cara de dado.
 */
function tileAReceber() {
  const freelas = store.freelasAReceber();
  const eventos = store.list('producoes', (e) => !e.pago && (Number(e.cache) || 0) > 0);
  const total = sum(freelas, (f) => Number(f.valor) || 0) + sum(eventos, (e) => Number(e.cache) || 0);
  if (!total) return null;

  const hoje = today();
  const vencidos = store.freelasAtrasadas().length + eventos.filter((e) => e.date && e.date < hoje).length;

  return statTile({
    label: 'A receber',
    value: money(total),
    tone: vencidos ? 'bad' : '',
    sub: vencidos ? `${vencidos} já venceu — cobre` : `${freelas.length + eventos.length} trabalho(s)`,
  });
}

/* ---------- importar extrato em PDF ---------- */

const FERRAMENTA_EXTRATO = {
  name: 'ler_extrato',
  description: 'Registra os lançamentos de um extrato bancário ou fatura de cartão.',
  input_schema: {
    type: 'object',
    properties: {
      banco: { type: 'string', description: 'Nome do banco ou da instituição, como aparece no documento.' },
      conta: { type: 'string', description: 'Identificação da conta ou do cartão, se houver (ex.: "ag 1234 / cc 56789-0" ou "final 4321").' },
      lancamentos: {
        type: 'array',
        description: 'Uma entrada por linha de movimentação, na ordem em que aparecem.',
        items: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'Data no formato AAAA-MM-DD. Use o ano do extrato quando a linha só trouxer dia e mês.' },
            descricao: { type: 'string', description: 'O histórico da linha, como está escrito. Não resuma nem reescreva.' },
            valor: { type: 'number', description: 'Valor em reais, sempre POSITIVO. O sentido vai no campo tipo.' },
            tipo: { type: 'string', description: '"entrada" quando o dinheiro entrou na conta (crédito, depósito, PIX recebido, salário) e "saida" quando saiu (débito, compra, pagamento, PIX enviado, tarifa).' },
            categoria: { type: 'string', description: 'Uma destas: moradia, alimentação, transporte, saúde, educação, lazer, assinaturas, compras, impostos, salário, investimento, outro.' },
            forma: { type: 'string', description: 'Como o dinheiro se moveu, quando o histórico disser: dinheiro, pix, transferência, boleto, cartão de crédito, cartão de débito, débito automático, outro.' },
          },
          required: ['data', 'descricao', 'valor', 'tipo'],
        },
      },
    },
    required: ['lancamentos'],
  },
};

const INSTRUCAO_EXTRATO = [
  'Este PDF é um extrato bancário ou uma fatura de cartão. Registre as movimentações com a ferramenta ler_extrato.',
  '',
  'Regras: copie data, histórico e valor como estão no documento, sem arredondar e sem reescrever a descrição.',
  'Ignore o que não é movimentação — saldo anterior, saldo do dia, saldo final, totalizadores, subtotais de página,',
  'cabeçalho, rodapé, aviso legal e propaganda. Uma linha de saldo não é um lançamento e lançá-la dobra o valor do mês.',
  '',
  'Preste atenção ao sinal: em extrato, "D" ou valor entre parênteses ou com sinal negativo é saída; "C" é entrada.',
  'O campo valor vai sempre positivo — quem diz o sentido é o campo tipo.',
  '',
  'Se o PDF não for extrato nem fatura, não use a ferramenta: responda em uma frase o que ele é.',
].join('\n');

/** Digital de um lançamento, para reconhecer o que já entrou numa importação anterior. */
const digital = (t) => [
  t.date,
  Math.round((Number(t.amount) || 0) * 100),
  t.type,
  norm(t.desc).replace(/[^a-z0-9]/g, '').slice(0, 24),
].join('|');

async function importarExtrato() {
  const contas = store.list('accounts');
  if (!contas.length) { toast('Crie uma conta antes — é nela que os lançamentos vão entrar.', 'err'); return; }

  const file = await pickFile(visao.TIPOS_PDF);
  if (!file) return;

  const estado = el('div', { class: 'tiny dim' },
    el('div', { text: `Lendo "${file.name}"…` }),
    el('div', { style: 'margin-top:6px', text: 'Extrato longo demora e custa mais tokens — a leitura é por página.' }));
  const m = modal({ title: 'Importar extrato', render: () => el('div', {}, estado) });

  let lido;
  try {
    lido = await visao.lerArquivo(file, { instrucao: INSTRUCAO_EXTRATO, ferramenta: FERRAMENTA_EXTRATO });
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

  const linhas = (lido.dados.lancamentos ?? [])
    .map((l) => ({
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(l?.data ?? '')) ? l.data : null,
      desc: String(l?.descricao ?? '').trim(),
      amount: Math.abs(Number(l?.valor) || 0),
      type: String(l?.tipo ?? '').toLowerCase().startsWith('entrada') ? 'in' : 'out',
      category: store.CATEGORIES_FIN.includes(String(l?.categoria ?? '').toLowerCase())
        ? String(l.categoria).toLowerCase() : 'outro',
      forma: store.FORMAS_PAGAMENTO.includes(String(l?.forma ?? '').toLowerCase())
        ? String(l.forma).toLowerCase() : 'outro',
    }))
    .filter((l) => l.date && l.desc && l.amount > 0);

  if (!linhas.length) {
    estado.className = 'aviso';
    estado.textContent = 'Li o PDF, mas não consegui separar nenhuma movimentação nele.';
    return;
  }

  m.close();
  await conferirExtrato(lido.dados, linhas, contas);
}

/**
 * A conferência do extrato.
 *
 * Extrato é o caso em que a importação silenciosa faz mais estrago: são
 * dezenas de linhas de uma vez, e um erro no meio some no extrato do mês para
 * aparecer só quando o saldo não fechar. Nada entra sem passar por aqui.
 *
 * O que já foi importado antes vem DESMARCADO, e não escondido: importar o
 * mesmo PDF duas vezes é o acidente mais provável de todos, e esconder a
 * repetição deixaria a pessoa achando que o arquivo veio pela metade.
 */
async function conferirExtrato(dados, linhas, contas) {
  const existentes = new Set(store.list('transactions').map(digital));
  const repetidas = linhas.filter((l) => existentes.has(digital(l))).length;

  const marcados = linhas.map((l) => !existentes.has(digital(l)));
  const corpo = el('div');

  const cabecalho = [dados.banco, dados.conta].filter(Boolean).join(' · ');
  corpo.append(el('p', { class: 'tiny dim', style: 'margin-top:0' },
    `${cabecalho ? `${cabecalho} — ` : ''}${linhas.length} movimentação(ões) lidas. Desmarque o que não quiser trazer.`));

  if (repetidas) {
    corpo.append(el('div', { class: 'aviso' },
      `${repetidas} lançamento(s) já existem no seu financeiro, com a mesma data, valor e histórico. `
      + 'Vieram desmarcados para não dobrar. Se forem cobranças de verdade repetidas, marque de novo.'));
  }

  const campoConta = el('select', {}, ...contas.map((a) => el('option', { value: a.id }, a.name)));
  const resumo = el('div', { class: 'tiny dim', style: 'margin-top:10px' });

  const atualizarResumo = () => {
    const sel = linhas.filter((_, i) => marcados[i]);
    const entra = sum(sel.filter((l) => l.type === 'in'), (l) => l.amount);
    const sai = sum(sel.filter((l) => l.type === 'out'), (l) => l.amount);
    resumo.textContent = `${sel.length} selecionado(s) · entradas ${money(entra)} · saídas ${money(sai)} · resultado ${money(entra - sai)}`;
  };

  const lista = el('div', { class: 'list-plain previa-rolagem' });
  linhas.forEach((l, idx) => {
    const caixa = el('input', { type: 'checkbox' });
    caixa.checked = marcados[idx];
    caixa.addEventListener('change', () => { marcados[idx] = caixa.checked; atualizarResumo(); });
    lista.append(el('div', { class: `item-row ${existentes.has(digital(l)) ? 'ja-existe' : ''}` },
      caixa,
      el('div', { class: 'item-main' },
        el('div', { text: l.desc }),
        el('div', { class: 'tiny dim', text: [fmtDate(l.date), l.category, l.forma].filter(Boolean).join(' · ') })),
      el('span', { class: `mono tiny ${l.type === 'in' ? 'ok' : 'bad'}`, text: `${l.type === 'in' ? '+' : '−'} ${money(l.amount)}` })));
  });
  corpo.append(lista, resumo);
  atualizarResumo();

  corpo.append(el('div', { class: 'field', style: 'margin-top:14px' },
    el('label', { text: 'Lançar na conta' }), campoConta));

  const confirmado = await new Promise((resolve) => {
    let respondido = false;
    const fim = (v) => { if (!respondido) { respondido = true; resolve(v); } };
    modal({
      title: dados.banco ? `Extrato — ${dados.banco}` : 'Extrato',
      wide: true,
      onClose: () => fim(false),
      render: () => corpo,
      footer: (close) => [
        el('button', { class: 'btn', text: 'Descartar', onclick: () => { fim(false); close(); } }),
        el('button', { class: 'btn primary', text: 'Importar', onclick: () => { fim(true); close(); } }),
      ],
    });
  });
  if (!confirmado) return;

  const escolhidas = linhas.filter((_, i) => marcados[i]);
  for (const l of escolhidas) {
    await store.save('transactions', {
      desc: l.desc,
      amount: l.amount,
      type: l.type,
      date: l.date,
      category: l.category,
      forma: l.forma,
      accountId: campoConta.value,
      // De onde veio. Serve para saber, meses depois, o que foi digitado à mão
      // e o que veio de extrato — e para uma futura limpeza saber o que remover.
      origem: 'extrato',
    });
  }

  toast(`${escolhidas.length} lançamento(s) importado(s) do extrato.`, 'ok');
  emit('nav:refresh');
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
      el('div', { class: 'tiny dim', text: [t.category, t.forma, conta?.name, t.recurring ? 'recorrente' : ''].filter(Boolean).join(' · ') })),
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

  // O botão só existe quando há o que juntar. Botão que não faz nada em 99%
  // das visitas é enfeite que ocupa o lugar do que faz.
  const duplicadas = store.planoDeFusaoDeContas();

  return sectionCard('Contas', [
    duplicadas.length
      ? el('button', {
        class: 'btn sm', text: 'Juntar duplicadas',
        title: `${duplicadas.length} nome(s) repetido(s)`,
        onclick: () => juntarContas(duplicadas),
      })
      : null,
    el('button', { class: 'btn sm', text: '+', onclick: () => editarConta() }),
  ].filter(Boolean), body);
}

/**
 * Contas repetidas aparecem sozinhas: cada aparelho que abria o app com o
 * banco vazio criava as suas, e a sincronização guardava todas. Juntar move
 * lançamento e soma saldo inicial — por isso a tela mostra o plano inteiro
 * antes, em vez de simplesmente fazer.
 */
async function juntarContas(grupos) {
  const linhas = grupos.map((g) => {
    const quantos = g.somem.length;
    const lanc = g.lancamentos
      ? `, levando ${g.lancamentos} lançamento${g.lancamentos === 1 ? '' : 's'}`
      : ', sem nenhum lançamento para mover';
    return `· "${g.fica.name}": ${quantos + 1} viram 1${lanc}.`;
  });

  const ok = await confirmDialog(
    `${linhas.join('\n')}\n\nOs saldos iniciais são somados. Nenhum lançamento é apagado.`,
    { title: 'Juntar contas repetidas', okLabel: 'Juntar' },
  );
  if (!ok) return;

  const r = await store.fundirContasDuplicadas();
  toast(`${r.apagadas} conta(s) a menos · ${r.movidos} lançamento(s) remanejado(s).`, 'ok');
  emit('nav:refresh');
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
      forma: t.forma ?? 'pix',
      recorrente: !!t.recurring,
    },
    fields: [
      { name: 'descricao', label: 'Descrição', required: true, placeholder: 'Supermercado, aluguel, salário…' },
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', min: '0', inline: true, required: true },
      { name: 'tipo', label: 'Tipo', type: 'select', options: [['saida', 'saída'], ['entrada', 'entrada']], inline: true },
      { name: 'data', label: 'Data', type: 'date', inline: true },
      { name: 'categoria', label: 'Categoria', type: 'select', options: store.CATEGORIES_FIN, inline: true },
      // Conta e forma são coisas diferentes, e por isso ficam lado a lado: a
      // conta é ONDE o dinheiro está, a forma é COMO ele se moveu. Um PIX sai
      // da conta corrente; sem o segundo campo, "conta corrente" tinha que
      // responder pelos dois, e não responde.
      { name: 'conta', label: 'Conta', type: 'select', options: contas.map((a) => [a.id, a.name]), inline: true },
      { name: 'forma', label: 'Forma de pagamento', type: 'select', options: store.FORMAS_PAGAMENTO, inline: true },
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
    forma: valores.forma,
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
  download(`jarbas-financas-${mes}.csv`, `﻿${linhas.join('\n')}`, 'text/csv;charset=utf-8');
  toast('CSV exportado.', 'ok');
}

on('action:new-transaction', () => editarTransacao());
