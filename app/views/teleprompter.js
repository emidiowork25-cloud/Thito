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
}

function statusConexao() {
  const rotulos = { aberto: 'canal aberto', conectando: 'conectando…', fechado: 'sem canal' };
  const classe = vivo.conexao === 'aberto' ? 'ok' : vivo.conexao === 'conectando' ? 'warn' : 'bad';
  const texto = vivo.exibidores > 0
    ? `${vivo.exibidores} exibidor(es) ligado(s)`
    : rotulos[vivo.conexao] ?? vivo.conexao;
  return el('span', { class: `pill ${classe}`, text: texto });
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
    transmitir(script.id, { texto: area.value });
    desenharPreview();
  });

  const contagem = el('div', { class: 'tp-count tiny dim' });
  const atualizarContagem = () => {
    const { palavras, linhas, segundos } = medir(area.value, cfg.velocidade);
    contagem.textContent = `${palavras} palavras · ${linhas} linhas · ~${formatarTempo(segundos)} no ar`;
  };
  atualizarContagem();

  /* --- transporte --- */
  const btnPlay = el('button', { class: 'btn primary', text: vivo.rodando ? '⏸  Pausar' : '▶  Rolar' });
  btnPlay.addEventListener('click', () => {
    alternarRolagem(script.id);
    btnPlay.textContent = vivo.rodando ? '⏸  Pausar' : '▶  Rolar';
  });

  const transporte = el('div', { class: 'tp-transport' },
    btnPlay,
    el('button', { class: 'btn', text: '⏮  Início', onclick: () => irPara(script.id, 0) }),
    el('button', { class: 'btn', text: '−1 par.', onclick: () => pular(script.id, -1) }),
    el('button', { class: 'btn', text: '+1 par.', onclick: () => pular(script.id, 1) }),
  );

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
  const preview = el('div', { class: 'tp-preview' });
  const trilho = el('div', { class: 'tp-track' });
  preview.append(el('div', { class: 'tp-cue' }), trilho);

  const desenharPreview = () => pintar(trilho, preview, area.value, { ...cfg, ...(store.get('scripts', script.id)?.config ?? {}) }, vivo.pos, true);
  vivo.desenharPreview = desenharPreview;
  vivo.previewNodes = { trilho, preview, getTexto: () => area.value, getCfg: () => ({ ...PADRAO, ...(store.get('scripts', script.id)?.config ?? {}) }) };
  setTimeout(desenharPreview, 0);

  return el('div', { class: 'grid tp-grid' },
    sectionCard(script.title, [
      el('button', { class: 'btn sm', text: 'Renomear', onclick: () => renomear(script) }),
      el('button', { class: 'btn sm', text: 'Exportar', onclick: () => exportar(script) }),
      el('button', { class: 'btn sm danger', text: 'Excluir', onclick: () => excluir(script) }),
    ], area, contagem),
    el('div', { class: 'grid', style: 'align-content:start' },
      sectionCard('No ar', null, transporte, preview),
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
  return el('div', { class: 'field' },
    el('label', { style: 'display:flex;justify-content:space-between' },
      el('span', { text: rotulo }), saida),
    input);
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
    + 'tudo o que você mudar aqui: texto, velocidade, tamanho da fonte e rolagem.'));

  // Confere se a página do exibidor já está no ar e, se não estiver, diz exatamente o que fazer.
  const diagnostico = el('div', { class: 'tiny dim', style: 'margin-bottom:12px', text: 'verificando o exibidor…' });
  corpo.append(diagnostico);
  verificarExibidor(url).then((r) => {
    if (r.ok) {
      diagnostico.className = 'ok-box tiny';
      diagnostico.textContent = 'Exibidor publicado e respondendo. Pode ler o QR.';
      return;
    }
    diagnostico.className = 'aviso';
    diagnostico.replaceChildren(
      el('div', { style: 'margin-bottom:6px', text: r.motivo }),
      el('div', { class: 'mono tiny', style: 'user-select:all', text: 'supabase functions deploy prompter --no-verify-jwt' }),
    );
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
    el('div', { text: 'No celular:' }),
    el('div', { text: '• Toque na tela para entrar em tela cheia e travar o brilho.' }),
    el('div', { text: '• A tela não apaga sozinha enquanto o exibidor estiver aberto.' }),
    el('div', { text: '• Se cair a rede, ele reconecta e volta de onde parou.' })));

  corpo.append(el('div', { class: 'aviso', style: 'margin-top:14px' },
    'Quem tiver este link vê o seu roteiro. O código tem 14 caracteres aleatórios, '
    + 'mas se ele vazar é só trocar no botão acima.'));

  return el('div', { class: 'grid tp-grid' },
    sectionCard('Abrir no celular', null, corpo),
    sectionCard('O que o celular está vendo', null, painelEspelho(script)));
}

