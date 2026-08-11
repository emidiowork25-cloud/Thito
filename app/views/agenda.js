// Agenda — calendário mensal, dia selecionado e lista de tarefas.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import {
  el, today, isoDate, parseDate, addDays, addMonths, daysInMonth, monthName,
  fmtDate, fmtTime, relDay, weekdayName,
} from '../core/util.js';
import { sectionCard, emptyState, proximoCompromisso, formModal, confirmDialog, toast } from '../ui/components.js';

let cursor = today();     // mês exibido
let selected = today();   // dia selecionado

export function render(root, params = {}) {
  if (params.date) { selected = params.date; cursor = params.date; }
  if (params.id) {
    const ev = store.get('events', params.id);
    if (ev?.date) { selected = ev.date; cursor = ev.date; }
  }

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn sm', text: '‹', onclick: () => { cursor = addMonths(cursor, -1); emit('nav:refresh'); } }),
    el('strong', { style: 'min-width:170px;text-align:center', text: tituloMes() }),
    el('button', { class: 'btn sm', text: '›', onclick: () => { cursor = addMonths(cursor, 1); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: 'Hoje', onclick: () => { cursor = today(); selected = today(); emit('nav:refresh'); } }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Planejar semana com JARBAS', onclick: planejarSemana }),
    el('button', { class: 'btn sm', text: '+ Tarefa', onclick: () => editarTarefa() }),
    el('button', { class: 'btn primary sm', text: '+ Compromisso', onclick: () => editarEvento() }),
  ));

  root.append(el('div', { class: 'grid agenda-grid' },
    calendario(),
    el('div', { class: 'grid', style: 'align-content:start' }, painelDia(), painelTarefas())));
}

const tituloMes = () => {
  const d = parseDate(cursor);
  const m = monthName(d.getMonth());
  // só a inicial do mês sobe: 'capitalize' no CSS viraria "Agosto De 2026".
  return `${m[0].toUpperCase()}${m.slice(1)} de ${d.getFullYear()}`;
};

/* ---------- calendário ---------- */

function calendario() {
  const d = parseDate(cursor);
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const primeiro = new Date(ano, mes, 1);
  const inicio = addDays(isoDate(primeiro), -primeiro.getDay());
  const total = 42; // 6 semanas — grade estável

  const grade = el('div', { class: 'cal' });
  for (const dia of ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']) {
    grade.append(el('div', { class: 'cal-head', text: dia }));
  }

  const fim = addDays(inicio, total - 1);
  const eventos = store.agendaBetween(inicio, fim);
  const porDia = {};
  for (const e of eventos) (porDia[e.occurrence] ||= []).push(e);

  const tarefas = {};
  for (const t of store.openTasks()) if (t.due) (tarefas[t.due] ||= []).push(t);

  for (let i = 0; i < total; i++) {
    const data = addDays(inicio, i);
    const dd = parseDate(data);
    const doMes = dd.getMonth() === mes;
    const evs = porDia[data] ?? [];
    const tks = tarefas[data] ?? [];

    const cell = el('button', {
      class: `cal-day ${doMes ? '' : 'out'} ${data === today() ? 'today' : ''} ${data === selected ? 'sel' : ''}`,
      onclick: () => { selected = data; emit('nav:refresh'); },
    },
    el('span', { class: 'cal-num', text: String(dd.getDate()) }),
    el('div', { class: 'cal-dots' },
      ...evs.slice(0, 4).map((e) => el('span', { class: `dot cat-${e.category || 'outro'}`, title: e.title })),
      ...tks.slice(0, 2).map(() => el('span', { class: 'dot task' })),
    ));
    if (evs.length + tks.length > 6) cell.append(el('span', { class: 'cal-more tiny', text: `+${evs.length + tks.length - 6}` }));
    grade.append(cell);
  }

  return el('div', { class: 'card' }, grade, legenda());
}

function legenda() {
  const cats = ['trabalho', 'pessoal', 'estudo', 'saúde', 'financeiro', 'outro'];
  return el('div', { class: 'cal-legend' },
    ...cats.map((c) => el('span', { class: 'legend-item' },
      el('span', { class: `dot cat-${c}` }), el('span', { class: 'tiny dim', text: c }))),
    el('span', { class: 'legend-item' }, el('span', { class: 'dot task' }), el('span', { class: 'tiny dim', text: 'tarefa' })));
}

