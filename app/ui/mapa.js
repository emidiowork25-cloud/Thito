// O quadro de mapa mental — o mesmo para o Mind map e para o Cofre.
//
// Ele nasceu dentro de views/mindmap.js e o Cofre tinha uma cópia mais velha:
// mesma árvore desenhada, mas sem colapsar, sem arrastar nó e sem exportar. Duas
// cópias de duzentas linhas é uma promessa de divergência — a cada conserto no
// mapa, o cofre ficava um degrau atrás, e "igual" virava "parecido".
//
// Agora é um arquivo só. O que cada tela informa é o que nelas é realmente
// diferente: como um nó é rotulado, e onde os nós são gravados. O resto — o
// layout, o arrasto, o colapso, o zoom, o recorte da moldura — é literalmente o
// mesmo código rodando nos dois lugares.
//
// Modelo de nó, também o mesmo dos dois lados:
//   { id, text, parent, depth, note?, color?, desloc?: {x,y}, colapsado?: bool }

import {
  layout, indexar, ramoInteiro, visiveis, aplicarDeslocamentos, contarDescendentes,
  medidaDoNo, separar,
} from './arvore.js';
import { el, truncate, download } from '../core/util.js';

const SVG = 'http://www.w3.org/2000/svg';

export const cria = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** A curva de um pai até um filho. Isolada porque o arrasto a redesenha a cada quadro. */
const curva = (a, b) => {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
};

export const PALETA = ['#5eb3c4', '#e0656b', '#4bb391', '#d9a04a', '#7f9fd0', '#8fd3e0'];

/** A linha de instruções embaixo do quadro. Uma só, porque o gesto é um só. */
export const AJUDA_MAPA = 'Clique para selecionar · duplo clique para editar · arraste um nó para levá-lo '
  + '(com o ramo) · o círculo na ponta esconde e mostra · arraste o fundo para deslocar · roda do mouse para o zoom';

