// Mind maps — editor radial em SVG para organizar estudos e ideias.
//
// Modelo: lista plana de nós { id, text, parent, depth, note, color }.
// O layout é calculado a cada desenho (radial por ângulo herdado), então
// não há coordenadas para manter em sincronia entre dispositivos.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import { on, emit } from '../core/bus.js';
import { el, uid, download, truncate } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, toast } from '../ui/components.js';

let mapaAtivo = null;
let selecionado = null;
let zoom = 1;
let pan = { x: 0, y: 0 };

const PALETA = ['#bcceda', '#c58274', '#7faf95', '#cbab77', '#a294bd', '#8fb3cc'];

export function render(root, params = {}) {
  const mapas = store.list('mindmaps').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (params.id) mapaAtivo = params.id;
  if (!mapas.some((m) => m.id === mapaAtivo)) mapaAtivo = mapas[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    ...mapas.slice(0, 8).map((m) => el('button', {
      class: `chip ${m.id === mapaAtivo ? 'on' : ''}`,
      onclick: () => { mapaAtivo = m.id; selecionado = null; resetView(); emit('nav:refresh'); },
      text: truncate(m.title, 24),
    })),
    el('button', { class: 'btn sm', text: '+ mapa', onclick: () => novoMapa() }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Gerar com JARBAS', onclick: gerarComJarbas }),
  ));

  if (!mapaAtivo) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhum mapa mental ainda. Crie um do zero ou peça um ao JARBAS sobre qualquer assunto.',
        'Criar mapa', () => novoMapa())));
    return;
  }

  const mapa = store.get('mindmaps', mapaAtivo);
  if (!mapa) return;

  root.append(el('div', { class: 'grid mm-grid' }, canvasMapa(mapa), painelNo(mapa)));
}

const resetView = () => { zoom = 1; pan = { x: 0, y: 0 }; };

/* ---------- desenho ---------- */

