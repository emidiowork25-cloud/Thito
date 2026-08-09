// JARBAS — o assistente. Junta voz, contexto, ferramentas e a conversa com o Claude.
//
// O laço de ferramentas roda aqui, no navegador: a Edge Function é só um proxy
// que guarda a chave da API. Assim o Claude age sobre os seus dados sem que eles
// precisem ser copiados para lugar nenhum além do resumo de contexto.

import * as voice from './voice.js';
import * as tools from './tools.js';
import * as ctx from './context.js';
import { createFace } from './face.js';
import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as sb from '../core/supabase.js';
import { on, emit } from '../core/bus.js';
import { $, el, mdlite, uid, truncate, today } from '../core/util.js';
import { toast } from '../ui/components.js';

const MAX_TOOL_ROUNDS = 6;

const ui = {};
let orb = null;
let messages = [];       // histórico no formato da API
let chatId = null;
let busy = false;
let previousVoiceMode = 'off';
let heardTimer = null;

/* ============================ inicialização ============================ */

export function init() {
  ui.panel = $('#jarbas');
  ui.log = $('#jarbas-log');
  ui.form = $('#jarbas-form');
  ui.input = $('#jarbas-input');
  ui.send = ui.form.querySelector('.send-btn');
  ui.mic = $('#jarbas-mic');
  ui.state = $('#jarbas-state');
  ui.heard = $('#jarbas-heard');
  ui.suggest = $('#jarbas-suggest');
  ui.voiceToggle = $('#jarbas-voice-toggle');
  ui.speakToggle = $('#jarbas-speak-toggle');

  orb = createFace($('#jarbas-face'));

  wireForm();
  wireVoice();
  wireControls();

  voice.configure({
    rate: settings.get('voiceRate'),
    pitch: settings.get('voicePitch'),
    volume: settings.get('voiceVolume'),
    voiceURI: settings.get('voiceURI'),
    allowBargeIn: settings.get('allowBargeIn'),
  });

  ui.speakToggle.setAttribute('aria-pressed', String(!!settings.get('speakReplies')));
  if (!voice.sttSupported) {
    ui.mic.classList.add('off');
    ui.voiceToggle.disabled = true;
    ui.voiceToggle.title = voice.motivoSemVoz();
  }

  newConversation({ silent: true });
  renderSuggestions();

  on('settings:changed', (s) => {
    voice.configure({
      rate: s.voiceRate, pitch: s.voicePitch, volume: s.voiceVolume,
      voiceURI: s.voiceURI, allowBargeIn: s.allowBargeIn,
    });
    ui.speakToggle.setAttribute('aria-pressed', String(!!s.speakReplies));
  });

  on('data:changed', () => { if (!busy) renderSuggestions(); });
}

/* ============================ painel ============================ */

export function open({ focus = true } = {}) {
  document.getElementById('app').classList.add('jarbas-open');
  if (focus) ui.input.focus();
  maybeGreet();
}

export function close() {
  document.getElementById('app').classList.remove('jarbas-open');
}

export function toggle() {
  const app = document.getElementById('app');
  if (app.classList.contains('jarbas-open')) close();
  else open();
}

export const isOpen = () => document.getElementById('app').classList.contains('jarbas-open');

let greeted = false;
function maybeGreet() {
  if (greeted) return;
  greeted = true;
  if (!settings.get('greetOnOpen')) return;
  const texto = `${ctx.greeting()} ${ctx.briefing()}`;
  push('jarbas', texto);
  if (settings.get('speakReplies')) speak(texto);
}

/* ============================ conversa ============================ */

export async function newConversation({ silent = false } = {}) {
  await persist();
  messages = [];
  chatId = uid();
  ui.log.innerHTML = '';
  if (!silent) {
    push('jarbas', `${ctx.greeting()} Do que você precisa?`);
    renderSuggestions();
  }
}

