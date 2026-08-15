// Teleprompter — editor no PC, exibidor no celular, sincronizados em tempo real.
//
// O editor é o dono do estado. Ele transmite um objeto completo pelo canal
// Realtime a cada mudança; o exibidor só obedece. Para a rolagem não engasgar
// com a latência da rede, não mandamos a posição quadro a quadro: mandamos a
// posição-base e um "está rodando", e cada lado calcula o resto com o próprio
// relógio. Assim a rolagem é fluida mesmo com a rede oscilando.

import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as jarbas from '../assistant/jarbas.js';
import { conectar, novaSala } from '../core/realtime.js';
import { encode as qrEncode, toSvg as qrToSvg } from '../core/qr.js';
import { on, emit } from '../core/bus.js';
import { el, truncate, clamp, download } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, toast } from '../ui/components.js';

const PADRAO = {
  fonte: 58,          // px na tela do exibidor
  altura: 1.5,        // multiplicador da altura de linha
  velocidade: 130,    // linhas por minuto
  espelhoH: false,    // espelhamento horizontal (vidro do teleprompter)
  espelhoV: false,
  margem: 12,         // % de margem lateral
  contraste: 'claro', // 'claro' = texto branco no preto
};

/* Estado vivo, fora do ciclo de render para sobreviver às redesenhadas. */
const vivo = {
  scriptId: null,
  aba: 'editor',
  rodando: false,
  pos: 0,             // posição em linhas
  t0: 0,              // performance.now() de quando começou a rolar
  canal: null,
  sala: null,
  conexao: 'fechado',
  exibidores: 0,
  ultimoPing: 0,
  loop: null,
  // Vários painéis desenham o mesmo roteiro ao mesmo tempo: o monitor do
  // operador (sempre legível) e a miniatura do que o celular está vendo
  // (espelhada). Antes era um só, e por isso o preview do editor herdava o
  // espelhamento — quem escrevia ficava lendo o próprio texto de trás.
  paineis: [],
};

/* ============================ tela ============================ */

