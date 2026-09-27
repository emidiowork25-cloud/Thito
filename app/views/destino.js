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
import { sectionCard } from '../ui/components.js';

const PAGINA = './assets/proximo-destino/index.html';

export function render(root) {
  const quadro = el('iframe', {
    src: PAGINA,
    title: 'Editor Próximo Destino',
    class: 'pd-quadro',
    // Sem `allow-same-origin` o navegador trata o iframe como outra origem e o
    // IndexedDB dele fica inacessível — as viagens não salvariam. Mesma origem
    // é justamente o que a página precisa, e é o que ela tem servida daqui.
    sandbox: 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals',
  });

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
      'As viagens e as fotos ficam guardadas NESTE aparelho, no armazenamento do próprio editor — '
      + 'elas não viajam pela nuvem do JARBAS como a agenda e as finanças. Os PNGs saem pelo download normal.')));
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
  const quadro = el('iframe', {
    src: PAGINA,
    title: 'Editor Próximo Destino',
    sandbox: 'allow-scripts allow-same-origin allow-downloads allow-popups allow-modals',
  });

  const emTelaCheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  const sair = () => {
    window.removeEventListener('keydown', tecla);
    if (emTelaCheia()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
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
