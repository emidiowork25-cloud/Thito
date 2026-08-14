// Voz do JARBAS: reconhecimento (STT), síntese (TTS) e medidor de nível.
//
// Usa a Web Speech API do navegador — roda 100% local, sem chave e sem custo.
// Chrome/Edge no Windows suportam pt-BR; Firefox não implementa SpeechRecognition
// (nesse caso a escuta é desativada e só a fala continua funcionando).
//
// Modos de escuta:
//   'off'  — microfone desligado
//   'ptt'  — push-to-talk: segure o botão ou Ctrl+Espaço
//   'wake' — escuta contínua; só aceita comando após a palavra-chave ("Jarbas")
//
// Eventos publicados no barramento:
//   voice:state   {listening, speaking, mode, awake}
//   voice:interim {text}          transcrição parcial
//   voice:final   {text}          comando pronto para o assistente
//   voice:level   {level}         0..1, energia do microfone (para o orbe)
//   voice:error   {code, message}

import { emit } from '../core/bus.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const synth = window.speechSynthesis || null;

export const sttSupported = !!SR;

/**
 * Explica por que a voz não funciona, no idioma do aparelho de quem lê.
 * Mandar um usuário de iPhone "usar o Chrome" é inútil: todo navegador no iOS
 * roda o mesmo motor do Safari, então o problema (e a solução) são outros.
 */
export function motivoSemVoz() {
  if (sttSupported) return '';
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) {
    return 'O iOS só reconhece voz no Safari, e às vezes não no app instalado na tela de início. '
      + 'Abra o JARBAS pelo Safari para ditar. A fala do JARBAS continua funcionando.';
  }
  return 'Este navegador não reconhece voz. Use Chrome ou Edge.';
}
export const ttsSupported = !!synth;

/** Variações que aceitamos como palavra-chave (fala reconhecida erra bastante). */
const WAKE_VARIANTS = [
  'jarbas', 'jarba', 'jarvas', 'jarvis', 'jarbes', 'jaubas', 'garbas',
  'jar bas', 'jarbás', 'járbas', 'jarbaz',
];

const state = {
  mode: 'off',
  listening: false,   // reconhecimento ativo
  speaking: false,    // sintetizador falando
  awake: false,       // palavra-chave detectada, aguardando o comando
  allowBargeIn: true, // interromper a fala quando o usuário falar
  lang: 'pt-BR',
  rate: 1.05,
  pitch: 1,
  volume: 1,
  voiceURI: null,
  timbre: 'fusao',
};

let rec = null;
let wantListening = false;     // intenção do usuário (independe de reinícios internos)
let restartTimer = null;
let silenceTimer = null;
let janelaTimer = null;        // janela de resposta aberta após ele falar
let pendingCommand = '';
let lastStart = 0;
let consecutiveFails = 0;

/* ============================ estado ============================ */

export const getState = () => ({ ...state });

function publish() {
  emit('voice:state', getState());
}

function setStatus(patch) {
  Object.assign(state, patch);
  publish();
}

/* ============================ STT ============================ */

function build() {
  if (!SR) return null;
  const r = new SR();
  r.lang = state.lang;
  r.continuous = true;
  r.interimResults = true;
  r.maxAlternatives = 1;

  r.onstart = () => {
    consecutiveFails = 0;
    setStatus({ listening: true });
  };

  r.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }

    // Barge-in: o usuário começou a falar enquanto JARBAS falava.
    if ((interim.trim() || final.trim()) && state.speaking && state.allowBargeIn) stopSpeaking();

    if (interim.trim()) emit('voice:interim', { text: interim.trim() });
    if (final.trim()) handleFinal(final.trim());
  };

  r.onerror = (event) => {
    const code = event.error;
    // 'no-speech' e 'aborted' são rotina em escuta contínua — não são falhas reais.
    if (code === 'no-speech' || code === 'aborted') return;
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      wantListening = false;
      setStatus({ mode: 'off', listening: false });
      emit('voice:error', { code, message: 'Permissão de microfone negada. Autorize o microfone no navegador.' });
      return;
    }
    consecutiveFails++;
    emit('voice:error', { code, message: `Falha no reconhecimento de voz (${code}).` });
  };

  r.onend = () => {
    setStatus({ listening: false });
    // O Chrome encerra sozinho após silêncio; reinicia enquanto o usuário quiser ouvir.
    if (wantListening && state.mode === 'wake') scheduleRestart();
  };

  return r;
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  // recuo progressivo se algo estiver falhando em sequência
  const delay = consecutiveFails > 3 ? Math.min(8000, 400 * 2 ** (consecutiveFails - 3)) : 300;
  restartTimer = setTimeout(() => { if (wantListening) startRecognition(); }, delay);
}

