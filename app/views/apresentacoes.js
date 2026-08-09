// Apresentações — de um tópico a um deck navegável, com modo de exibição e exportação.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import { el, uid, esc, truncate, download } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, toast } from '../ui/components.js';

let deckAtivo = null;
let slideAtivo = 0;

export function render(root, params = {}) {
  const decks = store.list('decks').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (params.id) { deckAtivo = params.id; slideAtivo = 0; }
  if (!decks.some((d) => d.id === deckAtivo)) { deckAtivo = decks[0]?.id ?? null; slideAtivo = 0; }

  root.append(el('div', { class: 'toolbar' },
    ...decks.slice(0, 8).map((d) => el('button', {
      class: `chip ${d.id === deckAtivo ? 'on' : ''}`,
      onclick: () => { deckAtivo = d.id; slideAtivo = 0; emit('nav:refresh'); },
      text: truncate(d.title, 26),
    })),
    el('button', { class: 'btn primary sm', text: '✦ Gerar a partir de tópicos', onclick: gerar }),
    el('button', { class: 'btn sm', text: '+ vazia', onclick: () => novoDeck() }),
  ));

  if (!deckAtivo) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhuma apresentação. Diga o assunto ao JARBAS e ele monta os slides — depois você ajusta.',
        '✦ Gerar com JARBAS', gerar)));
    return;
  }

  const deck = store.get('decks', deckAtivo);
  if (!deck) return;
  slideAtivo = Math.min(slideAtivo, Math.max(0, (deck.slides?.length ?? 1) - 1));

  root.append(el('div', { class: 'grid deck-grid' }, painelSlides(deck), painelEdicao(deck)));
}

/* ---------- palco ---------- */

function painelSlides(deck) {
  const slides = deck.slides ?? [];
  const s = slides[slideAtivo];

  const palco = el('div', { class: 'slide-stage' });
  if (s) {
    palco.append(el('div', { class: 'slide' },
      el('h2', { class: 'slide-title', text: s.title }),
      el('ul', { class: 'slide-bullets' }, ...(s.bullets ?? []).map((b) => el('li', { text: b }))),
      el('div', { class: 'slide-foot' },
        el('span', { class: 'tiny dim', text: deck.title }),
        el('span', { class: 'tiny dim mono', text: `${slideAtivo + 1} / ${slides.length}` }))));
  } else {
    palco.append(emptyState('Esta apresentação não tem slides.', '+ Slide', () => adicionarSlide(deck)));
  }

  const nav = el('div', { class: 'slide-nav' },
    el('button', { class: 'btn sm', text: '‹', onclick: () => { slideAtivo = Math.max(0, slideAtivo - 1); emit('nav:refresh'); } }),
    ...slides.map((_, i) => el('button', {
      class: `dot-nav ${i === slideAtivo ? 'on' : ''}`,
      title: `Slide ${i + 1}`,
      onclick: () => { slideAtivo = i; emit('nav:refresh'); },
    })),
    el('button', { class: 'btn sm', text: '›', onclick: () => { slideAtivo = Math.min(slides.length - 1, slideAtivo + 1); emit('nav:refresh'); } }));

  const acoes = [
    el('button', { class: 'btn sm', text: '▷ Apresentar', onclick: () => apresentar(deck) }),
    el('button', { class: 'btn sm', text: 'HTML', title: 'Exportar deck', onclick: () => exportarHtml(deck) }),
  ];

  const notas = s?.notes
    ? el('div', { class: 'speaker-notes' },
      el('div', { class: 'tiny dim', style: 'margin-bottom:4px', text: 'Roteiro de fala' }),
      el('div', { text: s.notes }))
    : null;

  return sectionCard(deck.title, acoes, palco, nav, notas);
}

/* ---------- edição ---------- */

