// Freela — cada trabalho avulso com o que importa saber depois: para quem é,
// qual o seu papel, quanto paga, quando paga e se já caiu na conta.
//
// A pergunta que este módulo existe para responder é "quem ainda me deve".
// Por isso o topo é a régua do dinheiro, não uma lista de tarefas.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { emit } from '../core/bus.js';
import { el, money, today, addDays, fmtDate, relDay, parseMoney, sum, monthName, parseDate } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, statTile, toast } from '../ui/components.js';

export const SITUACOES = ['proposta', 'fechado', 'em andamento', 'entregue', 'cancelado'];

let selecionado = null;
let filtro = 'abertos';

export function render(root, params = {}) {
  if (params.id) selecionado = params.id;

  const todos = store.list('freelas').sort(ordenar);
  const visiveis = todos.filter((f) => (
    filtro === 'todos' ? true
      : filtro === 'receber' ? (!f.pago && store.FREELA_CONTRATADOS.includes(store.freelaStatus(f)))
        : filtro === 'propostas' ? store.freelaStatus(f) === 'proposta' && !f.pago
          : store.FREELA_VIVOS.includes(store.freelaStatus(f))
  ));

  if (!visiveis.some((f) => f.id === selecionado)) selecionado = visiveis[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    ...[['abertos', 'Em aberto'], ['receber', 'A receber'], ['propostas', 'Propostas'], ['todos', 'Todos']].map(([k, rot]) =>
      el('button', {
        class: `chip ${filtro === k ? 'on' : ''}`, text: rot,
        onclick: () => { filtro = k; emit('nav:refresh'); },
      })),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Analisar com JARBAS', onclick: analisar }),
    el('button', { class: 'btn primary sm', text: '+ Freela', onclick: () => editar() }),
  ));

  root.append(el('div', { class: 'grid dash-stats' }, ...indicadores(todos)));

  if (!todos.length) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhum freela registrado ainda.', 'Registrar o primeiro', () => editar())));
    return;
  }

  root.append(el('div', { class: 'grid compras-grid' },
    cardLista(visiveis),
    selecionado ? cardDetalhe(store.get('freelas', selecionado)) : el('div', { class: 'card' }, emptyState('Selecione um freela.')),
  ));
}

/* ---------- números do topo ---------- */

/**
 * O topo responde "quem me deve" — e por isso proposta fica de fora da conta.
 * Orçamento enviado não é dinheiro a receber: somá-lo ao total faz o quadro
 * prometer um caixa que ninguém aprovou. Propostas ganham quadro próprio.
 */
function indicadores(todos) {
  const receber = store.freelasAReceber();
  const vencidos = store.freelasAtrasadas();
  const propostas = store.freelasEmProposta();
  const t = today();

  const emAndamento = todos.filter((f) => ['em andamento', 'fechado'].includes(store.freelaStatus(f)));
  const comEntrega = emAndamento.filter((f) => f.entregaEm && f.entregaEm >= t);
  const recebidoNoMes = todos.filter((f) => f.pago && (f.pagoEm ?? '').slice(0, 7) === t.slice(0, 7));

  /*
   * O que entra em destaque é o dinheiro deste mês — o que decide se a conta
   * fecha agora. O que vence lá na frente, o que ainda não tem data e o que já
   * caiu na conta continuam à vista, em corpo pequeno: são registro, não
   * cobrança, e em corpo grande roubariam a atenção da única cifra que pede
   * ação hoje.
   *
   * "Até o fim do mês" e não "dentro do mês": o que venceu em julho e não foi
   * pago continua sendo dinheiro que devia estar aqui agora, e some se a conta
   * olhar só para agosto. O quadro Atrasado, ao lado, marca essa parte.
   *
   * Compara texto com texto: as datas são ISO (AAAA-MM-DD) e nenhum dia passa
   * de 31, então `<= '2026-08-31'` é o fim de agosto sem calendário nenhum.
   */
  const fimDoMes = `${t.slice(0, 7)}-31`;
  const valor = (f) => Number(f.valor) || 0;
  const doMes = receber.filter((f) => f.pagaEm && f.pagaEm <= fimDoMes);
  const outrosMeses = receber.filter((f) => f.pagaEm && f.pagaEm > fimDoMes);
  const semData = receber.filter((f) => !f.pagaEm);

  const plural = (n, palavra) => `${n} ${palavra}${n === 1 ? '' : 's'}`;

  // As linhas de registro ficam atrás de um fio, separadas da legenda do número
  // grande. Sem o fio, quatro linhas do mesmo tamanho parecem quatro versões da
  // mesma frase; com ele, dá para ver de relance onde termina a explicação do
  // destaque e começa o que é só arquivo.
  const registro = [
    outrosMeses.length ? `Meses seguintes · ${money(sum(outrosMeses, valor))} em ${plural(outrosMeses.length, 'trabalho')}` : null,
    semData.length ? `Sem data de pagamento · ${money(sum(semData, valor))} em ${plural(semData.length, 'trabalho')}` : null,
    recebidoNoMes.length ? `Já recebido no mês · ${money(sum(recebidoNoMes, valor))} em ${plural(recebidoNoMes.length, 'pagamento')}` : null,
  ].filter(Boolean);

  const tiles = [
    statTile({
      label: `A receber em ${nomeDoMes(t)}`,
      value: money(sum(doMes, valor)),
      sub: [
        doMes.length
          ? `${plural(doMes.length, 'trabalho')} com vencimento até o fim do mês`
          : 'nada vencendo neste mês',
        registro.length
          ? el('div', { class: 'stat-notas' }, ...registro.map((linha) => el('div', { class: 'stat-sub', text: linha })))
          : null,
      ],
    }),
    statTile({
      label: 'Atrasado',
      value: money(sum(vencidos, (f) => Number(f.valor) || 0)),
      tone: vencidos.length ? 'bad' : '',
      sub: vencidos.length ? `${vencidos.length} vencido(s) — cobre` : 'nada vencido',
    }),
    statTile({
      label: 'Em andamento',
      value: String(emAndamento.length),
      sub: comEntrega.length
        ? `${comEntrega.length} com entrega marcada`
        : emAndamento.length ? 'sem data de entrega' : 'nada em produção',
    }),
  ];

  // Some quando não há proposta pendente: quadro zerado é ruído com cara de dado.
  if (propostas.length) {
    tiles.splice(1, 0, statTile({
      label: 'Em proposta',
      value: money(sum(propostas, (f) => Number(f.valor) || 0)),
      sub: `${propostas.length} aguardando resposta`,
    }));
  }
  return tiles;
}