/** Miniatura fiel do que o exibidor mostra agora. */
function painelEspelho(script) {
  const cfg = { ...PADRAO, ...(script.config ?? {}) };
  const preview = el('div', { class: 'tp-preview grande' });
  const trilho = el('div', { class: 'tp-track' });
  preview.append(el('div', { class: 'tp-cue' }), trilho);

  vivo.previewNodes = {
    trilho, preview,
    getTexto: () => store.get('scripts', script.id)?.body ?? '',
    getCfg: () => ({ ...PADRAO, ...(store.get('scripts', script.id)?.config ?? {}) }),
  };
  setTimeout(() => pintar(trilho, preview, script.body ?? '', cfg, vivo.pos, true), 0);

  const btn = el('button', { class: 'btn primary', style: 'width:100%;margin-top:12px', text: vivo.rodando ? '⏸  Pausar' : '▶  Rolar' });
  btn.addEventListener('click', () => {
    alternarRolagem(script.id);
    btn.textContent = vivo.rodando ? '⏸  Pausar' : '▶  Rolar';
  });

  return el('div', {}, preview, btn);
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
    const nodes = vivo.previewNodes;
    if (nodes?.trilho?.isConnected) {
      const cfg = nodes.getCfg();
      pintar(nodes.trilho, nodes.preview, nodes.getTexto(), cfg, posicaoAtual(cfg), true);
    }
    vivo.loop = requestAnimationFrame(passo);
  };
  vivo.loop = requestAnimationFrame(passo);
}

/**
 * Desenha o texto no trilho e o desloca conforme a posição.
 * A mesma função é usada no preview e (numa cópia) na página do exibidor.
 */
function pintar(trilho, caixa, texto, cfg, pos, miniatura) {
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
  trilho.style.transform = [
    `translateY(${-pos * alturaLinha}px)`,
    cfg.espelhoH ? 'scaleX(-1)' : '',
    cfg.espelhoV ? 'scaleY(-1)' : '',
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
    onMessage: (evento) => {
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
  const nodes = vivo.previewNodes;
  if (nodes?.trilho?.isConnected) {
    pintar(nodes.trilho, nodes.preview, nodes.getTexto(), config, posicaoAtual(config), true);
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

function urlDoExibidor(script) {
  const base = String(settings.get('supabaseUrl') || '').replace(/\/+$/, '');
  return `${base}/functions/v1/prompter?s=${encodeURIComponent(script.sala ?? '')}`;
}

/**
 * Bate na página do exibidor para saber se ela já foi publicada.
 * Um 401 significa que a função existe mas exige login — que é justamente o
 * que impede o celular de abrir o link.
 */
async function verificarExibidor(url) {
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, motivo: 'O exibidor exige login, então o celular não consegue abrir. Republique-o como página pública:' };
    }
    if (res.status === 404) {
      return { ok: false, motivo: 'A página do exibidor ainda não foi publicada no seu projeto. Rode uma vez, na pasta do THITO:' };
    }
    return { ok: false, motivo: `O exibidor respondeu ${res.status}. Tente publicar de novo:` };
  } catch {
    return { ok: false, motivo: 'Não consegui falar com o exibidor (sem internet ou função não publicada). Se for o segundo caso, rode:' };
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
    vivo.previewNodes = null;
  } else {
    tocarLoop();
  }
});