export function render(root, params = {}) {
  const scripts = store.list('scripts').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (params.id) vivo.scriptId = params.id;
  if (!scripts.some((s) => s.id === vivo.scriptId)) vivo.scriptId = scripts[0]?.id ?? null;

  root.append(el('div', { class: 'toolbar' },
    ...scripts.slice(0, 6).map((s) => el('button', {
      class: `chip ${s.id === vivo.scriptId ? 'on' : ''}`,
      onclick: () => { trocarScript(s.id); },
      text: truncate(s.title, 24),
    })),
    el('button', { class: 'btn sm', text: '+ roteiro', onclick: () => novoScript() }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn sm', text: 'Escrever com JARBAS', onclick: escreverComJarbas }),
  ));

  if (!vivo.scriptId) {
    root.append(el('div', { class: 'card' },
      emptyState('Nenhum roteiro ainda. Crie um e abra o exibidor no celular.',
        'Criar roteiro', () => novoScript())));
    return;
  }

  const script = store.get('scripts', vivo.scriptId);
  if (!script) return;

  garantirCanal(script);

  root.append(el('div', { class: 'tabs' },
    ...[['editor', 'Editor'], ['exibidor', 'Exibidor & link']].map(([id, rotulo]) => el('button', {
      class: `tab ${vivo.aba === id ? 'on' : ''}`,
      onclick: () => { vivo.aba = id; emit('nav:refresh'); },
      text: rotulo,
    })),
    el('div', { class: 'spacer' }),
    statusConexao(),
  ));

  if (vivo.aba === 'editor') root.append(abaEditor(script));
  else root.append(abaExibidor(script));

  // Todo painel desta tela é desenhado pelo mesmo loop. Ligá-lo aqui, e não só
  // ao navegar, cobre o caso de abrir o JARBAS já nesta URL — sem isso o
  // roteiro aparecia parado até alguém mexer no transporte.
  tocarLoop();
}

function statusConexao() {
  const rotulos = { aberto: 'canal aberto', conectando: 'conectando…', fechado: 'sem canal' };
  const classe = vivo.conexao === 'aberto' ? 'ok' : vivo.conexao === 'conectando' ? 'warn' : 'bad';
  const texto = vivo.exibidores > 0
    ? `${vivo.exibidores} exibidor(es) ligado(s)`
    : rotulos[vivo.conexao] ?? vivo.conexao;
  return el('span', { class: `pill ${classe}`, text: texto });
}

/* ============================ painéis e transporte ============================ */

/**
 * Um painel de leitura. Todos mostram o mesmo estado ao mesmo tempo; o que
 * muda é o lado do texto.
 *
 * `espelhar: false` é o monitor do operador — sempre legível, porque quem
 * opera precisa ler para conferir, não para apresentar. `espelhar: true` é o
 * retrato fiel do que o celular está exibindo atrás do vidro.
 */
function painel(script, { classe = '', espelhar, getTexto } = {}) {
  const preview = el('div', { class: `tp-preview ${classe}`.trim() });
  const trilho = el('div', { class: 'tp-track' });
  preview.append(el('div', { class: 'tp-cue' }), trilho);

  const texto = getTexto ?? (() => store.get('scripts', script.id)?.body ?? '');
  const cfg = () => configDe(script.id);

  // Registra sem limpar a lista aqui. A tela inteira é montada antes de entrar
  // no documento, então neste instante os painéis irmãos ainda estão soltos —
  // filtrar por `isConnected` agora descartaria o painel registrado uma linha
  // acima. Quem varre os órfãos é o loop, quando todos já estão na página.
  vivo.paineis = [...(vivo.paineis ?? []), { trilho, preview, getTexto: texto, getCfg: cfg, espelhar }];
  // O primeiro quadro sai no próximo tique: antes disso o painel ainda não
  // está no documento e `clientWidth` é 0, o que zeraria a escala da fonte.
  setTimeout(() => pintar(trilho, preview, texto(), cfg(), posicaoAtual(cfg()), { miniatura: true, espelhar }), 0);

  ligarGestos(preview, script.id, cfg);
  return preview;
}

/**
 * O painel vira um controle: toque para dar play, arraste para achar a linha.
 *
 * Isto existe para quando o editor está no celular. Os botões de transporte
 * continuam ali, mas dedo em botão de 40px, com o roteiro rolando, é o jeito
 * mais lento de corrigir a linha — arrastar o próprio texto é o jeito rápido, e
 * é como todo mundo já espera que uma tela de celular funcione.
 *
 * Ponteiros, e não toques: o mesmo código serve para o dedo, o mouse e a
 * caneta, e o navegador entrega os três pelo mesmo evento. E `touch-action:
 * none` no CSS é o que impede a página de rolar junto — resolvido lá, sem um
 * único preventDefault aqui. Foi um preventDefault em toque, num ouvinte do
 * window, que já matou o clique de todos os botões do app no iPhone.
 */
const ARRASTE_MINIMO = 7;   // px antes de virar arraste, para o toque ainda ser toque

function ligarGestos(alvo, scriptId, cfg) {
  let ponteiro = null;
  let yInicial = 0;
  let posInicial = 0;
  let arrastou = false;

  alvo.addEventListener('pointerdown', (e) => {
    if (ponteiro !== null) return;
    ponteiro = e.pointerId;
    yInicial = e.clientY;
    posInicial = posicaoAtual(cfg());
    arrastou = false;
    // A captura mantém o arraste vivo quando o dedo escorrega para fora da
    // caixa — que é a regra, não a exceção, numa miniatura de celular. Falha
    // em navegador que não tenha o ponteiro registrado, e falhar aqui não pode
    // derrubar o resto do gesto.
    try { alvo.setPointerCapture?.(e.pointerId); } catch { /* segue sem captura */ }
  });

  alvo.addEventListener('pointermove', (e) => {
    if (e.pointerId !== ponteiro) return;
    const dy = e.clientY - yInicial;
    if (!arrastou && Math.abs(dy) < ARRASTE_MINIMO) return;
    arrastou = true;
    alvo.classList.add('arrastando');
    // A linha na tela é menor do que a do celular: o preview é uma miniatura, e
    // a mesma escala que encolhe a fonte tem que encolher o passo do dedo.
    const c = cfg();
    const alturaLinha = c.fonte * ((alvo.clientWidth || 420) / 900) * c.altura;
    if (alturaLinha > 0) irPara(scriptId, posInicial - dy / alturaLinha);
  });

  const soltar = (e) => {
    if (e.pointerId !== ponteiro) return;
    ponteiro = null;
    alvo.classList.remove('arrastando');
    if (!arrastou) alternarRolagem(scriptId);
  };
  alvo.addEventListener('pointerup', soltar);
  alvo.addEventListener('pointercancel', soltar);
}

const rotuloPlay = () => (vivo.rodando ? '⏸  Pausar' : '▶  Rolar');

/**
 * Barra de transporte. Aparece no editor e no monitor do operador, e os dois
 * botões dizem a mesma coisa porque são reescritos juntos — um "Rolar" preso
 * numa aba enquanto o texto já anda é o tipo de mentira que faz o operador
 * apertar duas vezes e parar a leitura no ar.
 */
function transporte(scriptId) {
  const btnPlay = el('button', { class: 'btn primary', text: rotuloPlay() });
  btnPlay.addEventListener('click', () => alternarRolagem(scriptId));
  // Mesma razão do painel: a varredura dos botões velhos fica em sincronizarPlay.
  vivo.botoesPlay = [...(vivo.botoesPlay ?? []), btnPlay];

  return el('div', { class: 'tp-transport' },
    btnPlay,
    el('button', { class: 'btn', text: '⏮  Início', onclick: () => irPara(scriptId, 0) }),
    el('button', { class: 'btn', text: '−1 par.', onclick: () => pular(scriptId, -1) }),
    el('button', { class: 'btn', text: '+1 par.', onclick: () => pular(scriptId, 1) }),
  );
}

function sincronizarPlay() {
  vivo.botoesPlay = (vivo.botoesPlay ?? []).filter((b) => b.isConnected);
  for (const b of vivo.botoesPlay) b.textContent = rotuloPlay();
}

/* ============================ aba: editor ============================ */

function abaEditor(script) {
  const cfg = { ...PADRAO, ...(script.config ?? {}) };

  /* --- texto --- */
  const area = el('textarea', {
    class: 'tp-editor',
    spellcheck: 'false',
    placeholder: 'Escreva o texto que vai ser lido.\n\nUma linha entre colchetes vira marcação de operação e NÃO é lida no ar:\n[VT 30s]\n[SOBE SOM]',
  });
  area.value = script.body ?? '';
  area.addEventListener('input', () => {
    agendarSalvar(script.id, { body: area.value });
    atualizarContagem();
    // O celular recebe a letra no mesmo instante em que ela é digitada — o
    // salvamento é que espera; a transmissão, não.
    transmitir(script.id, { texto: area.value });
  });

  const contagem = el('div', { class: 'tp-count tiny dim' });
  const atualizarContagem = () => {
    const { palavras, linhas, segundos } = medir(area.value, cfg.velocidade);
    contagem.textContent = `${palavras} palavras · ${linhas} linhas · ~${formatarTempo(segundos)} no ar`;
  };
  atualizarContagem();

  /* --- controles ao vivo --- */
  const controles = el('div', { class: 'tp-controls' },
    deslizante('Velocidade', 'velocidade', cfg.velocidade, 20, 400, 5, (v) => `${v} linhas/min`, script.id, atualizarContagem),
    deslizante('Tamanho da fonte', 'fonte', cfg.fonte, 24, 140, 2, (v) => `${v} px`, script.id),
    deslizante('Altura da linha', 'altura', cfg.altura, 1.1, 2.4, 0.05, (v) => `${Number(v).toFixed(2)}×`, script.id),
    deslizante('Margem lateral', 'margem', cfg.margem, 0, 30, 1, (v) => `${v}%`, script.id),
    el('div', { class: 'tp-toggles' },
      alternador('Espelhar na horizontal', 'espelhoH', cfg.espelhoH, script.id),
      alternador('Espelhar na vertical', 'espelhoV', cfg.espelhoV, script.id),
      alternador('Fundo claro (texto preto)', 'contraste', cfg.contraste === 'escuro', script.id, (ligado) => (ligado ? 'escuro' : 'claro')),
    ),
  );

  /* --- preview --- */
  // Lê do textarea, não do banco: o salvamento tem meio segundo de espera e
  // esse preview precisa acompanhar a digitação, letra por letra.
  const preview = painel(script, { espelhar: false, getTexto: () => area.value });

  return el('div', { class: 'grid tp-grid' },
    sectionCard(script.title, [
      el('button', { class: 'btn sm', text: 'Renomear', onclick: () => renomear(script) }),
      el('button', { class: 'btn sm', text: 'Exportar', onclick: () => exportar(script) }),
      el('button', { class: 'btn sm danger', text: 'Excluir', onclick: () => excluir(script) }),
    ], area, contagem),
    el('div', { class: 'grid', style: 'align-content:start' },
      sectionCard('No ar', null, transporte(script.id), preview),
      sectionCard('Controles ao vivo', null, controles)));
}

/** Controle deslizante que salva e transmite em tempo real. */
function deslizante(rotulo, chave, valor, min, max, passo, formatar, scriptId, extra) {
  const saida = el('span', { class: 'mono tiny', text: formatar(valor) });
  const input = el('input', {
    type: 'range', min, max, step: passo, value: valor,
    oninput: (e) => {
      const v = Number(e.target.value);
      saida.textContent = formatar(v);
      aplicarConfig(scriptId, { [chave]: v });
      extra?.();
    },
  });
  // O celular também mexe nestes valores. Sem o registro abaixo, subir a
  // velocidade lá deixaria o cursor daqui parado no número velho — e o
  // operador leria na tela um ajuste que não é mais o que está no ar.
  vivo.controles = [...(vivo.controles ?? []), { chave, input, saida, formatar, extra }];

  return el('div', { class: 'field' },
    el('label', { style: 'display:flex;justify-content:space-between' },
      el('span', { text: rotulo }), saida),
    input);
}

/** Traz os deslizantes para o valor que está valendo, venha ele de onde vier. */
function sincronizarControles(cfg) {
  vivo.controles = (vivo.controles ?? []).filter((c) => c.input.isConnected);
  for (const c of vivo.controles) {
    const v = cfg[c.chave];
    if (v === undefined || Number(c.input.value) === Number(v)) continue;
    c.input.value = String(v);
    c.saida.textContent = c.formatar(v);
    c.extra?.();
  }
}

function alternador(rotulo, chave, ligado, scriptId, transformar) {
  const input = el('input', {
    type: 'checkbox',
    onchange: (e) => aplicarConfig(scriptId, { [chave]: transformar ? transformar(e.target.checked) : e.target.checked }),
  });
  input.checked = !!ligado;
  return el('label', { class: 'tp-toggle' }, input, el('span', { text: rotulo }));
}

/* ============================ aba: exibidor ============================ */

function abaExibidor(script) {
  const url = urlDoExibidor(script);
  const corpo = el('div');

  if (!settings.isCloudConfigured()) {
    corpo.append(el('div', { class: 'aviso', text: 'Configure a nuvem em Ajustes para gerar o link do exibidor — a sincronização com o celular passa por ela.' }));
    return el('div', { class: 'card' }, corpo);
  }

  corpo.append(el('p', { class: 'tiny dim', style: 'margin-top:0' },
    'Aponte a câmera do celular para o código. A página abre já espelhada e acompanha, ao vivo, '
    + 'tudo o que você mudar aqui: texto, velocidade, tamanho da fonte e rolagem. '
    + 'Não há nada a publicar: o exibidor vai junto do hub.'));

  // Confere se a página do exibidor já está no ar e, se não estiver, diz exatamente o que fazer.
  const diagnostico = el('div', { class: 'tiny dim', style: 'margin-bottom:12px', text: 'verificando o exibidor…' });
  corpo.append(diagnostico);
  verificarExibidor(url).then((r) => {
    if (r.ok) {
      diagnostico.className = 'ok-box tiny';
      diagnostico.textContent = 'Exibidor no ar e respondendo como página. Pode ler o QR.';
      return;
    }
    diagnostico.className = 'aviso';
    diagnostico.textContent = r.motivo;
  });

  /* QR */
  const caixaQr = el('div', { class: 'tp-qr' });
  try {
    caixaQr.append(qrToSvg(qrEncode(url), { escala: 5, margem: 3 }));
  } catch (err) {
    caixaQr.append(el('div', { class: 'tiny dim', text: `Não consegui gerar o QR (${err.message}). Use o link abaixo.` }));
  }
  corpo.append(caixaQr);

  /* link */
  const campo = el('input', { type: 'text', value: url, readonly: true, class: 'mono tiny' });
  campo.addEventListener('focus', () => campo.select());
  corpo.append(el('div', { class: 'field' }, el('label', { text: 'Link do exibidor' }), campo));

  corpo.append(el('div', { class: 'row' },
    el('button', {
      class: 'btn sm', text: 'Copiar link',
      onclick: async () => {
        try { await navigator.clipboard.writeText(url); toast('Link copiado.', 'ok'); }
        catch { campo.select(); toast('Não consegui copiar — o link está selecionado, use Ctrl+C.', 'err'); }
      },
    }),
    el('button', {
      class: 'btn sm', text: 'Abrir aqui',
      title: 'Útil para testar num segundo monitor',
      onclick: () => window.open(url, '_blank'),
    }),
    el('button', {
      class: 'btn sm danger', text: 'Trocar código',
      title: 'Invalida o link antigo',
      onclick: async () => {
        if (!await confirmDialog('Gerar um código novo? O link atual para de funcionar e o celular precisa ler o QR de novo.')) return;
        await store.save('scripts', { id: script.id, sala: novaSala() });
        fecharCanal();
        toast('Código trocado.');
        emit('nav:refresh');
      },
    })));

  corpo.append(el('div', { class: 'tiny dim', style: 'margin-top:14px' },
    el('div', { text: 'No celular exibidor:' }),
    el('div', { text: '• Toque na tela para mostrar os controles; toque de novo para escondê-los.' }),
    el('div', { text: '• Arraste o texto para cima ou para baixo para achar a linha — o editor acompanha.' }),
    el('div', { text: '• ⛶ põe em tela cheia. No iPhone, use Compartilhar › Adicionar à Tela de Início.' }),
    el('div', { text: '• A tela não apaga sozinha: o cadeado na barra de cima mostra se a trava pegou.' }),
    el('div', { text: '• Se cair a rede, ele reconecta e volta de onde parou.' })));

  corpo.append(el('div', { class: 'aviso', style: 'margin-top:14px' },
    'Quem tiver este link vê o seu roteiro. O código tem 14 caracteres aleatórios, '
    + 'mas se ele vazar é só trocar no botão acima.'));

  // Monitor e espelho ficam na mesma coluna, um debaixo do outro: é assim que
  // dá para conferir de relance que o celular está mostrando a mesma linha,
  // só que virada. Separados por uma coluna, a comparação exigiria rolar.
  return el('div', { class: 'grid tp-grid' },
    el('div', { class: 'grid', style: 'align-content:start' },
      monitorOperador(script),
      sectionCard('O que o celular está vendo', [
        el('span', { class: 'tiny dim', text: espelhoLigado(script) ? 'espelhado' : 'sem espelho' }),
      ], painel(script, { classe: 'fone', espelhar: true }))),
    sectionCard('Abrir no celular', null, corpo));
}

const espelhoLigado = (script) => {
  const cfg = configDe(script.id);
  return cfg.espelhoH || cfg.espelhoV;
};

/**
 * O monitor do operador: a mesma leitura que está no ar, do lado certo.
 *
 * É a peça que faltava para gravar sozinho. O celular fica atrás do vidro e
 * mostra o texto invertido, como tem que ser; aqui do lado de cá dá para
 * acompanhar a linha, corrigir uma palavra e mandar rolar sem precisar
 * decifrar o próprio roteiro de trás para frente.
 */
function monitorOperador(script) {
  const caixa = el('div', { class: 'tp-monitor' }, painel(script, { classe: 'monitor', espelhar: false }));

  const btnTela = el('button', {
    class: 'btn sm', text: '⛶  Tela cheia',
    title: 'Joga o monitor em tela cheia — use num segundo monitor durante a gravação',
    onclick: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else caixa.requestFullscreen?.().catch((e) => toast(`A tela cheia foi recusada (${e.message}).`, 'err'));
    },
  });

  return sectionCard('Monitor do operador', [btnTela],
    el('p', { class: 'tiny dim', style: 'margin-top:0' },
      'Esta tela nunca espelha. O espelho é do vidro do teleprompter — ele vale para o celular, não para quem opera.'),
    caixa,
    transporte(script.id));
}

