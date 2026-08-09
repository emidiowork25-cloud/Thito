// Utilitários gerais: ids, datas, moeda, texto, DOM.

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const now = () => new Date().toISOString();

/* ---------- datas ---------- */

/** Data local no formato YYYY-MM-DD (sem deslocamento de fuso). */
export function isoDate(d = new Date()) {
  const dt = typeof d === 'string' ? parseDate(d) : d;
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Interpreta 'YYYY-MM-DD' como data local (o construtor Date trataria como UTC). */
export function parseDate(s) {
  if (s instanceof Date) return s;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(s);
}

export const today = () => isoDate(new Date());

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function addMonths(dateStr, n) {
  const d = parseDate(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  // preserva o fim de mês: 31/jan + 1 mês => 28/29 de fev
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())));
  return isoDate(d);
}

export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

export const monthKey = (dateStr) => String(dateStr || today()).slice(0, 7);

export function startOfWeek(dateStr) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() - d.getDay()); // domingo
  return isoDate(d);
}

export function diffDays(a, b) {
  const ms = parseDate(b).setHours(12, 0, 0, 0) - parseDate(a).setHours(12, 0, 0, 0);
  return Math.round(ms / 86400000);
}

const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const weekdayName = (dateStr) => WD[parseDate(dateStr).getDay()];
export const monthName = (m) => MO[m];

export function fmtDate(dateStr, { weekday = false, year = false } = {}) {
  const d = parseDate(dateStr);
  let s = `${String(d.getDate()).padStart(2, '0')} ${MO[d.getMonth()].slice(0, 3)}`;
  if (year) s += ` ${d.getFullYear()}`;
  if (weekday) s = `${WD[d.getDay()].slice(0, 3)}, ${s}`;
  return s;
}

/** "hoje", "amanhã", "em 3 dias", "há 2 dias" */
export function relDay(dateStr) {
  const n = diffDays(today(), dateStr);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  if (n > 1) return `em ${n} dias`;
  return `há ${-n} dias`;
}

export const fmtTime = (t) => (t || '').slice(0, 5);

/* ---------- números / moeda ---------- */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (n) => BRL.format(Number(n) || 0);
export const num = (n, d = 0) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(n) || 0);

/** Aceita "1.234,56", "1234.56", "R$ 12,90" e devolve Number. */
export function parseMoney(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------- texto ---------- */

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Remove acentos e baixa a caixa — para busca. */
export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const truncate = (s, n) => (String(s ?? '').length > n ? String(s).slice(0, n - 1) + '…' : String(s ?? ''));

/** Markdown mínimo e seguro (negrito, itálico, código, listas, quebras). */
export function mdlite(s) {
  return esc(s)
    .replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/^[-•]\s+(.*)$/gm, '• $1');
}

/* ---------- DOM ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    // <textarea> não tem atributo `value`: o conteúdo dele é o texto-filho.
    // setAttribute('value', …) era aceito em silêncio e não desenhava nada —
    // o campo aparecia vazio mesmo com o valor gravado. (`select` fica de fora
    // de propósito: aqui os <option> ainda não foram anexados, então atribuir
    // .value neste ponto não pegaria em nada.)
    else if (k === 'value' && tag === 'textarea') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept = '.json') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => { resolve(input.files?.[0] ?? null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export const groupBy = (arr, key) => arr.reduce((acc, item) => {
  const k = typeof key === 'function' ? key(item) : item[key];
  (acc[k] ||= []).push(item);
  return acc;
}, {});

export const sum = (arr, fn = (x) => x) => arr.reduce((a, b) => a + (Number(fn(b)) || 0), 0);
