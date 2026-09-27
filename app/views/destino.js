// PRÓXIMO DESTINO — o editor de cards de viagem do Kadu.
//
// Ao contrário dos outros módulos, este não foi escrito aqui: veio pronto, como
// uma página HTML que já roda sozinha. Então ele entra do jeito que é, dentro de
// um quadro, e NÃO reescrito em cima do jeito do JARBAS.
//
// Por que não reescrever: a página traz o desenho do card, o mapa, a galeria e a
// exportação em PNG nos dois formatos, tudo afinado. Reescrever isso em vanilla
// para "ficar igual ao resto" seria refazer um trabalho que já está pronto e
// ganhar, em troca, a chance de errar num pixel que ninguém mandou mudar.
//
// O pacote original vinha com um componente React de quarenta linhas cuja única
// função era pôr a página num iframe. Aqui isso são seis linhas, sem React e sem
// build — o JARBAS não tem nenhum dos dois, e não precisou ter.

import { el } from '../core/util.js';
import * as settings from '../core/settings.js';
import { criarPonte } from '../core/destino-ponte.js';
import { sectionCard } from '../ui/components.js';

const PAGINA = './assets/proximo-destino/index.html';

/**
 * Liga a ponte e devolve o quadro pronto.
 *
 * A ordem aqui não é estilo: o editor lê `window.PD_ADAPTER` uma única vez, no
 * instante em que o script dele roda. Pôr a ponte DEPOIS de criar o quadro é
 * pôr depois da carruagem — ele já teria decidido usar o armazenamento próprio,
 * e as viagens ficariam onde ninguém mais as veria.
 */
function quadroLigado(extras = {}) {
  const { ponte, desligar } = criarPonte();
  window.PD_ADAPTER = ponte;

  const quadro = el('iframe', {
    src: PAGINA,
    title: 'Editor Próximo Destino',
    // Sem `allow-same-origin` o navegador trata o iframe como outra origem: a
    // ponte fica invisível para ele E o armazenamento próprio some junto. As
    // viagens simplesmente não salvariam, sem erro nenhum na tela.
    sandbox: 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals',
    ...extras,
  });

  // O editor já vem com tema escuro pronto, na mesma chave que o JARBAS usa
  // (`data-theme`). Então escurecer não é injetar CSS por cima — é dizer a ele
  // qual tema usar, e deixá-lo pintar com as cores que o próprio autor
  // escolheu. O CARD não muda: ele tem cores fixas no desenho, e é assim que
  // se garante que a peça publicada sai igual em qualquer tela.
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
 * O editor tem quase três mil pixels de altura. Metido numa janela de 460px,
 * ele vira duas rolagens empilhadas: o polegar ora move a página do JARBAS,
 * ora move o miolo do editor, e qual das duas depende de onde o dedo encostou.
 * Numa tela de celular isso é o bastante para a interface parecer travada.
 *
 * Como a página do editor é da MESMA origem, dá para medir a altura real dela
 * e dar exatamente essa altura ao quadro. Aí existe uma rolagem só, a da
 * página — a que o polegar espera.
 *
 * Só no celular: no computador o quadro contido funciona bem, e a prévia do
 * card fica grudada ao lado justamente porque HÁ rolagem interna.
 */
const ESTREITO = '(max-width: 700px)';

function acompanharAltura(quadro) {
  const tela = window.matchMedia(ESTREITO);
  let observador = null;

  /*
   * A medida sai do BODY, não do <html>.
   *
   * `documentElement.scrollHeight` nunca é menor que a janela — e a janela,
   * aqui, é a altura que este próprio código acabou de definir. Medir por ali
   * é medir a si mesmo: o quadro cresceria e nunca mais encolheria, então
   * trocar de Stories para Feed deixaria para trás uma faixa vazia enorme.
   * A caixa do body não depende da janela: ela é o conteúdo, e só.
   */
  const medir = () => {
    if (!quadro.isConnected) return soltar();
    const corpo = quadro.contentDocument?.body;
    if (!corpo) return;
    const estilo = quadro.contentWindow.getComputedStyle(corpo);
    const alta = Math.ceil(corpo.getBoundingClientRect().height
      + parseFloat(estilo.marginTop) + parseFloat(estilo.marginBottom));
    if (!alta) return;
    // A folga de 2px evita ficar oscilando por causa de arredondamento.
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

  root.append(sectionCard('Próximo Destino', acoes, quadro,
    el('div', { class: 'tiny dim', style: 'margin-top:8px' },
      'As viagens e as fotos ficam nas suas coleções do JARBAS: sincronizam entre os seus aparelhos e '
      + 'entram no backup, como a agenda. As fotos enviadas são reduzidas para 1280px antes de guardar — '
      + 'maior que o card, que é 1080, e pequeno o bastante para viajar. Os PNGs saem pelo download normal.')));
}

/**
 * O editor ocupando a tela toda.
 *
 * Mesma escolha do "Apresentar" do mapa mental, e pelo mesmo motivo: o cartão
 * vive apertado entre menu e barra de título, e o Safari do iPhone não
 * implementa tela cheia fora de vídeo. A camada fixa sempre funciona; a tela
 * cheia de verdade, quando existe, só remove as barras do navegador.
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
      el('div', { class: 'pd-palco-titulo', text: 'Próximo Destino' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn sm danger', text: '✕ Sair', title: 'Fechar (Esc)', onclick: sair })),
    quadro);

  document.body.append(caixa);
  window.addEventListener('keydown', tecla);
  const pedir = caixa.requestFullscreen || caixa.webkitRequestFullscreen;
  if (pedir) { try { pedir.call(caixa); } catch (e) { /* a camada fixa já basta */ } }
}