/* ============================ rolagem ============================ */

/** Posição atual em linhas, considerando o tempo desde que a rolagem começou. */
function posicaoAtual(cfg) {
  if (!vivo.rodando) return vivo.pos;
  const decorrido = (performance.now() - vivo.t0) / 1000;
  return vivo.pos + (decorrido * cfg.velocidade) / 60;
}

function alternarRolagem(scriptId) {
  const cfg = configDe(scriptId);
  if (vivo.rodando) {
    vivo.pos = posicaoAtual(cfg);
    vivo.rodando = false;
  } else {
    vivo.t0 = performance.now();
    vivo.rodando = true;
  }
  transmitirEstado(scriptId);
  sincronizarPlay();
  tocarLoop();
}

function irPara(scriptId, linhas) {
  vivo.pos = Math.max(0, linhas);
  vivo.t0 = performance.now();
  transmitirEstado(scriptId);
}

function pular(scriptId, direcao) {
  const cfg = configDe(scriptId);
  vivo.pos = Math.max(0, posicaoAtual(cfg) + direcao * 3);
  vivo.t0 = performance.now();
  transmitirEstado(scriptId);
}

/** Loop de animação do preview — só roda enquanto a tela está aberta. */
function tocarLoop() {
  cancelAnimationFrame(vivo.loop);
  const passo = () => {
    // Painéis que saíram da tela são descartados aqui: trocar de aba sem isso
    // deixaria o loop desenhando em nós órfãos para sempre.
    vivo.paineis = (vivo.paineis ?? []).filter((p) => p.trilho.isConnected);
    for (const p of vivo.paineis) {
      const cfg = p.getCfg();
      pintar(p.trilho, p.preview, p.getTexto(), cfg, posicaoAtual(cfg), { miniatura: true, espelhar: p.espelhar });
    }
    vivo.loop = requestAnimationFrame(passo);
  };
  vivo.loop = requestAnimationFrame(passo);
}

