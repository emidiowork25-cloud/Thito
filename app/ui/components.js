// Componentes de interface reutilizáveis: toast, modal, confirmação e formulário.

import { $, el } from '../core/util.js';

/* ---------- toast ---------- */

export function toast(message, kind = '', ms = 3800) {
  const node = el('div', { class: `toast ${kind}`, text: message });
  $('#toast-root').append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}

/* ---------- modal ---------- */

/**
 * Abre um modal. `render(close)` devolve o conteúdo do corpo.
 * Retorna { close, root }.
 */
export function modal({ title, render, footer, wide = false, onClose }) {
  const back = el('div', { class: 'modal-back' });
  const box = el('div', { class: `modal ${wide ? 'wide' : ''}` });

  const close = (result) => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.(result);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const head = el('div', { class: 'modal-head' },
    el('h3', { text: title ?? '' }),
    el('button', { class: 'icon-btn sm', text: '✕', onclick: () => close() }),
  );
  const body = el('div', { class: 'modal-body' });
  const content = render?.(close);
  if (content) body.append(content);

  box.append(head, body);
  if (footer) box.append(el('div', { class: 'modal-foot' }, ...footer(close)));

  back.append(box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  $('#modal-root').append(back);

  const firstField = box.querySelector('input, textarea, select');
  firstField?.focus();

  return { close, root: box, body };
}

export function confirmDialog(message, { title = 'Confirmar', danger = false, okLabel = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const settle = (v) => { if (!answered) { answered = true; resolve(v); } };
    const m = modal({
      title,
      render: () => el('p', { class: 'muted', text: message, style: 'margin:0' }),
      onClose: () => settle(false),
      footer: (close) => [
        el('button', { class: 'btn', text: 'Cancelar', onclick: () => { settle(false); close(); } }),
        el('button', {
          class: `btn ${danger ? 'danger' : 'primary'}`, text: okLabel,
          onclick: () => { settle(true); close(); },
        }),
      ],
    });
    m.root.querySelector('.btn.primary, .btn.danger')?.focus();
  });
}

/* ---------- formulário declarativo ---------- */

/**
 * Constrói um formulário a partir de uma lista de campos e devolve
 * { node, read() } — `read()` entrega um objeto com os valores atuais.
 *
 * Campo: { name, label, type, value, options, placeholder, hint, required, min, max, step, rows, width }
 */
export function form(fields, values = {}) {
  const inputs = {};
  const node = el('div');
  let rowBuffer = [];

  const flushRow = () => {
    if (!rowBuffer.length) return;
    node.append(rowBuffer.length === 1 ? rowBuffer[0] : el('div', { class: 'row' }, ...rowBuffer));
    rowBuffer = [];
  };

  for (const f of fields) {
    if (f.type === 'separator') {
      flushRow();
      node.append(el('div', { class: 'tiny dim', style: 'margin:16px 0 8px;letter-spacing:.1em;text-transform:uppercase', text: f.label }));
      continue;
    }

    const value = values[f.name] ?? f.value ?? '';
    let input;

    if (f.type === 'select') {
      input = el('select', { name: f.name },
        ...(f.options ?? []).map((o) => {
          const [val, text] = Array.isArray(o) ? o : [o, o];
          return el('option', { value: val, selected: String(val) === String(value) }, text);
        }));
    } else if (f.type === 'textarea') {
      input = el('textarea', { name: f.name, rows: f.rows ?? 4, placeholder: f.placeholder ?? '' });
      input.value = value;
    } else if (f.type === 'checkbox') {
      input = el('input', { type: 'checkbox', name: f.name });
      input.checked = !!value;
    } else {
      input = el('input', {
        type: f.type ?? 'text', name: f.name, placeholder: f.placeholder ?? '',
        min: f.min, max: f.max, step: f.step, required: f.required,
      });
      input.value = value;
    }

    inputs[f.name] = { input, type: f.type };

    const wrapper = f.type === 'checkbox'
      ? el('div', { class: 'field' },
        el('label', { style: 'display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)' },
          input, f.label))
      : el('div', { class: 'field' }, el('label', { text: f.label }), input);

    if (f.hint) wrapper.append(el('div', { class: 'hint', text: f.hint }));

    if (f.inline) rowBuffer.push(wrapper);
    else { flushRow(); node.append(wrapper); }
  }
  flushRow();

  const read = () => {
    const out = {};
    for (const [name, { input, type }] of Object.entries(inputs)) {
      if (type === 'checkbox') out[name] = input.checked;
      else if (type === 'number') out[name] = input.value === '' ? null : Number(input.value);
      else out[name] = input.value;
    }
    return out;
  };

  return { node, read, inputs };
}