function painelEdicao(deck) {
  const slides = deck.slides ?? [];
  const s = slides[slideAtivo];
  const body = el('div');

  if (s) {
    body.append(el('div', { class: 'field' },
      el('label', { text: 'Título do slide' }),
      el('input', {
        type: 'text', value: s.title,
        onchange: (e) => atualizarSlide(deck, s.id, { title: e.target.value }),
      })));

    const bullets = el('textarea', {
      rows: 7,
      placeholder: 'Um marcador por linha',
      onchange: (e) => atualizarSlide(deck, s.id, { bullets: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) }),
    });
    bullets.value = (s.bullets ?? []).join('\n');
    body.append(el('div', { class: 'field' }, el('label', { text: 'Marcadores' }), bullets));

    const notas = el('textarea', {
      rows: 5,
      placeholder: 'O que você vai falar neste slide',
      onchange: (e) => atualizarSlide(deck, s.id, { notes: e.target.value }),
    });
    notas.value = s.notes ?? '';
    body.append(el('div', { class: 'field' }, el('label', { text: 'Roteiro de fala' }), notas));

    body.append(el('div', { class: 'row', style: 'margin-bottom:10px' },
      el('button', { class: 'btn sm', text: '↑', title: 'Mover para cima', onclick: () => mover(deck, -1) }),
      el('button', { class: 'btn sm', text: '↓', title: 'Mover para baixo', onclick: () => mover(deck, 1) }),
      el('button', { class: 'btn sm danger', text: 'Excluir slide', onclick: () => excluirSlide(deck, s.id) })));
  }

  body.append(el('button', { class: 'btn', style: 'width:100%;margin-bottom:8px', text: '+ Slide', onclick: () => adicionarSlide(deck) }));
  body.append(el('button', {
    class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Melhorar com JARBAS',
    onclick: () => jarbas.askFrom(
      `Revise minha apresentação "${deck.title}". Aponte slides fracos, marcadores longos demais e o que está faltando `
      + 'para a narrativa fechar. Sugira as mudanças antes de aplicar qualquer coisa.',
    ),
  }));
  body.append(el('button', {
    class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Virar mind map',
    onclick: () => jarbas.askFrom(`Transforme a apresentação "${deck.title}" em um mapa mental com a ferramenta criar_mindmap.`),
  }));
  body.append(el('button', {
    class: 'btn danger', style: 'width:100%', text: 'Excluir apresentação',
    onclick: async () => {
      if (!await confirmDialog(`Excluir "${deck.title}"?`, { danger: true, okLabel: 'Excluir' })) return;
      await store.remove('decks', deck.id);
      deckAtivo = null;
      emit('nav:refresh');
    },
  }));

  return sectionCard('Editar', null, body);
}

/* ---------- operações ---------- */

const atualizarSlide = (deck, id, patch) =>
  store.save('decks', { id: deck.id, slides: (deck.slides ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) });

async function adicionarSlide(deck) {
  const slides = [...(deck.slides ?? []), { id: uid(), title: 'Novo slide', bullets: [], notes: '' }];
  await store.save('decks', { id: deck.id, slides });
  slideAtivo = slides.length - 1;
  emit('nav:refresh');
}

async function excluirSlide(deck, id) {
  const slides = (deck.slides ?? []).filter((s) => s.id !== id);
  await store.save('decks', { id: deck.id, slides });
  slideAtivo = Math.max(0, slideAtivo - 1);
  emit('nav:refresh');
}

async function mover(deck, delta) {
  const slides = [...(deck.slides ?? [])];
  const destino = slideAtivo + delta;
  if (destino < 0 || destino >= slides.length) return;
  [slides[slideAtivo], slides[destino]] = [slides[destino], slides[slideAtivo]];
  await store.save('decks', { id: deck.id, slides });
  slideAtivo = destino;
  emit('nav:refresh');
}

async function novoDeck() {
  const v = await formModal({
    title: 'Nova apresentação',
    values: { titulo: '' },
    fields: [{ name: 'titulo', label: 'Título', required: true }],
  });
  if (!v?.titulo?.trim()) return;
  const deck = await store.save('decks', {
    title: v.titulo.trim(), topic: '', theme: 'hud',
    slides: [{ id: uid(), title: v.titulo.trim(), bullets: [], notes: '' }],
  });
  deckAtivo = deck.id;
  slideAtivo = 0;
  emit('nav:refresh');
}

function gerar() {
  jarbas.askFrom(
    'Quero montar uma apresentação. Me pergunte o assunto, para quem é e quantos minutos ela tem, '
    + 'e então use a ferramenta criar_apresentacao com uma estrutura que tenha começo, desenvolvimento e fechamento.',
  );
}