/** Salva a conversa atual para virar histórico consultável depois. */
async function persist() {
  if (!chatId || messages.length < 2) return;
  const primeiraFala = messages.find((m) => m.role === 'user');
  const titulo = truncate(textOf(primeiraFala?.content) || 'Conversa', 90);
  await store.save('chats', {
    id: chatId,
    title: titulo,
    date: today(),
    turns: messages.length,
    messages: messages.slice(-40),
  }, { silent: true });
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

/* ============================ envio ============================ */

export async function ask(text) {
  const pergunta = String(text || '').trim();
  if (!pergunta || busy) return;

  hideHeard();
  push('user', pergunta);
  messages.push({ role: 'user', content: pergunta });
  ui.input.value = '';
  autosize();
  setBusy(true);

  try {
    await runLoop();
  } catch (err) {
    console.error('[jarbas]', err);
    push('erro', friendlyError(err));
  } finally {
    setBusy(false);
    renderSuggestions();
    persist();
  }
}

/** Laço pedido → ferramentas → pedido, até o Claude concluir a resposta. */
async function runLoop() {
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const reply = await callModel();

    if (reply.stop_reason === 'refusal') {
      push('erro', 'Não consigo responder a isso. Tente reformular.');
      return;
    }

    const blocks = reply.content ?? [];
    const texto = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const toolCalls = blocks.filter((b) => b.type === 'tool_use');

    // A resposta do modelo entra no histórico inteira — inclusive os blocos de ferramenta.
    messages.push({ role: 'assistant', content: blocks });

    if (texto) push('jarbas', texto);

    if (!toolCalls.length) {
      if (texto && settings.get('speakReplies')) speak(texto);
      return;
    }

    if (round === MAX_TOOL_ROUNDS) {
      push('erro', 'Muitas ações em sequência — parei por segurança. Pode pedir de novo em partes menores?');
      return;
    }

    // Executa todas as ferramentas do turno e devolve os resultados juntos.
    const resultados = [];
    for (const call of toolCalls) {
      pushTool(tools.label(call.name, call.input));
      const r = await tools.execute(call.name, call.input);
      resultados.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: r.content,
        is_error: r.is_error,
      });
    }
    messages.push({ role: 'user', content: resultados });
  }
}

async function callModel() {
  if (!settings.isCloudConfigured()) {
    throw new Error('SEM_CONFIG');
  }
  if (!sb.isSignedIn()) {
    throw new Error('SEM_LOGIN');
  }
  return sb.invokeJarbas({
    messages: trimHistory(messages),
    context: ctx.build(),
    tools: tools.definitions,
    effort: settings.get('effort') || 'high',
    userName: settings.get('name') || '',
  });
}

/** Mantém a conversa dentro de um tamanho saudável, sem quebrar pares de ferramenta. */
function trimHistory(list, max = 30) {
  if (list.length <= max) return list;
  let cut = list.length - max;
  // não começar por um turno de resultados de ferramenta órfão
  while (cut < list.length && isToolResultTurn(list[cut])) cut++;
  return list.slice(cut);
}

const isToolResultTurn = (m) =>
  Array.isArray(m?.content) && m.content.some((b) => b.type === 'tool_result');

function friendlyError(err) {
  const msg = String(err?.message || err);
  if (msg === 'SEM_CONFIG') return 'Ainda não configurei a nuvem. Vá em Ajustes → Sincronização e cole a URL e a chave do seu projeto Supabase.';
  if (msg === 'SEM_LOGIN') return 'Preciso que você entre na sua conta (Ajustes → Sincronização) para eu poder pensar.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com a nuvem. Seus dados continuam aqui e funcionando — só eu fico mudo até a internet voltar.';
  if (/429|rate.?limit/i.test(msg)) return 'A API está limitando as requisições. Espere alguns segundos e tente de novo.';
  if (/401|403/.test(msg)) return 'A chave da API foi recusada. Confira o segredo ANTHROPIC_API_KEY na Edge Function.';
  return `Deu erro aqui: ${msg}`;
}

/* ============================ renderização ============================ */

function push(who, text) {
  const rotulos = { user: 'você', jarbas: 'JARBAS', erro: 'falha' };
  const node = el('div', { class: `msg ${who === 'user' ? 'user' : who === 'erro' ? 'tool' : 'jarbas'}` },
    el('div', { class: 'who', text: rotulos[who] ?? who }),
    el('div', { class: 'bubble', html: mdlite(text) }),
  );
  ui.log.append(node);
  scrollDown();
}

function pushTool(label) {
  const node = el('div', { class: 'msg tool' },
    el('div', { class: 'bubble', text: `▸ ${label}` }),
  );
  ui.log.append(node);
  scrollDown();
}

const scrollDown = () => { ui.log.scrollTop = ui.log.scrollHeight; };

function setBusy(value) {
  busy = value;
  ui.send.disabled = value;
  ui.panel.classList.toggle('busy', value);
  orb?.setMode(value ? 'thinking' : currentOrbMode());
  ui.state.textContent = value ? 'processando' : voiceStateLabel();
}

function currentOrbMode() {
  const v = voice.getState();
  if (v.speaking) return 'speaking';
  if (v.listening) return 'listening';
  return 'idle';
}

function voiceStateLabel() {
  const v = voice.getState();
  if (v.speaking) return 'falando';
  if (v.awake) return 'ouvindo comando';
  if (v.listening) return 'aguardando “jarbas”';
  return 'em espera';
}

/* ============================ sugestões ============================ */