function startRecognition() {
  if (!SR || state.listening) return;
  // proteção contra loop de reinício muito rápido
  if (Date.now() - lastStart < 250) { scheduleRestart(); return; }
  lastStart = Date.now();
  rec ||= build();
  if (!rec) return;
  rec.lang = state.lang;
  try {
    rec.start();
  } catch {
    // InvalidStateError: já iniciado — o onend cuidará do reinício
  }
}

function stopRecognition() {
  clearTimeout(restartTimer);
  clearTimeout(silenceTimer);
  if (!rec) return;
  try { rec.stop(); } catch { /* já parado */ }
}

/**
 * Trata uma transcrição finalizada conforme o modo.
 * No modo 'wake', ignora tudo até ouvir a palavra-chave; no 'ptt', tudo é comando.
 */
function handleFinal(text) {
  if (state.mode === 'ptt') {
    pendingCommand = `${pendingCommand} ${text}`.trim();
    armSilence(900);
    return;
  }

  const stripped = stripWake(text);
  if (state.awake) {
    pendingCommand = `${pendingCommand} ${stripped ?? text}`.trim();
    armSilence(1400);
    return;
  }
  if (stripped !== null) {
    setStatus({ awake: true });
    pendingCommand = stripped;
    // Só a palavra-chave, sem comando: espera mais tempo pelo que vem em seguida.
    armSilence(stripped ? 1400 : 4500);
  }
}

/** Dispara o comando após um período de silêncio. */
function armSilence(ms) {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    clearTimeout(janelaTimer);
    const cmd = pendingCommand.trim();
    pendingCommand = '';
    setStatus({ awake: false });
    if (cmd) emit('voice:final', { text: cmd });
  }, ms);
}

/**
 * Deixa a linha aberta por um tempo depois que ele termina de responder.
 *
 * Sem isto não existe conversa, existe consulta: cada frase exigia dizer
 * "Jarbas" de novo, então perguntar "e amanhã?" logo depois de "o que eu tenho
 * hoje?" simplesmente não era ouvido. Com a janela aberta, a continuação vale
 * como comando — que é como se fala com alguém que acabou de te responder.
 *
 * Fecha sozinha no silêncio: o microfone não fica de porta aberta à toa.
 */
export function abrirJanelaDeResposta(ms = 9000) {
  if (state.mode !== 'wake' || !wantListening) return;
  clearTimeout(janelaTimer);
  clearTimeout(silenceTimer);
  pendingCommand = '';
  setStatus({ awake: true });
  janelaTimer = setTimeout(() => {
    if (!pendingCommand.trim()) setStatus({ awake: false });
  }, ms);
}

/**
 * Remove a palavra-chave do início da frase.
 * @returns o restante da frase, '' se só houver a palavra-chave, ou null se não houver palavra-chave.
 */
function stripWake(text) {
  const clean = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const w of WAKE_VARIANTS) {
    const bare = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const idx = clean.indexOf(bare);
    if (idx === -1) continue;
    // aceita a palavra-chave nos primeiros ~30 caracteres da frase
    if (idx > 30) continue;
    return text.slice(0).replace(new RegExp(`^.{0,${idx + bare.length}}`, 'i'), '')
      .replace(/^[\s,.:!?]+/, '').trim();
  }
  return null;
}