/* ---------- apresentar e exportar ---------- */

function apresentar(deck) {
  const janela = window.open('', '_blank');
  if (!janela) { toast('O navegador bloqueou a janela. Libere pop-ups para este site.', 'err'); return; }
  janela.document.write(htmlDoDeck(deck, { apresentacao: true }));
  janela.document.close();
}

function exportarHtml(deck) {
  download(`${deck.title.replace(/[^\w-]+/g, '-').toLowerCase()}.html`, htmlDoDeck(deck), 'text/html');
  toast('Apresentação exportada. O arquivo abre em qualquer navegador.', 'ok');
}

/** Deck autocontido: um único HTML que roda offline, com teclado e impressão. */
function htmlDoDeck(deck, { apresentacao = false } = {}) {
  const slides = (deck.slides ?? []).map((s, i) => `
    <section class="slide" data-i="${i}">
      <h2>${esc(s.title)}</h2>
      <ul>${(s.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <footer><span>${esc(deck.title)}</span><span>${i + 1} / ${deck.slides.length}</span></footer>
      ${s.notes ? `<aside class="notes">${esc(s.notes)}</aside>` : ''}
    </section>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(deck.title)}</title>
<style>
  :root { --cy:#bcceda; --vi:#c58274; --bg:#141f27; --txt:#f5faff; }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--txt);
         font-family:"Segoe UI",system-ui,sans-serif; overflow:hidden }
  body::before { content:''; position:fixed; inset:0; pointer-events:none; opacity:.5;
    background-image:linear-gradient(rgba(212,199,87,.05) 1px,transparent 1px),
                     linear-gradient(90deg,rgba(212,199,87,.05) 1px,transparent 1px);
    background-size:44px 44px }
  .slide { display:none; position:fixed; inset:0; padding:8vh 10vw;
           flex-direction:column; justify-content:center }
  .slide.on { display:flex; animation:in .35s ease }
  @keyframes in { from { opacity:0; transform:translateY(14px) } }
  h2 { font-size:clamp(28px,4.6vw,58px); margin:0 0 .6em; line-height:1.15;
       background:linear-gradient(120deg,var(--acc),var(--acc-2));
       -webkit-background-clip:text; background-clip:text; color:transparent }
  ul { font-size:clamp(16px,2.1vw,27px); line-height:1.75; padding-left:1.1em; margin:0 }
  li { margin-bottom:.5em }
  li::marker { color:var(--acc) }
  footer { position:absolute; left:10vw; right:10vw; bottom:5vh;
           display:flex; justify-content:space-between; font-size:13px; opacity:.45 }
  .notes { display:none }
  .hint { position:fixed; bottom:12px; left:50%; transform:translateX(-50%);
          font-size:11px; opacity:.3 }
  @media print {
    body { background:#fff; color:#111; overflow:visible }
    body::before { display:none }
    .slide { display:flex !important; position:relative; page-break-after:always;
             height:100vh; inset:auto }
    h2 { color:#111; -webkit-text-fill-color:#111 }
    .hint { display:none }
  }
</style></head>
<body>
${slides}
<div class="hint">← → ou espaço para navegar · F para tela cheia · Ctrl+P para PDF</div>
<script>
  let i = 0;
  const slides = [...document.querySelectorAll('.slide')];
  const show = (n) => {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((s, k) => s.classList.toggle('on', k === i));
  };
  addEventListener('keydown', (e) => {
    if (['ArrowRight',' ','PageDown','Enter'].includes(e.key)) { e.preventDefault(); show(i + 1); }
    else if (['ArrowLeft','PageUp'].includes(e.key)) { e.preventDefault(); show(i - 1); }
    else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(slides.length - 1);
    else if (e.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.();
  });
  addEventListener('click', (e) => show(i + (e.clientX < innerWidth / 3 ? -1 : 1)));
  show(0);
  ${apresentacao ? 'document.documentElement.requestFullscreen?.().catch(() => {});' : ''}
</script>
</body></html>`;
}

on('action:new-deck', () => gerar());