function canvasMapa(mapa) {
  const pos = layout(mapa.nodes ?? []);
  const cores = coresDosRamos(mapa);

  // A moldura acompanha o desenho: mapas grandes cabem inteiros, pequenos não ficam perdidos.
  const xs = Object.values(pos).map((p) => p.x);
  const ys = Object.values(pos).map((p) => p.y);
  const margem = 170;
  const minX = Math.min(...xs, 0) - margem;
  const minY = Math.min(...ys, 0) - margem * 0.5;
  const W = Math.max(700, Math.max(...xs, 0) + margem - minX);
  const H = Math.max(360, Math.max(...ys, 0) + margem * 0.5 - minY);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${minX} ${minY} ${W} ${H}`);
  svg.setAttribute('class', 'mm-svg');

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  svg.append(g);

  // arestas primeiro, para ficarem atrás dos nós
  for (const n of mapa.nodes ?? []) {
    if (!n.parent) continue;
    const a = pos[n.parent];
    const b = pos[n.id];
    if (!a || !b) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const mx = (a.x + b.x) / 2;
    path.setAttribute('d', `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`);
    path.setAttribute('class', 'mm-edge');
    path.setAttribute('stroke', n.color ?? cores[n.id] ?? PALETA[0]);
    g.append(path);
  }

  for (const n of mapa.nodes ?? []) {
    const p = pos[n.id];
    if (!p) continue;
    const cor = n.color ?? cores[n.id] ?? PALETA[0];
    const largura = Math.min(230, Math.max(80, n.text.length * 7.6 + 26));
    const altura = n.depth === 0 ? 46 : 34;

    const grupo = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grupo.setAttribute('class', `mm-node ${selecionado === n.id ? 'sel' : ''} depth-${Math.min(3, n.depth)}`);
    grupo.setAttribute('transform', `translate(${p.x - largura / 2} ${p.y - altura / 2})`);
    grupo.addEventListener('click', (e) => { e.stopPropagation(); selecionado = n.id; emit('nav:refresh'); });
    grupo.addEventListener('dblclick', (e) => { e.stopPropagation(); editarNo(mapa, n); });

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', largura);
    rect.setAttribute('height', altura);
    rect.setAttribute('rx', altura / 2);
    rect.setAttribute('fill', `${cor}22`);
    rect.setAttribute('stroke', cor);
    rect.setAttribute('stroke-width', selecionado === n.id ? 2.4 : 1.2);
    grupo.append(rect);

    const texto = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    texto.setAttribute('x', largura / 2);
    texto.setAttribute('y', altura / 2 + 4.5);
    texto.setAttribute('text-anchor', 'middle');
    texto.setAttribute('class', 'mm-text');
    texto.setAttribute('font-size', n.depth === 0 ? 15 : 12.5);
    texto.textContent = truncate(n.text, 30);
    grupo.append(texto);

    if (n.note) {
      const marca = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marca.setAttribute('cx', largura - 9);
      marca.setAttribute('cy', 9);
      marca.setAttribute('r', 3.4);
      marca.setAttribute('fill', cor);
      grupo.append(marca);
    }

    g.append(grupo);
  }

  svg.addEventListener('click', () => { selecionado = null; emit('nav:refresh'); });

  // pan com arrastar
  let arrastando = null;
  svg.addEventListener('mousedown', (e) => { arrastando = { x: e.clientX - pan.x, y: e.clientY - pan.y }; });
  window.addEventListener('mousemove', (e) => {
    if (!arrastando) return;
    pan = { x: e.clientX - arrastando.x, y: e.clientY - arrastando.y };
    g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  });
  window.addEventListener('mouseup', () => { arrastando = null; });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(2.5, Math.max(0.35, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  }, { passive: false });

  const acoes = [
    el('button', { class: 'btn sm', text: '−', title: 'Afastar', onclick: () => { zoom = Math.max(0.35, zoom * 0.85); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: '+', title: 'Aproximar', onclick: () => { zoom = Math.min(2.5, zoom * 1.18); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: 'Centralizar', onclick: () => { resetView(); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: 'SVG', title: 'Exportar', onclick: () => exportarSvg(mapa, svg) }),
  ];

  // O quadro segue a proporção do próprio mapa, dentro de limites confortáveis:
  // mapas largos ficam baixos, mapas frondosos ficam altos.
  const quadro = el('div', {
    class: 'mm-canvas',
    style: `aspect-ratio:${W.toFixed(0)}/${H.toFixed(0)}`,
  }, svg);

  return sectionCard(mapa.title, acoes, quadro,
    el('div', { class: 'tiny dim', style: 'margin-top:8px', text: 'Clique para selecionar · duplo clique para editar · arraste para mover · roda do mouse para o zoom' }));
}

/** Índice de filhos por pai — a base de todos os cálculos do mapa. */
function indexar(nodes) {
  const filhosDe = {};
  for (const n of nodes ?? []) (filhosDe[n.parent ?? '__root'] ||= []).push(n);
  return filhosDe;
}

/** Cada ramo que sai da raiz recebe um tom, herdado por todos os seus descendentes. */
function coresDosRamos(mapa) {
  const filhosDe = indexar(mapa.nodes);
  const raiz = (filhosDe.__root ?? [])[0];
  const cores = {};
  if (!raiz) return cores;
  cores[raiz.id] = PALETA[0];
  (filhosDe[raiz.id] ?? []).forEach((ramo, i) => {
    const cor = PALETA[i % PALETA.length];
    const pintar = (n) => { cores[n.id] = cor; (filhosDe[n.id] ?? []).forEach(pintar); };
    pintar(ramo);
  });
  return cores;
}

/**
 * Layout bilateral: raiz no centro, ramos alternando para a direita e a esquerda,
 * cada lado crescendo como uma árvore vertical. Cada nó ocupa uma faixa
 * proporcional ao número de folhas abaixo dele, então nada se sobrepõe.
 */
function layout(nodes) {
  const pos = {};
  const filhosDe = indexar(nodes);
  const raiz = (filhosDe.__root ?? [])[0];
  if (!raiz) return pos;

  const COLUNA = 250;  // distância horizontal entre níveis
  const LINHA = 56;    // altura reservada para cada folha

  const folhas = (n) => {
    const filhos = filhosDe[n.id] ?? [];
    return filhos.length ? filhos.reduce((a, f) => a + folhas(f), 0) : 1;
  };

  pos[raiz.id] = { x: 0, y: 0 };

  const posicionar = (node, lado, nivel, topo, altura) => {
    pos[node.id] = { x: lado * COLUNA * nivel, y: topo + altura / 2 };
    const filhos = filhosDe[node.id] ?? [];
    if (!filhos.length) return;
    const total = filhos.reduce((a, f) => a + folhas(f), 0) || 1;
    let cursor = topo;
    for (const f of filhos) {
      const fatia = (folhas(f) / total) * altura;
      posicionar(f, lado, nivel + 1, cursor, fatia);
      cursor += fatia;
    }
  };

  const ramos = filhosDe[raiz.id] ?? [];
  const direita = ramos.filter((_, i) => i % 2 === 0);
  const esquerda = ramos.filter((_, i) => i % 2 === 1);

  for (const [lista, lado] of [[direita, 1], [esquerda, -1]]) {
    const total = lista.reduce((a, r) => a + folhas(r), 0);
    let cursor = -(total * LINHA) / 2;
    for (const ramo of lista) {
      const altura = folhas(ramo) * LINHA;
      posicionar(ramo, lado, 1, cursor, altura);
      cursor += altura;
    }
  }

  return pos;
}

/* ---------- painel lateral ---------- */

function painelNo(mapa) {
  const body = el('div');
  const node = (mapa.nodes ?? []).find((n) => n.id === selecionado);

  if (!node) {
    body.append(el('p', { class: 'tiny dim', text: 'Selecione um nó para editar, ou use os botões abaixo.' }));
    body.append(el('button', {
      class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Renomear mapa',
      onclick: async () => {
        const v = await formModal({ title: 'Renomear mapa', values: { titulo: mapa.title }, fields: [{ name: 'titulo', label: 'Título' }] });
        if (v?.titulo?.trim()) { await store.save('mindmaps', { id: mapa.id, title: v.titulo.trim() }); emit('nav:refresh'); }
      },
    }));
    body.append(el('button', {
      class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Expandir com JARBAS',
      onclick: () => jarbas.askFrom(
        `Olhe meu mapa mental "${mapa.title}". Sugira de 4 a 6 tópicos que estão faltando para ele ficar completo, `
        + 'explicando em uma linha por que cada um importa. Me mostre antes de criar qualquer coisa.',
      ),
    }));
    body.append(el('button', {
      class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Virar apresentação',
      onclick: () => jarbas.askFrom(
        `Transforme meu mapa mental "${mapa.title}" em uma apresentação. Use a ferramenta criar_apresentacao, `
        + 'um slide por ramo principal, com 3 a 5 marcadores objetivos cada.',
      ),
    }));
    body.append(el('button', {
      class: 'btn danger', style: 'width:100%', text: 'Excluir mapa',
      onclick: async () => {
        if (!await confirmDialog(`Excluir o mapa "${mapa.title}"?`, { danger: true, okLabel: 'Excluir' })) return;
        await store.remove('mindmaps', mapa.id);
        mapaAtivo = null;
        emit('nav:refresh');
      },
    }));
    return sectionCard('Mapa', null, body);
  }

  body.append(el('div', { class: 'field' },
    el('label', { text: 'Texto do nó' }),
    el('input', {
      type: 'text', value: node.text,
      onchange: async (e) => { await atualizarNo(mapa, node.id, { text: e.target.value }); emit('nav:refresh'); },
    })));

  body.append(el('div', { class: 'field' },
    el('label', { text: 'Anotação' }),
    (() => {
      const ta = el('textarea', {
        rows: 5, placeholder: 'Detalhes, fórmula, referência…',
        onchange: async (e) => { await atualizarNo(mapa, node.id, { note: e.target.value }); },
      });
      ta.value = node.note ?? '';
      return ta;
    })()));

  body.append(el('div', { class: 'field' },
    el('label', { text: 'Cor' }),
    el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      ...PALETA.map((c) => el('button', {
        class: 'color-dot', style: `background:${c};outline:${node.color === c ? '2px solid var(--txt)' : 'none'}`,
        onclick: async () => { await atualizarNo(mapa, node.id, { color: c }); emit('nav:refresh'); },
      })),
      el('button', {
        class: 'color-dot', style: 'background:transparent;border:1px dashed var(--line-2)', title: 'Cor do ramo',
        onclick: async () => { await atualizarNo(mapa, node.id, { color: null }); emit('nav:refresh'); },
      }))));

  body.append(el('button', {
    class: 'btn primary', style: 'width:100%;margin-bottom:8px', text: '+ Sub-tópico',
    onclick: () => adicionarFilho(mapa, node),
  }));
  body.append(el('button', {
    class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Explicar este tópico',
    onclick: () => jarbas.askFrom(`Explique de forma clara e com um exemplo o tópico "${node.text}", dentro do contexto do meu mapa mental "${mapa.title}".`),
  }));
  if (node.parent) {
    body.append(el('button', {
      class: 'btn danger', style: 'width:100%', text: 'Excluir nó e filhos',
      onclick: () => excluirNo(mapa, node),
    }));
  }

  return sectionCard('Nó selecionado', null, body);
}

/* ---------- operações ---------- */

async function atualizarNo(mapa, id, patch) {
  const nodes = (mapa.nodes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n));
  await store.save('mindmaps', { id: mapa.id, nodes });
}

async function adicionarFilho(mapa, pai) {
  const v = await formModal({
    title: 'Novo sub-tópico',
    values: { texto: '' },
    fields: [{ name: 'texto', label: 'Texto', required: true }],
  });
  if (!v?.texto?.trim()) return;
  const novo = { id: uid(), text: v.texto.trim(), parent: pai.id, depth: (pai.depth ?? 0) + 1 };
  await store.save('mindmaps', { id: mapa.id, nodes: [...(mapa.nodes ?? []), novo] });
  selecionado = novo.id;
  emit('nav:refresh');
}

async function excluirNo(mapa, node) {
  if (!await confirmDialog(`Excluir "${node.text}" e tudo abaixo dele?`, { danger: true, okLabel: 'Excluir' })) return;
  const remover = new Set([node.id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const n of mapa.nodes ?? []) {
      if (n.parent && remover.has(n.parent) && !remover.has(n.id)) { remover.add(n.id); mudou = true; }
    }
  }
  const nodes = (mapa.nodes ?? []).filter((n) => !remover.has(n.id));
  await store.save('mindmaps', { id: mapa.id, nodes });
  selecionado = null;
  emit('nav:refresh');
}

async function editarNo(mapa, node) {
  const v = await formModal({
    title: 'Editar nó',
    values: { texto: node.text, nota: node.note ?? '' },
    fields: [
      { name: 'texto', label: 'Texto', required: true },
      { name: 'nota', label: 'Anotação', type: 'textarea', rows: 4 },
    ],
  });
  if (!v?.texto?.trim()) return;
  await atualizarNo(mapa, node.id, { text: v.texto.trim(), note: v.nota });
  emit('nav:refresh');
}

async function novoMapa() {
  const v = await formModal({
    title: 'Novo mind map',
    values: { titulo: '', raiz: '' },
    fields: [
      { name: 'titulo', label: 'Título do mapa', required: true, placeholder: 'Cálculo I, Projeto X…' },
      { name: 'raiz', label: 'Tópico central', placeholder: 'deixe vazio para usar o título' },
    ],
  });
  if (!v?.titulo?.trim()) return;
  const raiz = { id: uid(), text: (v.raiz || v.titulo).trim(), parent: null, depth: 0 };
  const mapa = await store.save('mindmaps', { title: v.titulo.trim(), nodes: [raiz] });
  mapaAtivo = mapa.id;
  selecionado = raiz.id;
  resetView();
  emit('nav:refresh');
}

function gerarComJarbas() {
  jarbas.askFrom('Quero um mapa mental novo. Pergunte sobre qual assunto, e então use a ferramenta criar_mindmap com uma estrutura de 3 níveis bem organizada.');
}

function exportarSvg(mapa, svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.querySelector('g')?.setAttribute('transform', 'translate(0 0) scale(1)');
  const estilo = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  estilo.textContent = `
    .mm-edge { fill:none; stroke-width:1.6; opacity:.55 }
    .mm-text { fill:#f5faff; font-family:"Segoe UI",system-ui,sans-serif }`;
  clone.prepend(estilo);
  const fundo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fundo.setAttribute('width', '100%');
  fundo.setAttribute('height', '100%');
  fundo.setAttribute('fill', '#141f27');
  clone.prepend(fundo);
  download(`${mapa.title.replace(/[^\w-]+/g, '-')}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  toast('SVG exportado.', 'ok');
}

on('action:new-mindmap', () => novoMapa());