/* ============================ API pública de escuta ============================ */

export function setMode(mode) {
  if (!sttSupported && mode !== 'off') {
    emit('voice:error', { code: 'unsupported', message: 'Este navegador não reconhece voz. Use Chrome ou Edge.' });
    return;
  }
  setStatus({ mode, awake: false });
  pendingCommand = '';
  if (mode === 'wake') {
    wantListening = true;
    startMeter();
    startRecognition();
  } else {
    wantListening = false;
    stopRecognition();
    stopMeter();
  }
}

/** Push-to-talk: começa a capturar enquanto o botão/atalho estiver pressionado. */
export function pushToTalkStart() {
  if (!sttSupported) {
    emit('voice:error', { code: 'unsupported', message: 'Este navegador não reconhece voz. Use Chrome ou Edge.' });
    return;
  }
  stopSpeaking();
  const previous = state.mode;
  if (previous === 'wake') stopRecognition();
  setStatus({ mode: 'ptt', awake: true });
  pendingCommand = '';
  wantListening = true;
  startMeter();
  clearTimeout(silenceTimer);
  startRecognition();
}

/** Solta o push-to-talk: envia o que foi capturado e volta ao modo anterior. */
export function pushToTalkEnd(previousMode = 'off') {
  if (state.mode !== 'ptt') return;
  stopRecognition();
  clearTimeout(silenceTimer);
  const cmd = pendingCommand.trim();
  pendingCommand = '';
  setStatus({ mode: previousMode, awake: false });
  if (cmd) emit('voice:final', { text: cmd });
  if (previousMode === 'wake') { wantListening = true; setTimeout(startRecognition, 250); }
  else { wantListening = false; stopMeter(); }
}

/* ============================ TTS ============================ */

let voices = [];
let resumeTicker = null;

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices() || [];
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

/*
 * ---------------------------------------------------------------------------
 * Timbre: a fusão de uma voz masculina com uma feminina
 * ---------------------------------------------------------------------------
 *
 * Uma ressalva honesta antes do código, porque ela muda o que dá para esperar:
 * o sintetizador do navegador fala UM enunciado por vez, em fila. Não existe
 * mixagem, não existe saída de áudio para manipular, não há como somar duas
 * vozes no mesmo instante. Sobrepor de verdade só com um serviço de fala
 * externo — chave, custo e a frase saindo da casa para ser gerada.
 *
 * A fusão que dá para fazer aqui é de TIMBRE, e ela é real: puxa-se a voz
 * masculina para cima e a feminina para baixo até as duas se encontrarem numa
 * faixa que não é de nenhuma das duas. É o que soa quando ele fala.
 */
const FUSAO = { m: 1.30, f: 0.80 };

/** Vozes pt-BR que os sistemas costumam instalar, por registro. */
const MASCULINAS = /\b(daniel|antonio|antônio|felipe|donato|fabio|fábio|humberto|julio|júlio|nicolau|valerio|valério|ricardo|eddy|reed|rocko|junior)\b/i;
const FEMININAS = /\b(maria|luciana|joana|francisca|thalita|brenda|elza|giovanna|leila|leticia|letícia|manuela|yara|helena|camila|vitoria|vitória|sandy|shelley|google)\b/i;

/** Masculina, feminina ou desconhecida — pelo nome, que é tudo que a API dá. */
export function registroDaVoz(nome = '') {
  if (MASCULINAS.test(nome)) return 'm';
  if (FEMININAS.test(nome)) return 'f';
  return '?';
}

export function listVoices() {
  loadVoices();
  const pt = voices.filter((v) => /^pt/i.test(v.lang));
  return (pt.length ? pt : voices).map((v) => ({
    uri: v.voiceURI, name: v.name, lang: v.lang, registro: registroDaVoz(v.name),
  }));
}

