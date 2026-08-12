// Mind maps — editor radial em SVG para organizar estudos e ideias.
//
// Modelo: lista plana de nós { id, text, parent, depth, note, color }.
// O layout é calculado a cada desenho (radial por ângulo herdado), então
// não há coordenadas para manter em sincronia entre dispositivos.

import * as store from '../core/store.js';
import * as jarbas from '../assistant/jarbas.js';
import * as visao from '../core/visao.js';
import { on, emit } from '../core/bus.js';
import { el, uid, download, truncate, pickFile } from '../core/util.js';
import {
  layout, indexar, ramoInteiro, visiveis, aplicarDeslocamentos, contarDescendentes,
} from '../ui/arvore.js';
import { sectionCard, emptyState, formModal, confirmDialog, modal, toast } from '../ui/components.js';

let mapaAtivo = null;
let selecionado = null;
let zoom = 1;
let pan = { x: 0, y: 0 };

const PALETA = ['#5eb3c4', '#e0656b', '#4bb391', '#d9a04a', '#7f9fd0', '#8fd3e0'];

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
    el('button', { class: 'btn sm', text: 'Ler de uma imagem', title: 'Transcreve um print, um quadro branco ou um mapa feito à mão', onclick: () => importarDeImagem() }),
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

const SVG = 'http://www.w3.org/2000/svg';
const cria = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** A curva de um pai até um filho. Isolada porque o arrasto a redesenha a cada quadro. */
const curva = (a, b) => {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

function canvasMapa(mapa) {
  const todos = mapa.nodes ?? [];
  const nodes = visiveis(todos);
  const filhosDe = indexar(todos);
  const pos = aplicarDeslocamentos(nodes, layout(nodes));
  const cores = coresDosRamos(mapa);

  // A moldura acompanha o desenho: mapas grandes cabem inteiros, pequenos não ficam perdidos.
  const xs = Object.values(pos).map((p) => p.x);
  const ys = Object.values(pos).map((p) => p.y);
  const margem = 170;
  const minX = Math.min(...xs, 0) - margem;
  const minY = Math.min(...ys, 0) - margem * 0.5;
  const W = Math.max(700, Math.max(...xs, 0) + margem - minX);
  const H = Math.max(360, Math.max(...ys, 0) + margem * 0.5 - minY);

  const svg = cria('svg', { viewBox: `${minX} ${minY} ${W} ${H}`, class: 'mm-svg' });
  const g = cria('g', { transform: `translate(${pan.x} ${pan.y}) scale(${zoom})` });
  svg.append(g);

  const grupos = {};    // id -> <g> do nó
  const arestas = {};   // id -> <path> que chega nele vindo do pai
  const caixas = {};    // id -> { w, h }

  // arestas primeiro, para ficarem atrás dos nós
  for (const n of nodes) {
    if (!n.parent || !pos[n.parent] || !pos[n.id]) continue;
    const path = cria('path', {
      d: curva(pos[n.parent], pos[n.id]),
      class: 'mm-edge',
      stroke: n.color ?? cores[n.id] ?? PALETA[0],
    });
    arestas[n.id] = path;
    g.append(path);
  }

  /** Redesenha caixas e curvas a partir de `pos`. Chamada a cada quadro do arrasto. */
  const reposicionar = () => {
    for (const n of nodes) {
      const p = pos[n.id];
      const c = caixas[n.id];
      if (p && c && grupos[n.id]) grupos[n.id].setAttribute('transform', `translate(${p.x - c.w / 2} ${p.y - c.h / 2})`);
    }
    for (const [id, path] of Object.entries(arestas)) {
      const filho = pos[id];
      const pai = pos[nodes.find((n) => n.id === id)?.parent];
      if (filho && pai) path.setAttribute('d', curva(pai, filho));
    }
  };

  // Quantos pixels da tela valem uma unidade do desenho. Sem isso o nó anda mais
  // (ou menos) que o dedo, e arrastar vira adivinhação.
  const porPixel = () => {
    const r = svg.getBoundingClientRect();
    return r.width ? (W / r.width) / zoom : 1;
  };

  let arrastou = false;   // um arrasto termina em "click"; este é o freio dele

  for (const n of nodes) {
    const p = pos[n.id];
    if (!p) continue;
    const cor = n.color ?? cores[n.id] ?? PALETA[0];
    const largura = Math.min(230, Math.max(80, n.text.length * 7.6 + 26));
    const altura = n.depth === 0 ? 46 : 34;
    caixas[n.id] = { w: largura, h: altura };

    const grupo = cria('g', {
      class: `mm-node ${selecionado === n.id ? 'sel' : ''} depth-${Math.min(3, n.depth)}`,
      transform: `translate(${p.x - largura / 2} ${p.y - altura / 2})`,
    });
    grupo.addEventListener('click', (e) => {
      e.stopPropagation();
      if (arrastou) { arrastou = false; return; }
      selecionado = n.id;
      emit('nav:refresh');
    });
    grupo.addEventListener('dblclick', (e) => { e.stopPropagation(); editarNo(mapa, n); });
    grupo.addEventListener('mousedown', (e) => e.stopPropagation());   // o pan não é deste evento
    grupo.addEventListener('pointerdown', (e) => iniciarArrasto(e, n));

    grupo.append(cria('rect', {
      width: largura, height: altura, rx: altura / 2,
      fill: `${cor}22`, stroke: cor, 'stroke-width': selecionado === n.id ? 2.4 : 1.2,
    }));

    const texto = cria('text', {
      x: largura / 2, y: altura / 2 + 4.5, 'text-anchor': 'middle',
      class: 'mm-text', 'font-size': n.depth === 0 ? 15 : 12.5,
    });
    texto.textContent = truncate(n.text, 30);
    grupo.append(texto);

    if (n.note) grupo.append(cria('circle', { cx: largura - 9, cy: 9, r: 3.4, fill: cor }));

    if ((filhosDe[n.id] ?? []).length) {
      // O botão vai na ponta de fora do nó — o lado para onde o ramo cresce.
      // Do lado de dentro ele cairia em cima da curva que vem do pai.
      const lado = pos[n.id].x >= (pos[n.parent]?.x ?? 0) ? 1 : -1;
      grupo.append(botaoColapso(mapa, n, todos, largura, altura, cor, lado));
    }

    grupos[n.id] = grupo;
    g.append(grupo);
  }

  /**
   * Arrastar um nó move ele e o ramo inteiro. O que fica guardado é o
   * deslocamento em relação ao lugar calculado, não a coordenada — ver arvore.js.
   */
  function iniciarArrasto(e, n) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const escala = porPixel();
    const parentes = ramoInteiro(nodes, n.id);
    const base = {};
    for (const id of parentes) if (pos[id]) base[id] = { ...pos[id] };
    const x0 = e.clientX;
    const y0 = e.clientY;
    arrastou = false;

    const aoMover = (ev) => {
      const dx = (ev.clientX - x0) * escala;
      const dy = (ev.clientY - y0) * escala;
      if (!arrastou && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 3) arrastou = true;
      if (!arrastou) return;
      for (const id of parentes) if (base[id]) pos[id] = { x: base[id].x + dx, y: base[id].y + dy };
      reposicionar();
    };

    const aoSoltar = async (ev) => {
      window.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      window.removeEventListener('pointercancel', aoSoltar);
      if (!arrastou) return;
      // Lê o deslocamento do banco, e não do objeto capturado no fecho: entre um
      // arrasto e o seguinte a tela não é redesenhada, e `n` ficaria velho.
      const atual = store.get('mindmaps', mapa.id)?.nodes?.find((x) => x.id === n.id)?.desloc ?? { x: 0, y: 0 };
      await atualizarNo(mapa, n.id, {
        desloc: {
          x: atual.x + (ev.clientX - x0) * escala,
          y: atual.y + (ev.clientY - y0) * escala,
        },
      });
    };

    window.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);
    window.addEventListener('pointercancel', aoSoltar);
  }

  /* ---- pan e zoom do quadro ---- */

  // Com captura de ponteiro, e não com ouvintes no window: os antigos eram
  // registrados a cada desenho e nunca removidos, então depois de trocar de
  // mapa algumas vezes havia uma pilha deles movendo o mesmo quadro.
  let panBase = null;
  svg.addEventListener('pointerdown', (e) => {
    panBase = { x: e.clientX - pan.x, y: e.clientY - pan.y, moveu: false };
    svg.setPointerCapture?.(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!panBase) return;
    panBase.moveu = true;
    pan = { x: e.clientX - panBase.x, y: e.clientY - panBase.y };
    g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  });
  const soltarPan = (e) => { svg.releasePointerCapture?.(e.pointerId); panBase = null; };
  svg.addEventListener('pointerup', soltarPan);
  svg.addEventListener('pointercancel', soltarPan);

  svg.addEventListener('click', (e) => {
    if (e.target !== svg && e.target !== g) return;   // clique no vazio, não num nó
    selecionado = null;
    emit('nav:refresh');
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(2.5, Math.max(0.35, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  }, { passive: false });

  const movidos = todos.filter((n) => n.desloc).length;
  const acoes = [
    el('button', { class: 'btn sm', text: '−', title: 'Afastar', onclick: () => { zoom = Math.max(0.35, zoom * 0.85); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: '+', title: 'Aproximar', onclick: () => { zoom = Math.min(2.5, zoom * 1.18); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: 'Centralizar', onclick: () => { resetView(); emit('nav:refresh'); } }),
    movidos ? el('button', {
      class: 'btn sm', text: 'Reorganizar',
      title: `Devolve ${movidos} nó(s) movido(s) ao lugar calculado`,
      onclick: () => reorganizar(mapa),
    }) : null,
    el('button', { class: 'btn sm', text: 'SVG', title: 'Exportar', onclick: () => exportarSvg(mapa, svg) }),
  ].filter(Boolean);

  // O quadro segue a proporção do próprio mapa, dentro de limites confortáveis:
  // mapas largos ficam baixos, mapas frondosos ficam altos.
  const quadro = el('div', {
    class: 'mm-canvas',
    style: `aspect-ratio:${W.toFixed(0)}/${H.toFixed(0)}`,
  }, svg);

  return sectionCard(mapa.title, acoes, quadro,
    el('div', { class: 'tiny dim', style: 'margin-top:8px', text: 'Clique para selecionar · duplo clique para editar · arraste um nó para levá-lo (com o ramo) · o círculo na ponta esconde e mostra · arraste o fundo para deslocar · roda do mouse para o zoom' }));
}

/**
 * O círculo na ponta do nó: fechado mostra quantos tópicos estão guardados ali,
 * aberto é só um traço. É o gesto que deixa um mapa grande caber na cabeça —
 * fecha o que já está resolvido e sobra o que ainda está em aberto.
 */
function botaoColapso(mapa, n, todos, largura, altura, cor, lado) {
  const cx = lado > 0 ? largura + 10 : -10;
  const fechado = !!n.colapsado;
  const quantos = fechado ? contarDescendentes(todos, n.id) : 0;

  const alvo = cria('g', { class: `mm-toggle ${fechado ? 'fechado' : ''}` });

  // A cor do ramo vai no `style`, e não em atributo: atributo de apresentação
  // perde para regra de CSS, e é o CSS que pinta o estado aberto conforme o tema.
  const bola = cria('circle', { class: 'mm-toggle-bola', cx, cy: altura / 2, r: 8.5, stroke: cor });
  if (fechado) bola.style.fill = cor;
  alvo.append(bola);

  const rotulo = cria('text', {
    x: cx, y: altura / 2 + 3.4, 'text-anchor': 'middle',
    class: 'mm-toggle-txt', 'font-size': fechado && quantos > 9 ? 8.5 : 10,
  });
  rotulo.textContent = fechado ? String(quantos) : '–';
  alvo.append(rotulo);

  const alternar = async (e) => {
    e.stopPropagation();
    await atualizarNo(mapa, n.id, { colapsado: !n.colapsado });
    emit('nav:refresh');
  };
  alvo.addEventListener('click', alternar);
  alvo.addEventListener('pointerdown', (e) => e.stopPropagation());   // não é arrasto
  alvo.addEventListener('mousedown', (e) => e.stopPropagation());
  return alvo;
}

async function reorganizar(mapa) {
  const nodes = (mapa.nodes ?? []).map(({ desloc, ...resto }) => resto);
  await store.save('mindmaps', { id: mapa.id, nodes });
  toast('Mapa reorganizado.', 'ok');
  emit('nav:refresh');
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
  const remover = ramoInteiro(mapa.nodes, node.id);
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

/* ---------- transcrever de uma imagem ---------- */

/**
 * A ferramenta que o modelo preenche. Lista plana com um número de nível em vez
 * de árvore aninhada: esquema recursivo depende de $ref, que é justamente a
 * parte do JSON Schema em que dá para escorregar. Nível é a mesma informação,
 * e é o formato que o resto do JARBAS já usa para ler tópicos indentados.
 */
const FERRAMENTA_MAPA = {
  name: 'transcrever_mapa',
  description: 'Registra a estrutura de tópicos lida na imagem, do centro para as pontas.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Nome do mapa. Use o título escrito na imagem; se não houver, resuma o assunto em até quatro palavras.' },
      raiz: { type: 'string', description: 'O tópico central — o assunto do qual tudo mais sai.' },
      topicos: {
        type: 'array',
        description: 'Todos os outros tópicos, na ordem de leitura.',
        items: {
          type: 'object',
          properties: {
            texto: { type: 'string', description: 'O texto do tópico, exatamente como está escrito na imagem.' },
            nivel: { type: 'integer', description: '1 para os ramos que saem do centro, 2 para os filhos deles, e assim por diante.' },
            nota: { type: 'string', description: 'Detalhe escrito perto do tópico que não é um tópico em si. Vazio quando não houver.' },
          },
          required: ['texto', 'nivel'],
        },
      },
    },
    required: ['raiz', 'topicos'],
  },
};

const INSTRUCAO_MAPA = [
  'Esta imagem tem uma estrutura de ideias: pode ser um mapa mental, um diagrama, um esquema',
  'no quadro branco, uma lista com recuos ou um print de outro programa.',
  'Transcreva a estrutura com a ferramenta transcrever_mapa.',
  '',
  'Regras: copie o texto como está escrito, no idioma em que está — não traduza, não melhore,',
  'não resuma e não acrescente tópico que não esteja na imagem. Se algo estiver ilegível,',
  'transcreva o que dá para ler e não invente o resto.',
  '',
  'Se a imagem não tiver estrutura nenhuma para transcrever, não use a ferramenta:',
  'responda em uma frase dizendo o que você está vendo.',
].join('\n');

async function importarDeImagem() {
  const file = await pickFile(visao.TIPOS);
  if (!file) return;

  const estado = el('div', { class: 'tiny dim', text: `Lendo "${truncate(file.name, 30)}"…` });
  const corpo = el('div', {}, estado);
  const m = modal({ title: 'Ler mapa de uma imagem', render: () => corpo, wide: true });

  let lido;
  try {
    lido = await visao.lerImagem(file, { instrucao: INSTRUCAO_MAPA, ferramenta: FERRAMENTA_MAPA });
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = visao.explicarFalha(err);
    return;
  }

  // Sem estrutura na foto o modelo responde em palavras. Isso não é falha do
  // programa: é o diagnóstico, e vale mais na tela do que um "erro" genérico.
  if (lido.texto) {
    estado.className = 'aviso';
    estado.textContent = lido.texto;
    return;
  }

  const nodes = nodesDeTopicos(lido.dados);
  if (nodes.length < 2) {
    estado.className = 'aviso';
    estado.textContent = 'Li a imagem, mas não achei tópicos suficientes para montar um mapa.';
    return;
  }

  const titulo = String(lido.dados.titulo || lido.dados.raiz || 'Mapa transcrito').trim();
  m.close();

  // A conferência e a decisão moram na mesma janela. Mostrar o esboço e só
  // então perguntar noutra caixa esconderia justamente o que se está conferindo.
  const criar = await new Promise((resolve) => {
    let respondido = false;
    const fim = (v) => { if (!respondido) { respondido = true; resolve(v); } };
    modal({
      title: `Transcrição de "${titulo}"`,
      wide: true,
      onClose: () => fim(false),
      render: () => el('div', {},
        el('p', { class: 'tiny dim', style: 'margin-top:0', text: `${nodes.length} tópicos lidos. Confira agora; depois de criado, dá para corrigir qualquer nó no próprio mapa.` }),
        el('pre', { class: 'previa', text: esbocoTexto(nodes) })),
      footer: (close) => [
        el('button', { class: 'btn', text: 'Descartar', onclick: () => { fim(false); close(); } }),
        el('button', { class: 'btn primary', text: 'Criar mapa', onclick: () => { fim(true); close(); } }),
      ],
    });
  });
  if (!criar) return;

  const mapa = await store.save('mindmaps', { title: titulo, nodes });
  mapaAtivo = mapa.id;
  selecionado = null;
  resetView();
  toast(`Mapa "${titulo}" criado a partir da imagem.`, 'ok');
  emit('nav:refresh');
}

/**
 * Transforma a lista plana (texto + nível) em nós com pai.
 *
 * Um nível que pula degraus — de 1 direto para 3, coisa que acontece quando a
 * foto está torta — é aparado para o primeiro degrau livre. O tópico entra no
 * lugar mais próximo do certo em vez de virar órfão e sumir do desenho.
 */
function nodesDeTopicos({ raiz, topicos }) {
  const raizNode = { id: uid(), text: String(raiz || 'Mapa').trim(), parent: null, depth: 0 };
  const nodes = [raizNode];
  const ultimo = { 0: raizNode };

  for (const t of topicos ?? []) {
    const texto = String(t?.texto ?? '').trim();
    if (!texto) continue;
    const livre = Math.max(...Object.keys(ultimo).map(Number)) + 1;
    const nivel = Math.max(1, Math.min(Number(t.nivel) || 1, livre));
    const pai = ultimo[nivel - 1] ?? raizNode;

    const no = { id: uid(), text: truncate(texto, 120), parent: pai.id, depth: nivel };
    if (String(t.nota ?? '').trim()) no.note = String(t.nota).trim();
    nodes.push(no);

    ultimo[nivel] = no;
    for (const k of Object.keys(ultimo)) if (Number(k) > nivel) delete ultimo[k];
  }
  return nodes;
}

/** Esboço em texto indentado, para conferir a transcrição antes de criar o mapa. */
function esbocoTexto(nodes) {
  const filhosDe = indexar(nodes);
  const linhas = [];
  const andar = (n, recuo) => {
    linhas.push(`${'  '.repeat(recuo)}${recuo ? '· ' : ''}${n.text}${n.note ? `   (${truncate(n.note, 40)})` : ''}`);
    for (const f of filhosDe[n.id] ?? []) andar(f, recuo + 1);
  };
  const raiz = (filhosDe.__root ?? [])[0];
  if (raiz) andar(raiz, 0);
  return linhas.join('\n');
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
    .mm-text { fill:#e2edf1; font-family:"Segoe UI",system-ui,sans-serif }`;
  clone.prepend(estilo);
  const fundo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fundo.setAttribute('width', '100%');
  fundo.setAttribute('height', '100%');
  fundo.setAttribute('fill', '#0a1519');
  clone.prepend(fundo);
  download(`${mapa.title.replace(/[^\w-]+/g, '-')}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml');
  toast('SVG exportado.', 'ok');
}

on('action:new-mindmap', () => novoMapa());