/**
 * Desenha o texto no trilho e o desloca conforme a posição.
 * A mesma função é usada no preview e (numa cópia) na página do exibidor.
 */
function pintar(trilho, caixa, texto, cfg, pos, { miniatura = false, espelhar = true } = {}) {
  const escala = miniatura ? (caixa.clientWidth || 420) / 900 : 1;
  const fonte = cfg.fonte * escala;
  const alturaLinha = fonte * cfg.altura;

  if (trilho.dataset.texto !== texto || trilho.dataset.cfg !== JSON.stringify(cfg) || trilho.dataset.escala !== String(escala)) {
    trilho.dataset.texto = texto;
    trilho.dataset.cfg = JSON.stringify(cfg);
    trilho.dataset.escala = String(escala);
    trilho.innerHTML = '';
    for (const linha of (texto || '').split('\n')) {
      const marcacao = /^\s*\[.*\]\s*$/.test(linha);
      trilho.append(el('p', {
        class: `tp-line ${marcacao ? 'cue' : ''}`,
        text: linha || ' ',
      }));
    }
    trilho.style.fontSize = `${fonte}px`;
    trilho.style.lineHeight = String(cfg.altura);
    trilho.style.padding = `0 ${cfg.margem}%`;
  }

  caixa.classList.toggle('fundo-claro', cfg.contraste === 'escuro');
  // O espelho é do vidro do teleprompter, não do texto: só a tela que vai
  // para o celular inverte. O monitor do operador desenha o mesmo estado
  // sempre do lado certo, senão ele opera lendo de trás para frente.
  trilho.style.transform = [
    `translateY(${-pos * alturaLinha}px)`,
    espelhar && cfg.espelhoH ? 'scaleX(-1)' : '',
    espelhar && cfg.espelhoV ? 'scaleY(-1)' : '',
  ].filter(Boolean).join(' ');
}