const nomeDoMes = (data) => {
  const m = monthName(parseDate(data).getMonth());
  return `${m[0].toUpperCase()}${m.slice(1)}`;
};

/* ---------- lista ---------- */

function ordenar(a, b) {
  // não pago primeiro, depois pelo que vence antes
  if (!!a.pago !== !!b.pago) return a.pago ? 1 : -1;
  return (a.pagaEm || '9999').localeCompare(b.pagaEm || '9999');
}

function cardLista(lista) {
  const body = el('div', { class: 'list-plain' });
  if (!lista.length) body.append(emptyState('Nada neste filtro.'));

  const t = today();
  for (const f of lista) {
    const vencido = !f.pago && f.pagaEm && f.pagaEm < t;
    body.append(el('div', {
      class: `lp-row clickable ${f.id === selecionado ? 'sel' : ''}`,
      onclick: () => { selecionado = f.id; emit('nav:refresh'); },
    },
      el('div', { class: 'lp-main' },
        el('div', { text: f.title || 'Sem título' }),
        el('div', { class: 'tiny dim', text: [f.client, f.role].filter(Boolean).join(' · ') || '—' }),
      ),
      el('div', { style: 'text-align:right' },
        el('div', { class: 'mono', text: money(Number(f.valor) || 0) }),
        el('div', {
          class: `tiny ${f.pago ? 'ok' : vencido ? 'bad' : 'dim'}`,
          text: f.pago ? 'pago' : f.pagaEm ? relDay(f.pagaEm) : (f.status ?? 'proposta'),
        }),
      ),
    ));
  }

  return sectionCard(rotuloDaLista(lista.length), null, body);
}

/**
 * O título diz qual recorte está na tela e quantos existem ao todo. "Freelas ·
 * 4" com o filtro ligado se lê como "eu tenho 4 freelas", e não é isso que a
 * tela está mostrando.
 */
function rotuloDaLista(visiveis) {
  const total = store.list('freelas').length;
  const nome = { abertos: 'Em aberto', receber: 'A receber', propostas: 'Propostas', todos: 'Todos' }[filtro];
  return visiveis === total ? `Freelas · ${total}` : `${nome} · ${visiveis} de ${total}`;
}

/* ---------- detalhe ---------- */