/** Cada ramo que sai da raiz recebe um tom, herdado por todos os seus descendentes. */
export function coresDosRamos(nodes) {
  const filhosDe = indexar(nodes);
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
 * Desenha o quadro e devolve as peças que a tela precisa para montar o cartão.
 *
 * @param {object[]} opcoes.nodes      lista plana de nós
 * @param {object}   opcoes.vista      { zoom, pan } — objeto MUTÁVEL do chamador,
 *                                     para o zoom sobreviver ao redesenho
 * @param {string}   opcoes.selecionado id do nó em foco
 * @param {(n)=>string} [opcoes.rotulo] o texto desenhado na caixa
 * @param {(n)=>boolean} [opcoes.marca] mostra o pontinho no canto do nó
 * @param {(id)=>void} opcoes.aoSelecionar
 * @param {(n)=>void} [opcoes.aoEditar] duplo clique
 * @param {(id, patch)=>Promise} opcoes.salvarNo
 * @param {(id)=>{x,y}} [opcoes.deslocAtual] lê o deslocamento gravado agora
 * @param {boolean} [opcoes.arrastavel] deixa mover nó com o dedo/mouse
 * @param {()=>void} opcoes.redesenhar
 */
export function quadroDeMapa({
  nodes: todos = [],
  vista,
  selecionado = null,
  rotulo = (n) => truncate(n.text, 30),
  marca = (n) => !!n.note,
  aoSelecionar,
  aoEditar,
  salvarNo,
  deslocAtual = () => ({ x: 0, y: 0 }),
  // Apresentando, o mapa não se deixa remexer.
  //
  // Não é frescura: arrastar um nó GRAVA o deslocamento. Num telão, diante de
  // gente, o gesto de apontar vira o gesto de arrastar com uma facilidade
  // constrangedora — e o mapa voltaria da reunião diferente de como foi, sem
  // ninguém ter decidido isso. Arrastar o FUNDO continua valendo, porque
  // deslocar a vista não muda nada do que está guardado.
  arrastavel = true,
  redesenhar,
}) {
  const nodes = visiveis(todos);
  const filhosDe = indexar(todos);
  // A MESMA régua para medir e para desenhar. O rótulo entra na conta porque é
  // ele que dá a largura da caixa: o cofre e o mapa rotulam diferente, e o
  // layout tem de enxergar o texto que vai mesmo aparecer na tela.
  const medir = (n) => medidaDoNo(rotulo(n), n.depth);
  const pos = separar(nodes, aplicarDeslocamentos(nodes, layout(nodes, { medir })), { medir });
  const cores = coresDosRamos(todos);

  // A moldura acompanha o desenho: mapas grandes cabem inteiros, pequenos não ficam perdidos.
  const xs = Object.values(pos).map((p) => p.x);
  const ys = Object.values(pos).map((p) => p.y);
  const margem = 170;
  const minX = Math.min(...xs, 0) - margem;
  const minY = Math.min(...ys, 0) - margem * 0.5;
  const W = Math.max(700, Math.max(...xs, 0) + margem - minX);
  const H = Math.max(360, Math.max(...ys, 0) + margem * 0.5 - minY);

  const svg = cria('svg', { viewBox: `${minX} ${minY} ${W} ${H}`, class: 'mm-svg' });
  const g = cria('g', { transform: `translate(${vista.pan.x} ${vista.pan.y}) scale(${vista.zoom})` });
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
    return r.width ? (W / r.width) / vista.zoom : 1;
  };

  let arrastou = false;   // um arrasto termina em "click"; este é o freio dele

  for (const n of nodes) {
    const p = pos[n.id];
    if (!p) continue;
    const cor = n.color ?? cores[n.id] ?? PALETA[0];
    const texto = rotulo(n);
    const { w: largura, h: altura } = medir(n);
    caixas[n.id] = { w: largura, h: altura };

    const grupo = cria('g', {
      class: `mm-node ${selecionado === n.id ? 'sel' : ''} depth-${Math.min(3, n.depth)}`,
      transform: `translate(${p.x - largura / 2} ${p.y - altura / 2})`,
    });
    grupo.addEventListener('click', (e) => {
      e.stopPropagation();
      if (arrastou) { arrastou = false; return; }
      aoSelecionar(n.id);
    });
    if (aoEditar) grupo.addEventListener('dblclick', (e) => { e.stopPropagation(); aoEditar(n); });
    grupo.addEventListener('mousedown', (e) => e.stopPropagation());   // o pan não é deste evento
    grupo.addEventListener('pointerdown', (e) => iniciarArrasto(e, n));

    grupo.append(cria('rect', {
      width: largura, height: altura, rx: altura / 2,
      fill: `${cor}22`, stroke: cor, 'stroke-width': selecionado === n.id ? 2.4 : 1.2,
    }));

    const rotuloSvg = cria('text', {
      x: largura / 2, y: altura / 2 + 4.5, 'text-anchor': 'middle',
      class: 'mm-text', 'font-size': n.depth === 0 ? 15 : 12.5,
    });
    rotuloSvg.textContent = texto;
    grupo.append(rotuloSvg);

    if (marca(n)) grupo.append(cria('circle', { cx: largura - 9, cy: 9, r: 3.4, fill: cor }));

    if ((filhosDe[n.id] ?? []).length) {
      // O botão vai na ponta de fora do nó — o lado para onde o ramo cresce.
      // Do lado de dentro ele cairia em cima da curva que vem do pai.
      const lado = pos[n.id].x >= (pos[n.parent]?.x ?? 0) ? 1 : -1;
      grupo.append(botaoColapso({ n, todos, largura, altura, cor, lado, salvarNo, redesenhar }));
    }

    grupos[n.id] = grupo;
    g.append(grupo);
  }

  /**
   * Arrastar um nó move ele e o ramo inteiro. O que fica guardado é o
   * deslocamento em relação ao lugar calculado, não a coordenada — ver arvore.js.
   */
  function iniciarArrasto(e, n) {
    if (!arrastavel) return;
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
      // Lê o deslocamento de onde ele está gravado, e não do objeto capturado no
      // fecho: entre um arrasto e o seguinte a tela não é redesenhada, e `n`
      // ficaria velho — o segundo arrasto desfaria o primeiro.
      const atual = deslocAtual(n.id) ?? { x: 0, y: 0 };
      await salvarNo(n.id, {
        desloc: {
          x: (atual.x ?? 0) + (ev.clientX - x0) * escala,
          y: (atual.y ?? 0) + (ev.clientY - y0) * escala,
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
    panBase = { x: e.clientX - vista.pan.x, y: e.clientY - vista.pan.y };
    // Capturar o ponteiro é conveniência, não requisito: serve para o arrasto
    // continuar valendo se o dedo sair do SVG. Quando o navegador recusa — um
    // ponteiro que já terminou, um evento sintético — ele LANÇA, e um erro solto
    // dentro do pointerdown mata o resto do gesto. O pan funciona sem isto.
    try { svg.setPointerCapture?.(e.pointerId); } catch { /* segue sem captura */ }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!panBase) return;
    vista.pan = { x: e.clientX - panBase.x, y: e.clientY - panBase.y };
    g.setAttribute('transform', `translate(${vista.pan.x} ${vista.pan.y}) scale(${vista.zoom})`);
  });
  const soltarPan = (e) => {
    try { svg.releasePointerCapture?.(e.pointerId); } catch { /* já solto */ }
    panBase = null;
  };
  svg.addEventListener('pointerup', soltarPan);
  svg.addEventListener('pointercancel', soltarPan);

  svg.addEventListener('click', (e) => {
    if (e.target !== svg && e.target !== g) return;   // clique no vazio, não num nó
    aoSelecionar(null);
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    vista.zoom = Math.min(2.5, Math.max(0.35, vista.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    g.setAttribute('transform', `translate(${vista.pan.x} ${vista.pan.y}) scale(${vista.zoom})`);
  }, { passive: false });

  // O quadro segue a proporção do próprio mapa, dentro de limites confortáveis:
  // mapas largos ficam baixos, mapas frondosos ficam altos.
  const quadro = el('div', {
    class: 'mm-canvas',
    style: `aspect-ratio:${W.toFixed(0)}/${H.toFixed(0)}`,
  }, svg);

  return { svg, quadro, movidos: todos.filter((n) => n.desloc).length };
}

/**
 * O círculo na ponta do nó: fechado mostra quantos tópicos estão guardados ali,
 * aberto é só um traço. É o gesto que deixa um mapa grande caber na cabeça —
 * fecha o que já está resolvido e sobra o que ainda está em aberto.
 */
function botaoColapso({ n, todos, largura, altura, cor, lado, salvarNo, redesenhar }) {
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

  alvo.addEventListener('click', async (e) => {
    e.stopPropagation();
    await salvarNo(n.id, { colapsado: !n.colapsado });
    redesenhar();
  });
  alvo.addEventListener('pointerdown', (e) => e.stopPropagation());   // não é arrasto
  alvo.addEventListener('mousedown', (e) => e.stopPropagation());
  return alvo;
}

/**
 * Exporta o desenho como SVG.
 *
 * Sai o que está DESENHADO, e nada além: as caixas, as curvas e os rótulos que a
 * tela mostra. Nota de nó, cor guardada e — no cofre — qualquer campo de acesso
 * ficam de fora porque nunca chegaram a virar elemento no SVG.
 */
export function exportarSvg(svg, nomeArquivo) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', SVG);
  clone.querySelector('g')?.setAttribute('transform', 'translate(0 0) scale(1)');
  const estilo = document.createElementNS(SVG, 'style');
  estilo.textContent = `
    .mm-edge { fill:none; stroke-width:1.6; opacity:.55 }
    .mm-text { fill:#e2edf1; font-family:"Segoe UI",system-ui,sans-serif }
    .mm-toggle-bola { fill:#0a1519 }
    .mm-toggle-txt { fill:#e2edf1; font-family:"Segoe UI",system-ui,sans-serif }`;
  clone.prepend(estilo);
  const fundo = document.createElementNS(SVG, 'rect');
  fundo.setAttribute('width', '100%');
  fundo.setAttribute('height', '100%');
  fundo.setAttribute('fill', '#0a1519');
  clone.prepend(fundo);
  download(`${String(nomeArquivo).replace(/[^\w-]+/g, '-')}.svg`, new XMLSerializer().serializeToString(clone), 'image/svg+xml');
}