const emPtBr = () => {
  loadVoices();
  const br = voices.filter((v) => /pt[-_]BR/i.test(v.lang));
  return br.length ? br : voices.filter((v) => /^pt/i.test(v.lang));
};

const primeiraDoRegistro = (r) => emPtBr().find((v) => registroDaVoz(v.name) === r) ?? null;

/**
 * Decide com que voz e em que tom a próxima frase sai.
 *
 * A voz escolhida à mão nos Ajustes sempre vence — o timbre então só decide o
 * quanto puxar o tom dela. Quem não escolheu nenhuma recebe a melhor pt-BR do
 * registro pedido.
 */
function escolherVoz() {
  loadVoices();
  const escolhida = state.voiceURI ? voices.find((v) => v.voiceURI === state.voiceURI) : null;

  const alvo = state.timbre === 'masculina' ? 'm' : state.timbre === 'feminina' ? 'f' : null;
  const voz = escolhida
    ?? (alvo ? primeiraDoRegistro(alvo) : null)
    // Na fusão tanto faz de onde partir: o tom leva as duas ao mesmo lugar.
    ?? (state.timbre === 'fusao' ? primeiraDoRegistro('m') ?? primeiraDoRegistro('f') : null)
    ?? emPtBr()[0]
    ?? voices[0]
    ?? null;

  let tom = state.pitch;
  if (state.timbre === 'fusao') {
    const r = registroDaVoz(voz?.name ?? '');
    // Registro desconhecido fica como está: chutar aqui é estragar uma voz que
    // talvez já estivesse boa.
    if (FUSAO[r]) tom = Math.min(2, Math.max(0, state.pitch * FUSAO[r]));
  }
  return { voz, tom };
}

/**
 * Prepara o texto para ser falado: remove marcação, emojis e ruído visual,
 * e traduz símbolos que soariam estranhos lidos literalmente.
 */
