// FRASES COM FOTO KADU — o editor de cards de frase do @kadu.lins.
//
// Como o Próximo Destino, este módulo não foi escrito aqui: veio pronto, como
// uma página que já roda sozinha. Então entra do jeito que é, dentro de um
// quadro, e NÃO reescrito em cima do jeito do JARBAS. O desenho do card, o
// ajuste de tamanho da frase, a exportação em PNG e em ZIP já estão afinados;
// refazer isso em vanilla para "ficar igual ao resto" seria repetir um trabalho
// pronto e ganhar, em troca, a chance de errar num pixel que ninguém mandou
// mudar.
//
// A diferença para o outro é que este veio com a tomada já instalada: o README
// dele descreve o contrato `Store`, e a ponte só precisa preenchê-lo.

import { el } from '../core/util.js';
import * as settings from '../core/settings.js';
import { criarPonte } from '../core/frases-ponte.js';
import { sectionCard } from '../ui/components.js';

const PAGINA = './assets/frases-com-foto/index.html';

/**
 * Liga a ponte e devolve o quadro pronto.
 *
 * A ordem não é estilo: o editor lê `FRASES_ADAPTER` uma única vez, no instante
 * em que o script dele roda. Pôr a ponte DEPOIS de criar o quadro é pôr depois
 * da carruagem — ele já teria decidido usar o armazenamento próprio, e as
 * frases ficariam onde nenhum outro aparelho as veria.
 */
function quadroLigado(extras = {}) {
  const { ponte, desligar } = criarPonte();
  window.FRASES_ADAPTER = ponte;

  const quadro = el('iframe', {
    src: PAGINA,
    title: 'Editor Frases com Foto',
    // Sem `allow-same-origin` o navegador trata o quadro como outra origem: a
    // ponte fica invisível para ele E o armazenamento próprio some junto. As
    // frases simplesmente não salvariam, sem erro nenhum na tela.
    sandbox: 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals',
    ...extras,
  });

  // O editor já vem com tema escuro pronto, na mesma chave que o JARBAS usa
  // (`data-theme`). Escurecer não é injetar CSS por cima — é dizer a ele qual
  // tema usar. O CARD não muda: o fundo azul marinho é fixo no desenho, e é
  // assim que a peça publicada sai igual em qualquer tela.
  const pintar = () => {
    try {
      const d = quadro.contentDocument;
      if (d?.documentElement) d.documentElement.dataset.theme = settings.get('theme') === 'light' ? 'light' : 'dark';
    } catch { /* ainda carregando */ }
  };
  quadro.addEventListener('load', pintar);

  return { quadro, pintar, desligar };
}

/**
 * No celular, quem se ajusta é o quadro — não o conteúdo.
 *
 * Mesma história do Próximo Destino: o editor tem milhares de pixels de altura
 * e, metido numa janela de 460px, vira duas rolagens empilhadas — o polegar ora
 * move a página do JARBAS, ora move o miolo, e qual das duas depende de onde o
 * dedo encostou. Como a página é da MESMA origem, dá para medir a altura real
 * dela e dar exatamente isso ao quadro: uma rolagem só.
 */
const ESTREITO = '(max-width: 700px)';

function acompanharAltura(quadro) {
  const tela = window.matchMedia(ESTREITO);
  let observador = null;

  /*
   * A medida sai do BODY, não do <html>.
   *
   * `documentElement.scrollHeight` nunca é menor que a janela — e a janela,
   * aqui, é a altura que este próprio código acabou de definir. Medir por ali é
   * medir a si mesmo: o quadro cresceria e nunca mais encolheria.
   */
  const medir = () => {
    if (!quadro.isConnected) return soltar();
    const corpo = quadro.contentDocument?.body;
    if (!corpo) return;
    const estilo = quadro.contentWindow.getComputedStyle(corpo);
    const alta = Math.ceil(corpo.getBoundingClientRect().height
      + parseFloat(estilo.marginTop) + parseFloat(estilo.marginBottom));
    if (!alta) return;
    if (Math.abs(alta - (parseFloat(quadro.style.height) || 0)) > 2) quadro.style.height = `${alta}px`;
  };

  const soltar = () => {
    observador?.disconnect();
    observador = null;
    quadro.style.height = '';
  };

  const ligar = () => {
    soltar();
    const corpo = quadro.contentDocument?.body;
    if (!corpo || !window.ResizeObserver) return;
    observador = new ResizeObserver(medir);
    observador.observe(corpo);
    medir();
  };

  const decidir = () => (tela.matches ? ligar() : soltar());
  quadro.addEventListener('load', decidir);
  tela.addEventListener('change', decidir);
}

export function render(root) {
  const { quadro } = quadroLigado({ class: 'pd-quadro' });
  acompanharAltura(quadro);

  const acoes = [
    el('button', {
      class: 'btn sm', text: 'Tela cheia', title: 'Abrir o editor ocupando a tela',
      onclick: () => apresentar(),
    }),
    el('button', {
      class: 'btn sm', text: 'Abrir em aba', title: 'Abrir o editor numa aba do navegador',
      onclick: () => window.open(PAGINA, '_blank', 'noopener'),
    }),
  ];

  root.append(sectionCard('Frases com Foto Kadu', acoes, quadro,
    el('div', { class: 'tiny dim', style: 'margin-top:8px' },
      'As frases e as fotos ficam nas suas coleções do JARBAS: sincronizam entre os seus aparelhos e '
      + 'entram no backup, como a agenda. As fotos enviadas são reduzidas para 1280px antes de guardar — '
      + 'maior que o card, que é 1080, e pequeno o bastante para viajar. O lote de frases vem do arquivo '
      + 'frases.json do módulo; o que você editar por cima fica salvo e não se perde quando o lote trocar. '
      + 'Os PNGs e o ZIP saem pelo download normal.')));
}

/**
 * O editor ocupando a tela toda.
 *
 * Mesma escolha do Próximo Destino e do "Apresentar" do mapa mental, pelo mesmo
 * motivo: o cartão vive apertado entre menu e barra de título, e o Safari do
 * iPhone não implementa tela cheia fora de vídeo. A camada fixa sempre
 * funciona; a tela cheia de verdade, quando existe, só remove as barras do
 * navegador.
 */
function apresentar() {
  const caixa = el('div', { class: 'pd-palco' });
  const { quadro, desligar } = quadroLigado();

  const emTelaCheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  const sair = () => {
    window.removeEventListener('keydown', tecla);
    if (emTelaCheia()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    desligar();
    caixa.remove();
  };

  function tecla(e) { if (e.key === 'Escape') sair(); }

  caixa.append(
    el('div', { class: 'pd-palco-barra' },
      el('div', { class: 'pd-palco-titulo', text: 'Frases com Foto Kadu' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn sm danger', text: '✕ Sair', title: 'Fechar (Esc)', onclick: sair })),
    quadro);

  document.body.append(caixa);
  window.addEventListener('keydown', tecla);
  const pedir = caixa.requestFullscreen || caixa.webkitRequestFullscreen;
  if (pedir) { try { pedir.call(caixa); } catch (e) { /* a camada fixa já basta */ } }
}
