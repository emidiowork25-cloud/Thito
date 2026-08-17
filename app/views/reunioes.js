// Reuniões — anotações estruturadas, decisões e encaminhamentos rastreáveis.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import { el, today, uid, fmtDate, relDay, truncate, download } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, toast } from '../ui/components.js';

let ativa = null;

export function render(root, params = {}) {
  const reunioes = store.list('meetings').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (params.id) ativa = params.id;
  if (!reunioes.some((m) => m.id === ativa)) ativa = reunioes[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '+ Reunião', onclick: () => novaReuniao() }),
    el('button', { class: 'btn sm', text: 'Transcrever por voz', onclick: transcrever }),
    el('div', { class: 'spacer' }),
    el('span', { class: 'tiny dim', text: `${store.openActionItems().length} encaminhamento(s) aberto(s)` }),
  ));

  root.append(el('div', { class: 'grid reuniao-grid' },
    listaReunioes(reunioes),
    ativa ? detalhe(store.get('meetings', ativa)) : el('div', { class: 'card' },
      emptyState('Nenhuma reunião registrada. Anote a próxima — ou dite para o JARBAS enquanto ela acontece.',
        'Registrar reunião', () => novaReuniao()))));
}

/* ---------- lista ---------- */

function listaReunioes(reunioes) {
  const body = el('div', { class: 'list-plain' });
  if (!reunioes.length) body.append(el('div', { class: 'empty', text: 'Nada aqui ainda.' }));
  for (const m of reunioes) {
    const abertos = (m.actions ?? []).filter((a) => !a.done).length;
    body.append(el('div', {
      class: `lp-row clickable ${m.id === ativa ? 'sel' : ''}`,
      onclick: () => { ativa = m.id; emit('nav:refresh'); },
    },
    el('div', { class: 'lp-main' },
      el('div', { text: truncate(m.title, 40) }),
      el('div', { class: 'tiny dim', text: fmtDate(m.date, { year: true }) })),
    abertos ? el('span', { class: 'pill warn', text: String(abertos) }) : null));
  }
  return sectionCard('Histórico', null, body);
}

/* ---------- detalhe ---------- */

function detalhe(m) {
  if (!m) return el('div', { class: 'card' }, emptyState('Reunião não encontrada.'));

  const body = el('div');

  const participantes = Array.isArray(m.participants) ? m.participants : (m.participants ? [m.participants] : []);
  body.append(el('div', { class: 'meta-row' },
    el('span', { class: 'pill', text: fmtDate(m.date, { weekday: true, year: true }) }),
    ...participantes.map((p) => el('span', { class: 'pill cy', text: p })),
  ));

  body.append(campoTexto('Pauta', m.agenda, (v) => salvar(m, { agenda: v }), 3));
  body.append(campoTexto('Anotações', m.notes, (v) => salvar(m, { notes: v }), 8));
  body.append(campoTexto('Decisões', m.decisions, (v) => salvar(m, { decisions: v }), 4));

  /* encaminhamentos */
  body.append(el('div', { class: 'tiny dim', style: 'margin:16px 0 8px;letter-spacing:.1em;text-transform:uppercase', text: 'Encaminhamentos' }));
  const acoes = el('div', { class: 'list-plain' });
  if (!(m.actions ?? []).length) acoes.append(el('div', { class: 'empty', text: 'Nenhum encaminhamento.' }));
  for (const a of m.actions ?? []) {
    acoes.append(el('div', { class: `task-row ${a.done ? 'done' : ''}` },
      el('input', {
        type: 'checkbox', checked: a.done,
        onchange: async (e) => {
          const actions = m.actions.map((x) => (x.id === a.id ? { ...x, done: e.target.checked } : x));
          await store.save('meetings', { id: m.id, actions });
          emit('nav:refresh');
        },
      }),
      el('div', { class: 'task-main', onclick: () => editarAcao(m, a) },
        el('div', { text: a.text }),
        el('div', { class: 'tiny dim', text: [a.owner, a.due ? `prazo ${fmtDate(a.due)} (${relDay(a.due)})` : ''].filter(Boolean).join(' · ') })),
      el('button', {
        class: 'icon-btn sm', text: '✕',
        onclick: async (e) => {
          e.stopPropagation();
          await store.save('meetings', { id: m.id, actions: m.actions.filter((x) => x.id !== a.id) });
          emit('nav:refresh');
        },
      })));
  }
  body.append(acoes);
  body.append(el('button', { class: 'btn sm', style: 'margin-top:8px', text: '+ Encaminhamento', onclick: () => editarAcao(m) }));

  const acoesCard = [
    el('button', { class: 'btn sm', text: 'Editar', onclick: () => novaReuniao(m) }),
    el('button', { class: 'btn sm', text: 'Resumir', onclick: () => resumir(m) }),
    el('button', { class: 'btn sm', text: 'Virar mapa mental', onclick: () => virarMapa(m) }),
    el('button', { class: 'btn sm', text: 'Exportar', onclick: () => exportar(m) }),
  ];

  return sectionCard(m.title, acoesCard, body);
}