/* ---------- painel do dia ---------- */

function painelDia() {
  const evs = store.agendaOn(selected);
  const body = el('div', { class: 'timeline' });

  // Dia vazio não termina a conversa: mostra o que vem depois dele, com um
  // clique para pular direto para lá.
  if (!evs.length) {
    body.append(emptyState('Nada marcado neste dia.', '+ Compromisso', () => editarEvento({ date: selected })));
    const prox = store.nextEventAfter(selected);
    const bloco = proximoCompromisso(prox, {
      relDay,
      fmtDate,
      fmtTime,
      onOpen: (data, ev) => { if (ev?.virtual) return emit('nav:go', { view: ev.origem.view, id: ev.origem.id }); selected = data; cursor = data; emit('nav:refresh'); },
    });
    if (bloco) body.append(bloco);
  }

  for (const e of evs) {
    // Compromisso vindo de outro módulo não se edita aqui: clicar abre o dono,
    // onde estão o valor, o cliente e o resto que a agenda não guarda.
    body.append(el('div', {
      class: `tl-row clickable ${e.virtual ? 'derivado' : ''}`,
      title: e.virtual ? `Vem do módulo ${e.origem.view === 'freela' ? 'Freela' : 'Eventos'} — clique para abrir lá` : '',
      onclick: () => (e.virtual ? emit('nav:go', { view: e.origem.view, id: e.origem.id }) : editarEvento(e)),
    },
    el('div', { class: 'tl-time mono', text: e.time ? fmtTime(e.time) : e.virtual ? '↗' : '—' }),
    el('div', { class: 'tl-body' },
      el('div', { class: 'tl-title', text: e.title }),
      el('div', { class: 'tiny dim', text: [e.endTime ? `até ${fmtTime(e.endTime)}` : '', e.recur ? `repete ${e.recur}` : '', e.notes].filter(Boolean).join(' · ') })),
    e.category ? el('span', { class: `pill cat-${e.category}`, text: e.category }) : null));
  }

  const titulo = `${weekdayName(selected)}, ${fmtDate(selected, { year: true })}`;
  return sectionCard(titulo, [
    el('button', { class: 'btn sm', text: '+', title: 'Novo compromisso neste dia', onclick: () => editarEvento({ date: selected }) }),
  ], body);
}

/* ---------- tarefas ---------- */

function painelTarefas() {
  const abertas = store.openTasks();
  const concluidas = store.list('tasks', (t) => t.done)
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 5);

  const body = el('div', { class: 'list-plain' });
  if (!abertas.length) body.append(emptyState('Sem pendências. Respire.'));

  for (const t of abertas) {
    const atrasada = t.due && t.due < today();
    body.append(el('div', { class: 'task-row' },
      el('input', {
        type: 'checkbox',
        onchange: async () => {
          await store.save('tasks', { id: t.id, done: true, doneAt: today() });
          emit('nav:refresh');
        },
      }),
      el('div', { class: 'task-main', onclick: () => editarTarefa(t) },
        el('div', { text: t.title }),
        el('div', { class: 'tiny dim', text: t.due ? `prazo ${fmtDate(t.due)} · ${relDay(t.due)}` : 'sem prazo' })),
      t.priority === 'alta' ? el('span', { class: 'pill bad', text: 'alta' }) : null,
      atrasada ? el('span', { class: 'pill warn', text: 'atrasada' }) : null));
  }

  if (concluidas.length) {
    body.append(el('div', { class: 'tiny dim', style: 'margin-top:14px', text: 'Concluídas recentemente' }));
    for (const t of concluidas) {
      body.append(el('div', { class: 'task-row done' },
        el('input', {
          type: 'checkbox', checked: true,
          onchange: async () => { await store.save('tasks', { id: t.id, done: false, doneAt: '' }); emit('nav:refresh'); },
        }),
        el('div', { class: 'task-main' }, el('div', { text: t.title }))));
    }
  }

  return sectionCard('Tarefas', [
    el('button', { class: 'btn sm', text: '+', onclick: () => editarTarefa() }),
  ], body);
}

/* ---------- edição ---------- */

