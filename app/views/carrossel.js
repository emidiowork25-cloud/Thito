// CARROSSEL KADU LINS — o editor dos carrosséis 1080×1350 do @kadu.lins.
//
// Terceiro editor do Kadu a entrar no hub, e o primeiro que NÃO vai num quadro.
// Os outros dois são páginas HTML que rodam sozinhas, então entram inteiras,
// dentro de um iframe. Este veio como biblioteca — ES modules, sem build e sem
// dependência nenhuma, que é a arquitetura do próprio JARBAS. Então monta
// direto na tela.
//
// O que se ganha com isso: nada de sandbox, nada de X-Frame-Options, nada de
// medir a altura de uma página de dentro para o celular não ficar com duas
// rolagens. O editor é parte da página, e se comporta como tal.
//
// O que se perde: ele deixa de ser autocontido. Se algo do JARBAS quebrar o CSS
// dele, quebra de verdade — não há mais a parede do iframe. O autor previu
// isso: todo o estilo mora sob `.kl-carrossel`, com prefixo `kl-`.

import { el } from '../core/util.js';
import * as settings from '../core/settings.js';
import { criarPonte } from '../core/carrossel-ponte.js';
import { sectionCard } from '../ui/components.js';
import { montarEditor } from '../modules/carrossel-kadu/editor.js';

const SEMENTES = './app/modules/carrossel-kadu/dados-iniciais.json';
const ASSETS = './assets/carrossel/';

/*
 * O editor montado agora, se houver.
 *
 * Ele põe escutas na raiz, na prévia e na JANELA, e mantém um timer de
 * gravação. A janela não some quando a tela troca — sem chamar `destruir`, cada
 * visita deixaria para trás um ouvinte de `resize` apontando para nós que já
 * saíram do documento. Por isso este módulo exporta `destruir`, e o shell o
 * chama antes de limpar a tela.
 */
let editor = null;
let semente = null;   // o JSON só precisa ser buscado uma vez por sessão

export function destruir() {
  try { editor?.destruir(); } catch { /* já estava desmontado */ }
  editor = null;
}

export function render(root) {
  destruir();   // reentrar na tela não pode empilhar dois editores

  const palco = el('div', { class: 'kl-palco' });
  const aviso = el('div', { class: 'tiny dim', style: 'padding:18px', text: 'Abrindo o editor…' });
  palco.append(aviso);

  const acoes = [
    el('button', {
      class: 'btn sm', text: 'Tela cheia', title: 'Abrir o editor ocupando a tela',
      onclick: () => apresentar(),
    }),
  ];

  root.append(sectionCard('Carrossel Kadu Lins', acoes, palco,
    el('div', { class: 'tiny dim', style: 'margin-top:8px' },
      'Os carrosséis e as fotos ficam nas suas coleções do JARBAS: sincronizam entre os seus aparelhos '
      + 'e entram no backup, como a agenda. As fotos enviadas são reduzidas para 1280px antes de guardar '
      + '— maior que o slide, que é 1080, e pequeno o bastante para viajar. Os PNGs e os ZIPs saem pelo '
      + 'download normal. Os 12 carrosséis de partida vêm do arquivo do módulo; o que você editar por '
      + 'cima fica salvo e não se perde.')));

  montar(palco, aviso);
}

/** Busca as sementes e só então monta — o editor as quer na hora de nascer. */
async function montar(palco, aviso) {
  let sementes = semente;
  if (!sementes) {
    try {
      const r = await fetch(SEMENTES);
      if (!r.ok) throw new Error(String(r.status));
      sementes = semente = await r.json();
    } catch (err) {
      aviso.textContent = 'Não consegui carregar os carrosséis de partida. '
        + 'O que você já salvou continua guardado; recarregue a página para tentar de novo.';
      return;
    }
  }
  // Saiu da tela enquanto o arquivo vinha: não monta num nó que já morreu.
  if (!palco.isConnected) return;

  aviso.remove();
  const { ponte } = criarPonte();
  editor = montarEditor(palco, {
    armazenamento: ponte,
    baseAssets: ASSETS,
    sementes,
    aoErro: (e) => console.error('[carrossel]', e),
  });
  pintar(palco);
}

/** O tema do JARBAS vira o `data-tema` que o editor entende. */
function pintar(palco) {
  palco.dataset.tema = settings.get('theme') === 'light' ? 'claro' : 'escuro';
}

/**
 * O editor ocupando a tela toda.
 *
 * Mesma escolha dos outros dois módulos e do "Apresentar" do mapa mental: o
 * cartão vive apertado entre menu e barra de título, e o Safari do iPhone não
 * implementa tela cheia fora de vídeo. A camada fixa sempre funciona; a tela
 * cheia de verdade, quando existe, só remove as barras do navegador.
 *
 * Aqui há um segundo editor, com uma ponte própria. Poderia ser o mesmo nó
 * mudado de lugar, mas mover um nó vivo entre dois pais é justamente o tipo de
 * coisa que deixa uma escuta apontando para o lugar errado. Dois editores
 * independentes, sobre a MESMA coleção, é mais simples e dá no mesmo: o que um
 * grava o outro lê.
 */
function apresentar() {
  const caixa = el('div', { class: 'pd-palco' });
  const palco = el('div', { class: 'kl-palco kl-palco-cheio' });
  let deste = null;

  const emTelaCheia = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  const sair = () => {
    window.removeEventListener('keydown', tecla);
    if (emTelaCheia()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    try { deste?.destruir(); } catch { /* já foi */ }
    caixa.remove();
  };

  function tecla(e) { if (e.key === 'Escape') sair(); }

  caixa.append(
    el('div', { class: 'pd-palco-barra' },
      el('div', { class: 'pd-palco-titulo', text: 'Carrossel Kadu Lins' }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn sm danger', text: '✕ Sair', title: 'Fechar (Esc)', onclick: sair })),
    palco);

  document.body.append(caixa);
  window.addEventListener('keydown', tecla);

  (async () => {
    const sementes = semente ?? await fetch(SEMENTES).then((r) => r.json()).catch(() => []);
    if (!palco.isConnected) return;
    semente = semente ?? sementes;
    const { ponte } = criarPonte();
    deste = montarEditor(palco, {
      armazenamento: ponte, baseAssets: ASSETS, sementes,
      aoErro: (e) => console.error('[carrossel]', e),
    });
    pintar(palco);
  })();

  const pedir = caixa.requestFullscreen || caixa.webkitRequestFullscreen;
  if (pedir) { try { pedir.call(caixa); } catch (e) { /* a camada fixa já basta */ } }
}