/** Modal com formulário e botão de salvar. Resolve com os valores ou null. */
export function formModal({ title, fields, values, okLabel = 'Salvar', wide = false, extraButtons }) {
  return new Promise((resolve) => {
    const f = form(fields, values);
    let answered = false;
    const settle = (v) => { if (!answered) { answered = true; resolve(v); } };

    modal({
      title, wide,
      render: () => f.node,
      onClose: () => settle(null),
      footer: (close) => [
        ...(extraButtons?.(close, f) ?? []),
        el('button', { class: 'btn', text: 'Cancelar', onclick: () => { settle(null); close(); } }),
        el('button', {
          class: 'btn primary', text: okLabel,
          onclick: () => { settle(f.read()); close(); },
        }),
      ],
    });
  });
}

/* ---------- blocos visuais ---------- */

/**
 * `sub` aceita uma linha ou várias.
 *
 * Várias existem porque nem todo número merece o tamanho de manchete. Um quadro
 * costuma ter uma cifra que pede ação e outras que só precisam ficar
 * registradas — dar a todas o mesmo corpo faz o olho não saber onde pousar, e
 * dar quadro próprio a cada uma enche a tela de caixas que ninguém lê.
 */
export function statTile({ label, value, sub, tone = '' }) {
  const node = el('div', { class: 'stat' },
    el('div', { class: 'stat-label', text: label }),
    el('div', { class: `stat-value ${tone}`, text: value }),
  );
  for (const linha of [sub].flat().filter(Boolean)) {
    node.append(linha instanceof Node ? linha : el('div', { class: 'stat-sub', text: linha }));
  }
  return node;
}

export function meter(pct, tone) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const t = tone ?? (clamped >= 1 ? 'bad' : clamped >= 0.8 ? 'warn' : 'ok');
  return el('div', { class: 'meter' },
    el('span', { class: `meter-fill ${t}`, style: `width:${Math.min(100, clamped * 100)}%` }));
}

/**
 * O "e depois?" de um dia vazio: mostra o próximo compromisso com data, hora e
 * a distância em dias. `onOpen` leva para o dia dele.
 *
 * Vive aqui e não em cada view porque a Agenda e o Painel dizem a mesma coisa,
 * e dizer a mesma coisa de dois jeitos é como as duas telas passam a divergir.
 */
export function proximoCompromisso(ev, { relDay, fmtDate, fmtTime, onOpen } = {}) {
  if (!ev) return null;
  const quando = ev.occurrence ?? ev.date;
  return el('div', { class: 'prox' },
    el('div', { class: 'prox-rot', text: 'Próximo compromisso' }),
    el('button', {
      class: 'prox-corpo', onclick: () => onOpen?.(quando, ev),
      title: ev.virtual ? 'Vem de outro módulo — clique para abrir lá' : (onOpen ? 'Abrir esse dia na agenda' : ''),
    },
    el('div', { class: 'prox-quando mono' },
      el('span', { text: fmtDate(quando, { weekday: true }) }),
      ev.time ? el('span', { text: fmtTime(ev.time) }) : null),
    el('div', { class: 'prox-meio' },
      el('div', { class: 'prox-titulo', text: ev.title }),
      el('div', { class: 'tiny dim', text: relDay(quando) })),
    ev.category ? el('span', { class: `pill cat-${ev.category}`, text: ev.category }) : null));
}

export function emptyState(text, actionLabel, onAction) {
  const node = el('div', { class: 'empty' }, el('div', { text }));
  if (actionLabel) {
    node.append(el('button', { class: 'btn sm', text: actionLabel, style: 'margin-top:12px', onclick: onAction }));
  }
  return node;
}

export function sectionCard(title, actions, ...content) {
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', { text: title }),
      actions ? el('div', { style: 'display:flex;gap:6px' }, ...actions) : null),
    ...content);
}