async function editarEvento(ev = {}) {
  const novo = !ev.id;
  const valores = await formModal({
    title: novo ? 'Novo compromisso' : 'Editar compromisso',
    okLabel: novo ? 'Criar' : 'Salvar',
    values: {
      titulo: ev.title ?? '',
      data: ev.date ?? selected,
      hora: ev.time ?? '',
      hora_fim: ev.endTime ?? '',
      categoria: ev.category ?? 'trabalho',
      recorrencia: ev.recur ?? '',
      notas: ev.notes ?? '',
    },
    fields: [
      { name: 'titulo', label: 'Título', required: true, placeholder: 'Reunião de alinhamento' },
      { name: 'data', label: 'Data', type: 'date', inline: true },
      { name: 'hora', label: 'Início', type: 'time', inline: true },
      { name: 'hora_fim', label: 'Fim', type: 'time', inline: true },
      { name: 'categoria', label: 'Categoria', type: 'select', options: store.CATEGORIES_EVENT, inline: true },
      {
        name: 'recorrencia', label: 'Repetir', type: 'select', inline: true,
        options: [['', 'não repete'], ['diario', 'diariamente'], ['semanal', 'semanalmente'],
          ['quinzenal', 'quinzenalmente'], ['mensal', 'mensalmente'], ['anual', 'anualmente']],
      },
      { name: 'notas', label: 'Notas', type: 'textarea', rows: 3, placeholder: 'Local, link da chamada, pauta…' },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => {
          close();
          if (await confirmDialog(`Excluir "${ev.title}"?`, { danger: true, okLabel: 'Excluir' })) {
            await store.remove('events', ev.id);
            toast('Compromisso excluído.');
            emit('nav:refresh');
          }
        },
      }),
    ],
  });
  if (!valores) return;
  if (!valores.titulo?.trim()) { toast('O título é obrigatório.', 'err'); return; }

  await store.save('events', {
    id: ev.id,
    title: valores.titulo.trim(),
    date: valores.data || today(),
    time: valores.hora,
    endTime: valores.hora_fim,
    category: valores.categoria,
    recur: valores.recorrencia || null,
    notes: valores.notas,
  });
  toast(novo ? 'Compromisso criado.' : 'Compromisso atualizado.', 'ok');
  emit('nav:refresh');
}

async function editarTarefa(t = {}) {
  const novo = !t.id;
  const valores = await formModal({
    title: novo ? 'Nova tarefa' : 'Editar tarefa',
    okLabel: novo ? 'Criar' : 'Salvar',
    values: { titulo: t.title ?? '', prazo: t.due ?? '', prioridade: t.priority ?? 'normal', notas: t.notes ?? '' },
    fields: [
      { name: 'titulo', label: 'Tarefa', required: true },
      { name: 'prazo', label: 'Prazo', type: 'date', inline: true },
      { name: 'prioridade', label: 'Prioridade', type: 'select', options: ['baixa', 'normal', 'alta'], inline: true },
      { name: 'notas', label: 'Notas', type: 'textarea', rows: 3 },
    ],
    extraButtons: novo ? null : (close) => [
      el('button', {
        class: 'btn danger', text: 'Excluir',
        onclick: async () => { close(); await store.remove('tasks', t.id); toast('Tarefa excluída.'); emit('nav:refresh'); },
      }),
    ],
  });
  if (!valores?.titulo?.trim()) return;

  await store.save('tasks', {
    id: t.id,
    title: valores.titulo.trim(),
    due: valores.prazo,
    priority: valores.prioridade,
    notes: valores.notas,
    done: t.done ?? false,
  });
  toast(novo ? 'Tarefa criada.' : 'Tarefa atualizada.', 'ok');
  emit('nav:refresh');
}

function planejarSemana() {
  jarbas.askFrom(
    'Olhe minha agenda dos próximos 7 dias e minhas tarefas abertas. Monte um plano de semana: '
    + 'em que dia eu encaixo cada tarefa, considerando os compromissos que já existem e os prazos. '
    + 'Não crie nada ainda — me mostre o plano primeiro, em lista, e pergunte se pode agendar.',
  );
}

/* ---------- atalhos da paleta ---------- */

on('action:new-event', () => editarEvento({ date: selected }));
on('action:new-task', () => editarTarefa());