function renderSuggestions() {
  const base = [];
  const sinais = store.insights();
  if (sinais.length) base.push('O que merece minha atenção hoje?');
  if (store.openTasks().length) base.push('Quais tarefas eu priorizo agora?');
  if (store.monthSummary().count) base.push('Como estão minhas finanças este mês?');
  if (store.activeLists().some((l) => store.listTotal(l.id).pending)) base.push('O que falta comprar?');
  base.push('Resuma minha semana');
  base.push('Monte um mapa mental sobre…');

  ui.suggest.innerHTML = '';
  for (const s of base.slice(0, 4)) {
    ui.suggest.append(el('button', {
      type: 'button', text: s,
      onclick: () => { ui.input.value = s.endsWith('…') ? s.slice(0, -1) : s; ui.input.focus(); autosize(); },
    }));
  }
}

/* ============================ formulário ============================ */

function wireForm() {
  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(ui.input.value);
  });

  ui.input.addEventListener('input', autosize);
  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(ui.input.value);
    }
  });
}

function autosize() {
  ui.input.style.height = 'auto';
  ui.input.style.height = `${Math.min(150, ui.input.scrollHeight)}px`;
}

/* ============================ voz ============================ */

function wireControls() {
  $('#jarbas-close').addEventListener('click', close);
  $('#jarbas-clear').addEventListener('click', () => newConversation());

  ui.speakToggle.addEventListener('click', async () => {
    const next = !settings.get('speakReplies');
    await settings.set({ speakReplies: next });
    ui.speakToggle.setAttribute('aria-pressed', String(next));
    if (!next) voice.stopSpeaking();
    toast(next ? 'JARBAS vai falar as respostas.' : 'JARBAS ficou em silêncio.');
  });

  ui.voiceToggle.addEventListener('click', () => {
    const ativo = voice.getState().mode === 'wake';
    voice.setMode(ativo ? 'off' : 'wake');
    ui.voiceToggle.setAttribute('aria-pressed', String(!ativo));
    toast(ativo
      ? 'Escuta contínua desligada.'
      : 'Escuta contínua ligada. Diga “Jarbas, …” para falar comigo.');
  });

  // Push-to-talk pelo botão do microfone
  const start = (e) => { e.preventDefault(); beginPTT(); };
  const end = (e) => { e.preventDefault(); endPTT(); };
  ui.mic.addEventListener('mousedown', start);
  ui.mic.addEventListener('touchstart', start, { passive: false });
  window.addEventListener('mouseup', end);
  window.addEventListener('touchend', end);

  // Push-to-talk por atalho: Ctrl+Espaço
  let pttKey = false;
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'Space' && !pttKey) {
      e.preventDefault();
      pttKey = true;
      if (!isOpen()) open({ focus: false });
      beginPTT();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (pttKey && (e.code === 'Space' || e.key === 'Control')) {
      pttKey = false;
      endPTT();
    }
  });
}

function beginPTT() {
  if (!voice.sttSupported) { toast(voice.motivoSemVoz(), 'err'); return; }
  previousVoiceMode = voice.getState().mode === 'wake' ? 'wake' : 'off';
  ui.mic.classList.add('on');
  voice.pushToTalkStart();
}

function endPTT() {
  if (!ui.mic.classList.contains('on')) return;
  ui.mic.classList.remove('on');
  voice.pushToTalkEnd(previousVoiceMode);
}

function wireVoice() {
  on('voice:state', (s) => {
    ui.panel.classList.toggle('listening', s.listening);
    ui.panel.classList.toggle('speaking', s.speaking);
    ui.voiceToggle.setAttribute('aria-pressed', String(s.mode === 'wake'));
    if (!busy) {
      ui.state.textContent = voiceStateLabel();
      orb?.setMode(currentOrbMode());
    }
  });

  on('voice:level', ({ level }) => orb?.setLevel(level));

  on('voice:interim', ({ text }) => {
    showHeard(text);
    if (!isOpen()) open({ focus: false });
  });

  on('voice:final', ({ text }) => {
    hideHeard();
    if (!isOpen()) open({ focus: false });
    ask(text);
  });

  on('voice:error', ({ message }) => toast(message, 'err'));
}

function showHeard(text) {
  clearTimeout(heardTimer);
  ui.heard.hidden = false;
  ui.heard.textContent = text;
  heardTimer = setTimeout(hideHeard, 6000);
}

function hideHeard() {
  clearTimeout(heardTimer);
  ui.heard.hidden = true;
  ui.heard.textContent = '';
}

function speak(text) {
  voice.speak(text, {
    onEnd: () => { if (!busy) { orb?.setMode(currentOrbMode()); ui.state.textContent = voiceStateLabel(); } },
  });
}

/* ============================ atalhos externos ============================ */

/** Usado pela paleta de comandos e pelas views ("perguntar ao JARBAS"). */
export function askFrom(text, { openPanel = true } = {}) {
  if (openPanel) open({ focus: false });
  return ask(text);
}

export function startListening() {
  voice.setMode('wake');
}

export { voice };