/* ============================ canal ============================ */

function garantirCanal(script) {
  if (!settings.isCloudConfigured()) return;
  const sala = script.sala;
  if (!sala) return;
  if (vivo.canal && vivo.sala === sala) return;

  fecharCanal();
  vivo.sala = sala;
  vivo.canal = conectar(`prompter:${sala}`, {
    url: settings.get('supabaseUrl'),
    chave: settings.get('supabaseKey'),
    onStatus: (estado) => {
      vivo.conexao = estado;
      atualizarStatusNaTela();
    },
    onMessage: (evento, dados) => {
      // O exibidor avisa que entrou; respondemos com o estado completo.
      if (evento === 'entrou') {
        vivo.exibidores = Math.min(9, vivo.exibidores + 1);
        vivo.ultimoPing = Date.now();
        atualizarStatusNaTela();
        transmitirEstado(script.id);
      } else if (evento === 'ping') {
        vivo.ultimoPing = Date.now();
      } else if (evento === 'saiu') {
        vivo.exibidores = Math.max(0, vivo.exibidores - 1);
        atualizarStatusNaTela();
      } else if (evento === 'comando') {
        vivo.ultimoPing = Date.now();
        aplicarComando(dados);
      }
    },
  });

  // Repete o estado de tempos em tempos: cobre exibidor que entrou no meio
  // ou que reconectou sem avisar.
  clearInterval(vivo.batida);
  vivo.batida = setInterval(() => {
    if (vivo.canal?.conectado) transmitirEstado(vivo.scriptId);
    if (vivo.exibidores && Date.now() - vivo.ultimoPing > 30000) {
      vivo.exibidores = 0;
      atualizarStatusNaTela();
    }
  }, 5000);
}