function cardDetalhe(f) {
  if (!f) return el('div', { class: 'card' }, emptyState('Freela não encontrado.'));
  const t = today();
  const vencido = !f.pago && f.pagaEm && f.pagaEm < t;

  const linhas = [
    ['Cliente', f.client],
    ['Minha função', f.role],
    ['Situação', f.status ?? 'proposta'],
    ['Valor', money(Number(f.valor) || 0)],
    ['Como paga', f.comoPaga],
    ['Entrega', f.entregaEm ? `${fmtDate(f.entregaEm)} · ${relDay(f.entregaEm)}` : null],
    ['Paga em', f.pagaEm ? `${fmtDate(f.pagaEm)} · ${relDay(f.pagaEm)}` : null],
    ['Contato', f.contato],
  ].filter(([, v]) => v);

  const corpo = el('div');
  for (const [rotulo, valor] of linhas) {
    corpo.append(el('div', { class: 'lp-row' },
      el('div', { class: 'tiny dim', style: 'min-width:110px', text: rotulo }),
      el('div', { class: 'lp-main', text: String(valor) }),
    ));
  }
  if (f.notes) {
    corpo.append(el('div', { class: 'tiny dim', style: 'margin:14px 0 4px', text: 'Anotações' }));
    corpo.append(el('p', { style: 'margin:0;white-space:pre-wrap', text: f.notes }));
  }

  const pagamento = el('div', { class: `signal ${f.pago ? 'info' : vencido ? 'bad' : 'warn'}`, style: 'margin-top:14px' },
    el('span', { class: 'signal-kind', text: 'pagamento' }),
    el('div', {
      text: f.pago
        ? `Recebido${f.pagoEm ? ` em ${fmtDate(f.pagoEm)}` : ''}.`
        : vencido ? `Deveria ter caído em ${fmtDate(f.pagaEm)}. Cobre.`
          : f.pagaEm ? `Previsto para ${fmtDate(f.pagaEm)}.` : 'Sem data de pagamento combinada.',
    }),
  );

  return sectionCard(f.title || 'Sem título', [
    el('button', {
      class: `btn sm ${f.pago ? '' : 'primary'}`,
      text: f.pago ? 'Desmarcar pago' : '✓ Marcar como pago',
      onclick: () => alternarPago(f),
    }),
    el('button', { class: 'btn sm', text: 'Editar', onclick: () => editar(f) }),
    el('button', { class: 'btn sm danger', text: 'Excluir', onclick: () => excluir(f) }),
  ], corpo, pagamento);
}

/* ---------- ações ---------- */

/**
 * Marcar como pago também lança a entrada no financeiro — é o mesmo dinheiro,
 * e digitar duas vezes é como o saldo começa a mentir.
 */
async function alternarPago(f) {
  if (f.pago) {
    await store.save('freelas', { id: f.id, pago: false, pagoEm: null, transactionId: null });
    if (f.transactionId) await store.remove('transactions', f.transactionId);
    toast('Pagamento desmarcado.');
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
    values: { quando: today(), valor: String(f.valor ?? ''), conta: contas[0]?.id, lancar: true },
  });
  if (!v) return;

  const valor = parseMoney(v.valor) || Number(f.valor) || 0;
  let transactionId = null;
  if (v.lancar && valor > 0) {
    const tx = await store.save('transactions', {
      desc: `Freela — ${f.title || 'sem título'}${f.client ? ` (${f.client})` : ''}`,
      amount: valor, type: 'in', date: v.quando, category: 'salário', accountId: v.conta,
    });
    transactionId = tx.id;
  }
  await store.save('freelas', { id: f.id, pago: true, pagoEm: v.quando, valor, transactionId });
  toast(v.lancar ? 'Recebido e lançado no financeiro.' : 'Marcado como recebido.');
  emit('nav:refresh');
}

async function editar(f = null) {
  const v = await formModal({
    title: f ? 'Editar freela' : 'Novo freela',
    wide: true,
    fields: [
      { name: 'title', label: 'O trabalho', type: 'text', placeholder: 'ex.: Vídeo institucional — 3 peças' },
      { name: 'client', label: 'Para quem', type: 'text', placeholder: 'cliente ou produtora', inline: true },
      { name: 'role', label: 'Minha função', type: 'text', placeholder: 'ex.: roteiro e apresentação', inline: true },
      { name: 'status', label: 'Situação', type: 'select', options: SITUACOES.map((s) => [s, s]), inline: true },
      { name: 'valor', label: 'Quanto paga (R$)', type: 'text', inline: true },
      { name: 'comoPaga', label: 'Como paga', type: 'text', placeholder: 'ex.: 50% na assinatura, 50% na entrega', inline: true },
      { name: 'entregaEm', label: 'Entrega', type: 'date', inline: true },
      { name: 'pagaEm', label: 'Paga em', type: 'date', inline: true },
      { name: 'contato', label: 'Contato', type: 'text', placeholder: 'quem cobrar quando atrasar', inline: true },
      { name: 'notes', label: 'Anotações', type: 'textarea' },
    ],
    values: f ?? { status: 'proposta', entregaEm: addDays(today(), 7) },
  });
  if (!v) return;

  const salvo = await store.save('freelas', {
    id: f?.id,
    title: v.title, client: v.client, role: v.role, status: v.status,
    valor: parseMoney(v.valor) || 0, comoPaga: v.comoPaga,
    entregaEm: v.entregaEm || null, pagaEm: v.pagaEm || null,
    contato: v.contato, notes: v.notes,
    pago: f?.pago ?? false, pagoEm: f?.pagoEm ?? null, transactionId: f?.transactionId ?? null,
  });
  selecionado = salvo.id;
  emit('nav:refresh');
}

async function excluir(f) {
  if (!await confirmDialog(`Excluir "${f.title || 'este freela'}"?`)) return;
  await store.remove('freelas', f.id);
  selecionado = null;
  emit('nav:refresh');
}

function analisar() {
  jarbas.askFrom(
    'Olhe meus freelas: o que está a receber, o que já venceu e quem eu preciso cobrar. '
    + 'Diga também se tem algo com entrega chegando que eu ainda não fechei.');
}