export function speakable(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' — trecho de código omitido — ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_#>]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/https?:\/\/\S+/g, ' link ')
    // "R$ 1.250,90" -> "1250 reais e 90 centavos" (o sintetizador lê melhor assim)
    .replace(/R\$\s?(\d[\d.]*)(?:,(\d{2}))?/g, (_, inteiro, centavos) => {
      const reais = inteiro.replace(/\./g, '');
      const base = `${reais} ${reais === '1' ? 'real' : 'reais'}`;
      return centavos && centavos !== '00' ? `${base} e ${Number(centavos)} centavos` : base;
    })
    .replace(/(\d)\s*%/g, '$1 por cento')
    .replace(/\bvs\.?\b/gi, 'contra')
    .replace(/•/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Corte de frase feito com marcador, e não com lookbehind.
//
// `/(?<=[.!?…:])\s+/` é a forma natural de escrever isto, e foi como estava —
// mas lookbehind é ERRO DE SINTAXE no Safari anterior ao 16.4. Erro de sintaxe
// num módulo não falha só a função: derruba o módulo, e com ele todo o resto
// que o importa. Este arquivo entra na cadeia do boot, então o preço era o app
// inteiro em tela branca no iPhone, sem mensagem nenhuma explicando por quê.
const MARCA = '';

/** Quebra em frases para o sintetizador começar a falar antes do texto todo. */
function chunk(text, max = 200) {
  const parts = text
    .replaceAll(MARCA, ' ')
    .replace(/([.!?…:])\s+/g, `$1${MARCA}`)
    .split(MARCA);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + ' ' + p).trim().length > max && buf) { out.push(buf.trim()); buf = p; }
    else buf = `${buf} ${p}`.trim();
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export function speak(text, { onEnd } = {}) {
  if (!synth) { onEnd?.(); return; }
  const clean = speakable(text);
  if (!clean) { onEnd?.(); return; }

  stopSpeaking();

  // Em escuta contínua, silencia o microfone enquanto fala para não se ouvir.
  const wasWake = state.mode === 'wake' && state.listening;
  if (wasWake && !state.allowBargeIn) stopRecognition();

  const pieces = chunk(clean);
  const { voz, tom } = escolherVoz();
  setStatus({ speaking: true });
  keepAlive(true);

  pieces.forEach((piece, i) => {
    const u = new SpeechSynthesisUtterance(piece);
    u.lang = state.lang;
    u.rate = state.rate;
    u.pitch = tom;
    u.volume = state.volume;
    if (voz) u.voice = voz;
    if (i === pieces.length - 1) {
      u.onend = () => {
        keepAlive(false);
        setStatus({ speaking: false });
        if (wasWake && wantListening) setTimeout(startRecognition, 200);
        onEnd?.();
      };
      u.onerror = u.onend;
    }
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (!synth) return;
  keepAlive(false);
  try { synth.cancel(); } catch { /* ignora */ }
  if (state.speaking) setStatus({ speaking: false });
}

/** Contorna o bug do Chrome que corta a fala após ~15 s. */
function keepAlive(on) {
  clearInterval(resumeTicker);
  resumeTicker = null;
  if (!on || !synth) return;
  resumeTicker = setInterval(() => {
    if (!synth.speaking) { clearInterval(resumeTicker); resumeTicker = null; return; }
    synth.pause();
    synth.resume();
  }, 9000);
}

/* ============================ medidor de nível ============================ */

let audioCtx = null;
let analyser = null;
let micStream = null;
let meterRaf = null;

async function startMeter() {
  if (analyser || !navigator.mediaDevices?.getUserMedia) return;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
      emit('voice:level', { level: Math.min(1, peak * 2.2) });
      meterRaf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    // Sem permissão para o medidor: a escuta ainda funciona, só não há visualização.
    analyser = null;
  }
}

function stopMeter() {
  cancelAnimationFrame(meterRaf);
  meterRaf = null;
  analyser = null;
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  emit('voice:level', { level: 0 });
}

/* ============================ preferências ============================ */

export const TIMBRES = [
  ['fusao', 'fusão — entre a masculina e a feminina'],
  ['masculina', 'masculina'],
  ['feminina', 'feminina'],
  ['sistema', 'como o sistema entrega'],
];

export function configure(prefs = {}) {
  const { rate, pitch, volume, voiceURI, lang, allowBargeIn, timbre } = prefs;
  if (Number.isFinite(rate)) state.rate = Math.min(2, Math.max(0.5, rate));
  if (Number.isFinite(pitch)) state.pitch = Math.min(2, Math.max(0, pitch));
  if (Number.isFinite(volume)) state.volume = Math.min(1, Math.max(0, volume));
  if (voiceURI !== undefined) state.voiceURI = voiceURI || null;
  if (lang) state.lang = lang;
  if (allowBargeIn !== undefined) state.allowBargeIn = !!allowBargeIn;
  if (timbre && TIMBRES.some(([k]) => k === timbre)) state.timbre = timbre;
  publish();
}

/** Como a voz atual está saindo — para os Ajustes explicarem o que se ouve. */
export function descreverVoz() {
  const { voz, tom } = escolherVoz();
  if (!voz) return 'Nenhuma voz instalada neste aparelho.';
  const r = { m: 'masculina', f: 'feminina', '?': 'de registro indefinido' }[registroDaVoz(voz.name)];
  if (state.timbre !== 'fusao' || tom === state.pitch) return `${voz.name} (${r}).`;
  const lado = tom > state.pitch ? 'subindo' : 'baixando';
  return `${voz.name}, ${r}, ${lado} o tom para o meio (${tom.toFixed(2)}).`;
}

/** Frase curta para o usuário testar a voz configurada. */
export function preview() {
  speak('Sistemas prontos. Sou o JARBAS, e estou ao seu dispor.');
}

export function shutdown() {
  wantListening = false;
  clearTimeout(janelaTimer);
  stopRecognition();
  stopSpeaking();
  stopMeter();
  setStatus({ mode: 'off', awake: false });
}