/**
 * Um comando vindo do celular exibidor.
 *
 * Quem mexe no celular não vira dono do estado — só pede. O editor aplica com
 * as mesmas funções dos botões daqui e retransmite o estado inteiro, e é isso
 * que impede as duas telas de divergirem: existe uma versão da verdade, e ela
 * mora de um lado só. Se o celular guardasse a própria posição, bastaria um
 * pacote perdido para o apresentador ler uma linha e o operador ver outra.
 */
function aplicarComando(dados) {
  const id = vivo.scriptId;
  if (!id) return;
  const valor = Number(dados?.valor);

  switch (dados?.acao) {
    case 'alternar': alternarRolagem(id); break;
    case 'ir': if (Number.isFinite(valor)) irPara(id, valor); break;
    case 'pular': if (Number.isFinite(valor)) pular(id, valor); break;
    case 'inicio': irPara(id, 0); break;
    case 'velocidade': {
      if (!Number.isFinite(valor)) break;
      const cfg = configDe(id);
      // A rolagem já corrida vira posição antes de trocar o passo, senão a
      // velocidade nova reescreveria o tempo passado e o texto daria um salto.
      vivo.pos = posicaoAtual(cfg);
      vivo.t0 = performance.now();
      aplicarConfig(id, { velocidade: clamp(Math.round(valor), 20, 400) });
      break;
    }
    default: break;
  }
}