/** Campo de texto que salva ao perder o foco — sem botão de salvar. */
function campoTexto(label, valor, onSave, rows) {
  const ta = el('textarea', { rows, onchange: (e) => onSave(e.target.value) });
  ta.value = valor ?? '';
  return el('div', { class: 'field' }, el('label', { text: label }), ta);
}

const salvar = (m, patch) => store.save('meetings', { id: m.id, ...patch });

/* ---------- edição ---------- */

async function novaReuniao(m = {}) {
  const novo = !m.id;
  const participantes = Array.isArray(m.participants) ? m.participants.join(', ') : (m.participants ?? '');
  const v = await formModal({
    title: novo ? 'Nova reunião' : 'Editar reunião',
    values: { titulo: m.title ?? '', data: m.date ?? today(), participantes, pauta: m.agenda ?? '' },
    fields: [
      { name: 'titulo', label: 'Título', required: true, placeholder: 'Alinhamento semanal — time de produto' },
      { name: 'data', label: 'Data', type: 'date', inline: true },
      { name: 'participantes', label: 'Participantes', inline: true, placeholder: 'separe por vírgula' },
      { name: 'pauta', label: 'Pauta', type: 'textarea', rows: 3 },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => {
          close();
          if (await confirmDialog(`Excluir a reunião "${m.title}"?`, { danger: true, okLabel: 'Excluir' })) {
            await store.remove('meetings', m.id);
            ativa = null;
            emit('nav:refresh');
          }
        },
      }),
    ],
  });
  if (!v?.titulo?.trim()) return;

  const salva = await store.save('meetings', {
    id: m.id,
    title: v.titulo.trim(),
    date: v.data || today(),
    participants: v.participantes.split(',').map((s) => s.trim()).filter(Boolean),
    agenda: v.pauta,
    notes: m.notes ?? '',
    decisions: m.decisions ?? '',
    actions: m.actions ?? [],
  });
  ativa = salva.id;
  emit('nav:refresh');
}

async function editarAcao(m, a = {}) {
  const v = await formModal({
    title: a.id ? 'Editar encaminhamento' : 'Novo encaminhamento',
    values: { texto: a.text ?? '', responsavel: a.owner ?? '', prazo: a.due ?? '' },
    fields: [
      { name: 'texto', label: 'O que ficou combinado', required: true },
      { name: 'responsavel', label: 'Responsável', inline: true },
      { name: 'prazo', label: 'Prazo', type: 'date', inline: true },
    ],
  });
  if (!v?.texto?.trim()) return;

  const atual = m.actions ?? [];
  const nova = { id: a.id ?? uid(), text: v.texto.trim(), owner: v.responsavel, due: v.prazo, done: a.done ?? false };
  const actions = a.id ? atual.map((x) => (x.id === a.id ? nova : x)) : [...atual, nova];
  await store.save('meetings', { id: m.id, actions });
  emit('nav:refresh');
}

/* ---------- integrações com o JARBAS ---------- */

function transcrever() {
  jarbas.open({ focus: false });
  jarbas.startListening();
  toast('Escuta ligada. Diga "Jarbas, registre a reunião…" e vá narrando.', 'ok', 6000);
}