function fecharCanal() {
  vivo.canal?.fechar();
  vivo.canal = null;
  vivo.sala = null;
  vivo.exibidores = 0;
  clearInterval(vivo.batida);
}

function atualizarStatusNaTela() {
  const alvo = document.querySelector('.tabs .pill');
  if (!alvo) return;
  alvo.replaceWith(statusConexao());
}

function transmitir(scriptId, patch) {
  if (!vivo.canal) return;
  vivo.canal.enviar('estado', { ...estadoCompleto(scriptId), ...patch });
}

const transmitirEstado = (scriptId) => transmitir(scriptId, {});

function estadoCompleto(scriptId) {
  const script = store.get('scripts', scriptId);
  const cfg = { ...PADRAO, ...(script?.config ?? {}) };
  return {
    texto: script?.body ?? '',
    ...cfg,
    rodando: vivo.rodando,
    pos: vivo.rodando ? vivo.pos : posicaoAtual(cfg),
    // o exibidor usa o próprio relógio a partir do momento em que recebe
    t0: vivo.rodando ? (performance.now() - vivo.t0) / 1000 : 0,
  };
}

const configDe = (scriptId) => ({ ...PADRAO, ...(store.get('scripts', scriptId)?.config ?? {}) });

/* ============================ persistência ============================ */

let salvarTimer = null;
function agendarSalvar(id, patch) {
  clearTimeout(salvarTimer);
  salvarTimer = setTimeout(() => store.save('scripts', { id, ...patch }), 600);
}

async function aplicarConfig(scriptId, patch) {
  const script = store.get('scripts', scriptId);
  const config = { ...PADRAO, ...(script?.config ?? {}), ...patch };
  await store.save('scripts', { id: scriptId, config });
  transmitir(scriptId, patch);
  sincronizarControles(config);
  for (const p of vivo.paineis ?? []) {
    if (p.trilho.isConnected) pintar(p.trilho, p.preview, p.getTexto(), config, posicaoAtual(config), { miniatura: true, espelhar: p.espelhar });
  }
}

async function trocarScript(id) {
  vivo.scriptId = id;
  vivo.pos = 0;
  vivo.rodando = false;
  fecharCanal();
  emit('nav:refresh');
}

async function novoScript() {
  const v = await formModal({
    title: 'Novo roteiro',
    values: { titulo: '' },
    fields: [{ name: 'titulo', label: 'Título', required: true, placeholder: 'Boletim das 12h, abertura do programa…' }],
  });
  if (!v?.titulo?.trim()) return;
  const script = await store.save('scripts', {
    title: v.titulo.trim(),
    body: '',
    sala: novaSala(),
    config: { ...PADRAO },
  });
  vivo.scriptId = script.id;
  vivo.pos = 0;
  vivo.rodando = false;
  fecharCanal();
  emit('nav:refresh');
}

async function renomear(script) {
  const v = await formModal({
    title: 'Renomear roteiro',
    values: { titulo: script.title },
    fields: [{ name: 'titulo', label: 'Título', required: true }],
  });
  if (!v?.titulo?.trim()) return;
  await store.save('scripts', { id: script.id, title: v.titulo.trim() });
  emit('nav:refresh');
}

async function excluir(script) {
  if (!await confirmDialog(`Excluir o roteiro "${script.title}"?`, { danger: true, okLabel: 'Excluir' })) return;
  await store.remove('scripts', script.id);
  fecharCanal();
  vivo.scriptId = null;
  emit('nav:refresh');
}

function exportar(script) {
  download(`${script.title.replace(/[^\w-]+/g, '-').toLowerCase()}.txt`, script.body ?? '', 'text/plain');
  toast('Roteiro exportado.', 'ok');
}

/* ============================ auxiliares ============================ */

/**
 * O exibidor é um arquivo estático servido pelo mesmo endereço do hub.
 *
 * Já foi uma Edge Function do Supabase, e não funcionava: o gateway deles
 * reescreve a resposta para `text/plain` e injeta um CSP de sandbox — é a
 * proteção contra usar função como hospedagem de página. O celular lia o QR e
 * recebia o código-fonte na tela, em texto puro, em vez do teleprompter.
 *
 * Como arquivo estático o servidor manda `text/html` e a página abre. E
 * sumiram dois passos manuais que só existiam para chegar até aqui: publicar
 * a função e lembrar do `--no-verify-jwt`.
 *
 * O projeto e a chave só entram na URL quando fogem do padrão embutido na
 * página — QR curto é QR que a câmera lê de primeira.
 */
function urlDoExibidor(script) {
  const url = new URL('exibidor.html', `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`);
  url.searchParams.set('s', script.sala ?? '');

  const projeto = String(settings.get('supabaseUrl') || '').replace(/\/+$/, '');
  const chave = String(settings.get('supabaseKey') || '');
  if (projeto && projeto !== PROJETO_PADRAO) url.searchParams.set('p', projeto);
  if (chave && chave !== CHAVE_PADRAO) url.searchParams.set('k', chave);
  return url.toString();
}

// Os mesmos valores embutidos em exibidor.html. Se um dia divergirem, o QR
// passa a carregá-los explicitamente — que é o certo, só mais comprido.
const PROJETO_PADRAO = 'https://kikedkajnytdjncrkoxf.supabase.co';
const CHAVE_PADRAO = 'sb_publishable_XbwfA-SmyYnbIW9o9gm6hQ_XTbAX22m';

/**
 * Bate na página do exibidor para saber se ela já foi publicada.
 * Um 401 significa que a função existe mas exige login — que é justamente o
 * que impede o celular de abrir o link.
 */
/**
 * Confere se o exibidor abre — e, principalmente, se abre como PÁGINA.
 *
 * Responder 200 não basta: foi exatamente assim que a versão anterior falhou.
 * O servidor entregava a página com `text/plain`, o navegador não a
 * interpretava, e o celular mostrava o código-fonte na tela. Um verificador
 * que só olhasse o número teria dito "tudo certo".
 */
async function verificarExibidor(url) {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      return res.status === 404
        ? { ok: false, motivo: 'O arquivo exibidor.html não está publicado neste endereço. Ele vive junto do hub — se você publicou o JARBAS agora, espere o site atualizar.' }
        : { ok: false, motivo: `O exibidor respondeu ${res.status}.` };
    }
    const tipo = res.headers.get('content-type') ?? '';
    if (!/text\/html/i.test(tipo)) {
      return {
        ok: false,
        motivo: `O servidor está entregando o exibidor como "${tipo.split(';')[0] || 'tipo desconhecido'}" em vez de página. `
          + 'Assim o celular mostra o código-fonte em vez do texto.',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, motivo: 'Não consegui falar com o exibidor. Verifique a internet.' };
  }
}

/** Conta palavras/linhas e estima o tempo no ar. */
function medir(texto, velocidade) {
  const linhasBrutas = (texto || '').split('\n');
  const faladas = linhasBrutas.filter((l) => !/^\s*\[.*\]\s*$/.test(l));
  const palavras = faladas.join(' ').split(/\s+/).filter(Boolean).length;
  const linhas = linhasBrutas.length;
  // o tempo real depende da rolagem, então usamos a própria velocidade configurada
  const segundos = velocidade > 0 ? (linhas / velocidade) * 60 : 0;
  return { palavras, linhas, segundos };
}

function formatarTempo(segundos) {
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return m ? `${m}min ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function escreverComJarbas() {
  jarbas.askFrom(
    'Quero um roteiro para teleprompter. Pergunte o tema, a duração no ar e o tom, '
    + 'e então use a ferramenta criar_roteiro. Escreva para ser LIDO em voz alta: '
    + 'frases curtas, sem parênteses, sem siglas não explicadas, com marcações de operação entre colchetes.',
  );
}

/* ============================ ciclo de vida ============================ */

on('action:new-script', () => novoScript());

// Ao sair da tela, encerra o loop de animação; o canal continua para o
// exibidor não ficar órfão enquanto o operador dá uma olhada em outra seção.
on('nav:go', ({ view }) => {
  if (view !== 'teleprompter') {
    cancelAnimationFrame(vivo.loop);
    vivo.loop = null;
    vivo.paineis = [];
    vivo.botoesPlay = [];
    vivo.controles = [];
  } else {
    tocarLoop();
  }
});