function resumir(m) {
  jarbas.askFrom(
    `Resuma a reunião "${m.title}" de ${m.date} a partir das minhas anotações. `
    + 'Devolva: 3 linhas de resumo, as decisões em tópicos e os encaminhamentos com responsável e prazo. '
    + 'Se identificar encaminhamentos que ainda não registrei, me pergunte se quer que eu adicione.',
  );
}

/**
 * A reunião inteira em texto: pauta, anotações, decisões e encaminhamentos.
 *
 * Uma função só, usada pelo Exportar e pelo mapa mental. Assim o que o JARBAS
 * lê é literalmente o mesmo que sai no arquivo — se um dia um campo novo entrar
 * na reunião, os dois passam a enxergá-lo no mesmo dia.
 */
function ataEmTexto(m) {
  const participantes = Array.isArray(m.participants) ? m.participants.join(', ') : (m.participants ?? '');
  return [
    `# ${m.title}`,
    `Data: ${fmtDate(m.date, { weekday: true, year: true })}`,
    participantes ? `Participantes: ${participantes}` : '',
    '',
    m.agenda ? `## Pauta\n${m.agenda}\n` : '',
    m.notes ? `## Anotações\n${m.notes}\n` : '',
    m.decisions ? `## Decisões\n${m.decisions}\n` : '',
    (m.actions ?? []).length
      ? `## Encaminhamentos\n${m.actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (prazo ${a.due})` : ''}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}

/** Tem conteúdo de verdade, ou é só título e data? */
const temTexto = (m) => !!(m.agenda?.trim() || m.notes?.trim() || m.decisions?.trim() || (m.actions ?? []).length);

function exportar(m) {
  download(`reuniao-${m.date}-${m.title.replace(/[^\w-]+/g, '-').toLowerCase()}.md`, ataEmTexto(m), 'text/markdown');
  toast('Ata exportada em Markdown.', 'ok');
}

/**
 * A reunião vira mapa mental.
 *
 * O texto vai JUNTO na pergunta, e não por referência. O contexto que o JARBAS
 * recebe de graça a cada conversa traz, das reuniões, só os encaminhamentos em
 * aberto — nada da pauta, nada das anotações, nada das decisões. Pedir
 * "transforme a reunião X em mapa" sem mandar o texto seria pedir o mapa de uma
 * reunião que ele nunca leu, e o que voltaria seria invenção com cara de ata.
 *
 * Por isso também a instrução de não inventar tópico: o mapa de uma reunião vale
 * pelo que foi dito nela. Um ramo bonito que ninguém falou é ruído com aparência
 * de memória, e daqui a um mês não há como saber qual é qual.
 */
function virarMapa(m) {
  if (!temTexto(m)) {
    toast('Esta reunião ainda não tem texto. Escreva as anotações ou transcreva por voz primeiro.', 'warn', 5000);
    return;
  }

  jarbas.askFrom([
    'Transforme esta reunião em um mapa mental, usando a ferramenta criar_mindmap.',
    '',
    'Leia TODO o texto abaixo — pauta, anotações, decisões e encaminhamentos — e monte',
    'a estrutura a partir do que está escrito. Não invente tópico que não esteja lá.',
    '',
    'Como quero o mapa:',
    `- o nó central é "${m.title}";`,
    '- os ramos principais são os ASSUNTOS que o texto realmente trata, juntando as',
    '  linhas soltas que falam da mesma coisa — não um ramo por linha;',
    '- abaixo de cada assunto, os pontos concretos: nomes, números, prazos e dúvidas,',
    '  no vocabulário que eu usei;',
    '- decisões e encaminhamentos ganham ramo próprio, com responsável e prazo quando houver;',
    '- rótulos curtos, de preferência até 5 palavras;',
    '- três níveis costumam bastar; use o quarto só quando o assunto pedir.',
    '',
    `Título do mapa: "${m.title}".`,
    '',
    '--- TEXTO DA REUNIÃO ---',
    ataEmTexto(m),
  ].join('\n'));
}

on('action:new-meeting', () => novaReuniao());
