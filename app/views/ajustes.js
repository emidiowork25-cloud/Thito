// Ajustes — perfil, aparência, assistente, voz, nuvem, notícias e backup.

import * as store from '../core/store.js';
import * as settings from '../core/settings.js';
import * as sb from '../core/supabase.js';
import * as sync from '../core/sync.js';
import * as db from '../core/db.js';
import * as noticias from '../core/noticias.js';
import * as voice from '../assistant/voice.js';
import { emit } from '../core/bus.js';
import { el, download, pickFile, fmtDate } from '../core/util.js';
import { encode as qrEncode, toSvg as qrToSvg } from '../core/qr.js';
import { sectionCard, formModal, confirmDialog, toast } from '../ui/components.js';

export function render(root) {
  root.append(el('div', { class: 'grid ajustes-grid' },
    el('div', { class: 'grid', style: 'align-content:start' }, cardPerfil(), cardAssistente(), cardVoz()),
    el('div', { class: 'grid', style: 'align-content:start' }, cardNuvem(), cardCelular(), cardNoticias(), cardBackup(), cardSobre())));
}

/* ---------- abrir no celular ---------- */

/**
 * A Vercel entrega dois tipos de endereço. O de produção é público. Os de
 * pré-visualização — os que trazem o nome do branch ou o hash do deploy —
 * ficam atrás do login da Vercel: no PC eles abrem porque o navegador já está
 * logado lá, e no celular batem numa tela de login que não é do JARBAS.
 *
 * É o motivo mais comum de "abre aqui e não abre no iPhone", e sem apontar
 * isso o dono do site fica tentando digitar melhor um endereço que não é o
 * problema.
 */
export function ehPrevisualizacaoVercel(host) {
  if (!host.endsWith('.vercel.app')) return false;
  const nome = host.slice(0, -'.vercel.app'.length);
  // branch deploy: projeto-git-nome-do-branch-escopo
  if (nome.includes('-git-')) return true;
  // deploy por commit: projeto-<hash>-escopo, com um pedaço longo e embaralhado
  return nome.split('-').some((p) => p.length >= 8 && /[a-z]/.test(p) && /\d/.test(p));
}

function cardCelular() {
  const body = el('div');
  const endereco = `${location.origin}/`;
  const previa = ehPrevisualizacaoVercel(location.hostname);

  body.append(el('p', { class: 'tiny dim', style: 'margin-top:0' },
    'Aponte a câmera do iPhone para o código — não precisa digitar nada. '
    + 'Depois toque em Compartilhar › Adicionar à Tela de Início e o JARBAS abre como aplicativo, em tela cheia.'));

  if (previa) {
    body.append(el('div', { class: 'aviso' },
      el('div', { style: 'margin-bottom:6px' },
        'Este endereço é de pré-visualização e a própria Vercel exige login nele — '
        + 'por isso ele abre no PC (onde você já está logado na Vercel) e não abre no celular.'),
      el('div', { text: 'Pegue o endereço de produção no painel da Vercel, em Project › Domains, e use aquele no iPhone.' })));
  }

  const caixaQr = el('div', { class: 'tp-qr' });
  try {
    caixaQr.append(qrToSvg(qrEncode(endereco), { escala: 5, margem: 3 }));
  } catch (err) {
    caixaQr.append(el('div', { class: 'tiny dim', text: `Não consegui gerar o código (${err.message}). Use o endereço abaixo.` }));
  }
  body.append(caixaQr);

  const campo = el('input', { type: 'text', value: endereco, readonly: true, class: 'mono tiny' });
  campo.addEventListener('focus', () => campo.select());
  body.append(campo);

  body.append(el('div', { class: 'row', style: 'margin-top:10px' },
    el('button', {
      class: 'btn sm', text: 'Copiar endereço',
      onclick: async () => {
        try { await navigator.clipboard.writeText(endereco); toast('Endereço copiado.', 'ok'); }
        catch { campo.select(); toast('Não consegui copiar — o endereço está selecionado, use Ctrl+C.', 'err'); }
      },
    })));

  body.append(el('div', { class: 'tiny dim', style: 'margin-top:14px' },
    el('div', { text: 'No iPhone, para ver os mesmos dados:' }),
    el('div', { text: '• Abra Ajustes › Nuvem e sincronização e entre com o mesmo e-mail e senha daqui.' }),
    el('div', { text: '• Os dados ficam guardados em cada aparelho; é a nuvem que os mantém iguais nos dois.' }),
    el('div', { text: '• Sem entrar na conta, o iPhone abre o JARBAS vazio — e continua vazio.' })));

  return sectionCard('Abrir no celular', null, body);
}

/* ---------- notícias ---------- */

function cardNoticias() {
  const body = el('div');

  body.append(alternar('Buscar as manchetes sozinho', settings.get('noticiasAuto'),
    (v) => settings.set({ noticiasAuto: v })));

  body.append(campo('A partir de que horas', el('input', {
    type: 'time', value: settings.get('noticiasHora') || '08:00',
    onchange: (e) => settings.set({ noticiasHora: e.target.value || '08:00' }),
  }), 'Antes desse horário o cartão fica quieto. O ⟳ no Painel busca na hora, a qualquer momento.'));

  body.append(campo('Assuntos', el('textarea', {
    rows: 5,
    value: settings.get('noticiasTemas') || noticias.TEMAS_PADRAO,
    spellcheck: 'false',
    onchange: (e) => settings.set({ noticiasTemas: e.target.value }),
  }), 'Um por linha, no formato "Rótulo | consulta". Aspas prendem a expressão inteira, '
    + 'OR soma alternativas e when:3d limita aos últimos dias. Deixe a consulta vazia para as manchetes gerais.'));

  body.append(el('p', { class: 'tiny dim', text: 'Vem de feeds públicos pela função "noticias" do seu Supabase. '
    + 'Não consome crédito da Anthropic — nenhum modelo participa da busca.' }));

  return sectionCard('Notícias', null, body);
}

/* ---------- perfil e aparência ---------- */

function cardPerfil() {
  const s = settings.all();
  const body = el('div');

  body.append(campo('Como o JARBAS deve te chamar', el('input', {
    type: 'text', value: s.name, placeholder: 'seu nome ou apelido',
    onchange: (e) => settings.set({ name: e.target.value.trim() }),
  })));

  body.append(campo('Sobre você', el('textarea', {
    rows: 5, value: settings.get('perfil') || '',
    placeholder: 'Idade, família, time, gostos, o que te irrita, o que você faz da vida…',
    onchange: (e) => settings.set({ perfil: e.target.value }),
  }), 'Vai junto de toda pergunta ao JARBAS. Quanto mais específico, menos genérica a resposta.'));

  body.append(campo('Tema', seletor(
    [['dark', 'escuro (HUD)'], ['light', 'claro']],
    s.theme,
    (v) => settings.set({ theme: v }),
  )));

  body.append(campo('Tela inicial', seletor(
    [['dashboard', 'Painel'], ['agenda', 'Agenda'], ['financas', 'Finanças'],
      ['compras', 'Compras'], ['mindmap', 'Mind maps'], ['reunioes', 'Reuniões'], ['apresentacoes', 'Apresentações']],
    s.startView,
    (v) => settings.set({ startView: v }),
  )));

  body.append(el('div', { class: 'tiny dim', style: 'margin-top:14px' },
    'Estas preferências acompanham a sua conta e aparecem igual em todo aparelho onde você entrar. '
    + 'A voz escolhida e a configuração da nuvem não viajam: elas descrevem o aparelho, não você.'));

  return sectionCard('Perfil e aparência', null, body);
}

/* ---------- assistente ---------- */

function cardAssistente() {
  const s = settings.all();
  const body = el('div');

  body.append(alternar('Falar as respostas em voz alta', s.speakReplies, (v) => settings.set({ speakReplies: v })));
  body.append(alternar('Cumprimentar e resumir o dia ao abrir', s.greetOnOpen, (v) => settings.set({ greetOnOpen: v })));
  body.append(alternar('Ligar a escuta contínua ao abrir o hub', s.autoListen, (v) => settings.set({ autoListen: v })));

  body.append(campo('Profundidade de raciocínio', seletor(
    [['low', 'rápido (respostas curtas, mais barato)'],
      ['medium', 'equilibrado'],
      ['high', 'alto (padrão)'],
      ['xhigh', 'muito alto (tarefas complexas)'],
      ['max', 'máximo (mais lento e caro)']],
    s.effort,
    (v) => settings.set({ effort: v }),
  ), 'Quanto o JARBAS pensa antes de responder. Mais alto custa mais tokens e demora mais.'));

  const memoria = store.list('notes', (n) => n.kind === 'memory');
  body.append(el('div', { class: 'field' },
    el('label', { text: `Memória de longo prazo (${memoria.length})` }),
    memoria.length
      ? el('div', { class: 'list-plain' }, ...memoria.map((n) => el('div', { class: 'lp-row' },
        el('span', { class: 'lp-main tiny', text: n.body }),
        el('button', {
          class: 'icon-btn sm', text: '✕', title: 'Esquecer',
          onclick: async () => { await store.remove('notes', n.id); emit('nav:refresh'); },
        }))))
      : el('div', { class: 'tiny dim', text: 'Nada guardado ainda. Diga “lembre que…” para o JARBAS.' })));

  return sectionCard('Assistente', null, body);
}

/* ---------- voz ---------- */

function cardVoz() {
  const s = settings.all();
  const body = el('div');

  if (!voice.sttSupported) {
    body.append(el('div', { class: 'aviso', text: voice.motivoSemVoz() }));
  }

  const vozes = voice.listVoices();
  body.append(campo('Voz', vozes.length
    ? seletor([['', 'automática (melhor pt-BR)'], ...vozes.map((v) => [v.uri, `${v.name} · ${v.lang}`])],
      s.voiceURI ?? '', (v) => { settings.set({ voiceURI: v || null }); voice.configure({ voiceURI: v || null }); })
    : el('div', { class: 'tiny dim', text: 'Carregando vozes do sistema… reabra os Ajustes se a lista estiver vazia.' })));

  body.append(deslizante('Velocidade da fala', s.voiceRate, 0.6, 1.6, 0.05,
    (v) => { settings.set({ voiceRate: v }); voice.configure({ rate: v }); }));
  body.append(deslizante('Tom da voz', s.voicePitch, 0.5, 1.6, 0.05,
    (v) => { settings.set({ voicePitch: v }); voice.configure({ pitch: v }); }));
  body.append(deslizante('Volume', s.voiceVolume, 0, 1, 0.05,
    (v) => { settings.set({ voiceVolume: v }); voice.configure({ volume: v }); }));

  body.append(alternar('Posso interromper falando por cima', s.allowBargeIn,
    (v) => { settings.set({ allowBargeIn: v }); voice.configure({ allowBargeIn: v }); }));

  body.append(el('div', { class: 'row', style: 'margin-top:6px' },
    el('button', { class: 'btn sm', text: '🔊 Testar voz', onclick: () => voice.preview() }),
    el('button', { class: 'btn sm', text: '⏹ Parar', onclick: () => voice.stopSpeaking() })));

  body.append(el('div', { class: 'tiny dim', style: 'margin-top:12px' },
    el('div', { text: 'Como falar com ele:' }),
    el('div', { text: '• Segure Ctrl+Espaço em qualquer tela e fale.' }),
    el('div', { text: '• Ou ligue a escuta contínua (🎙 no painel) e comece com “Jarbas, …”.' }),
    el('div', { text: '• Fale por cima para interromper a resposta.' })));

  return sectionCard('Voz', null, body);
}

/* ---------- nuvem ---------- */

function cardNuvem() {
  const s = settings.all();
  const body = el('div');
  const usuario = sb.getUser();

  body.append(el('p', { class: 'tiny dim', style: 'margin-top:0' },
    'A nuvem faz duas coisas: sincroniza seus dados entre dispositivos e dá cérebro ao JARBAS. '
    + 'Sem ela o hub continua funcionando 100% offline — só o assistente fica mudo.'));

  body.append(campo('URL do projeto Supabase', el('input', {
    type: 'text', value: s.supabaseUrl, placeholder: 'https://xxxx.supabase.co',
    onchange: (e) => settings.set({ supabaseUrl: e.target.value.trim().replace(/\/+$/, '') }),
  })));

  body.append(campo('Chave publishable (anon)', el('input', {
    type: 'password', value: s.supabaseKey, placeholder: 'sb_publishable_… ou eyJ…',
    onchange: (e) => settings.set({ supabaseKey: e.target.value.trim() }),
  }), 'Esta chave é pública por design — o que protege seus dados é a política RLS, que só deixa você ver suas próprias linhas.'));

  if (!settings.isCloudConfigured()) {
    body.append(el('div', { class: 'aviso', text: 'Preencha os dois campos acima para ativar a sincronização e o assistente.' }));
    return sectionCard('Nuvem e sincronização', null, body);
  }

  if (usuario) {
    body.append(el('div', { class: 'ok-box' },
      el('div', { text: `Conectado como ${usuario.email}` }),
      el('div', { class: 'tiny dim', text: 'Use a mesma conta nos outros dispositivos para ver os mesmos dados.' })));

    body.append(alternar('Sincronizar automaticamente', s.autoSync, (v) => settings.set({ autoSync: v })));

    body.append(el('div', { class: 'row' },
      el('button', {
        class: 'btn sm', text: 'Sincronizar agora',
        onclick: async () => {
          const r = await sync.run();
          toast(r.ok ? `Sincronizado (↑${r.pushed} ↓${r.pulled}).` : `Falhou: ${r.error ?? r.reason}`, r.ok ? 'ok' : 'err');
        },
      }),
      el('button', {
        class: 'btn sm', text: 'Reenviar tudo',
        title: 'Reenvia todos os registros e busca tudo de novo',
        onclick: async () => {
          const r = await sync.resync();
          toast(r.ok ? 'Ressincronização completa.' : `Falhou: ${r.error}`, r.ok ? 'ok' : 'err');
        },
      }),
      el('button', {
        class: 'btn sm danger', text: 'Sair',
        onclick: async () => {
          if (!await confirmDialog('Sair da conta? Seus dados continuam neste computador.')) return;
          await sb.signOut();
          toast('Desconectado.');
          emit('nav:refresh');
        },
      })));
  } else {
    body.append(el('div', { class: 'row' },
      el('button', { class: 'btn primary sm', text: 'Entrar', onclick: () => autenticar('entrar') }),
      el('button', { class: 'btn sm', text: 'Criar conta', onclick: () => autenticar('criar') })));
  }

  return sectionCard('Nuvem e sincronização', null, body);
}

async function autenticar(modo) {
  const v = await formModal({
    title: modo === 'criar' ? 'Criar conta' : 'Entrar',
    okLabel: modo === 'criar' ? 'Criar' : 'Entrar',
    fields: [
      { name: 'email', label: 'E-mail', type: 'email', required: true },
      { name: 'senha', label: 'Senha', type: 'password', required: true, hint: modo === 'criar' ? 'Mínimo de 6 caracteres.' : '' },
    ],
  });
  if (!v?.email || !v?.senha) return;

  try {
    if (modo === 'criar') {
      const r = await sb.signUp(v.email.trim(), v.senha);
      if (r.needsConfirmation) {
        toast('Conta criada. Confirme o e-mail e depois entre.', 'ok', 7000);
        emit('nav:refresh');
        return;
      }
      toast('Conta criada e conectada.', 'ok');
    } else {
      await sb.signIn(v.email.trim(), v.senha);
      toast('Conectado.', 'ok');
    }
    await sync.run({ full: true });
    emit('nav:refresh');
  } catch (err) {
    toast(`Não deu: ${err.message}`, 'err', 6000);
  }
}

/* ---------- backup ---------- */

function cardBackup() {
  const body = el('div');
  const contagem = db.COLLECTIONS.reduce((a, c) => a + store.list(c).length, 0);

  body.append(el('p', { class: 'tiny dim', style: 'margin-top:0', text: `${contagem} registros guardados neste computador.` }));

  body.append(el('div', { class: 'row' },
    el('button', {
      class: 'btn sm', text: '↓ Exportar backup',
      onclick: async () => {
        const dump = await db.exportAll();
        download(`thito-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(dump, null, 2));
        toast('Backup salvo.', 'ok');
      },
    }),
    el('button', {
      class: 'btn sm', text: '↑ Importar backup',
      onclick: async () => {
        const file = await pickFile('.json');
        if (!file) return;
        try {
          const dump = JSON.parse(await file.text());
          const substituir = await confirmDialog(
            'Substituir tudo o que existe hoje? Escolha “Cancelar” para mesclar (mantém o que já existe e adiciona o do arquivo).',
            { title: 'Importar backup', okLabel: 'Substituir tudo', danger: true },
          );
          const n = await db.importAll(dump, { replace: substituir });
          await store.reload();
          toast(`${n} registros importados.`, 'ok');
          emit('nav:refresh');
        } catch (err) {
          toast(`Arquivo inválido: ${err.message}`, 'err');
        }
      },
    })));

  body.append(el('div', { class: 'tiny dim', style: 'margin-top:10px', text: 'Faça um backup antes de mexer em qualquer coisa arriscada. O arquivo é um JSON simples que você pode guardar onde quiser.' }));

  return sectionCard('Backup local', null, body);
}

/* ---------- sobre ---------- */

function cardSobre() {
  const body = el('div', { class: 'tiny dim' });
  body.append(el('p', { style: 'margin-top:0' },
    'JARBAS é o seu mordomo: agenda, finanças, compras, mapas mentais, reuniões e apresentações num lugar só, '
    + 'com o JARBAS por cima de tudo isso.'));

  body.append(el('div', { class: 'atalhos' },
    ...[
      ['Ctrl + K', 'busca e comandos'],
      ['Ctrl + J', 'abrir/fechar o JARBAS'],
      ['Ctrl + Espaço', 'segurar para falar'],
      ['1 – 8', 'trocar de seção'],
      ['Esc', 'fechar painel ou janela'],
    ].map(([k, d]) => el('div', { class: 'atalho' },
      el('kbd', { text: k }), el('span', { text: d })))));

  body.append(el('div', { style: 'margin-top:14px' },
    el('button', {
      class: 'btn sm danger', text: 'Apagar tudo deste computador',
      onclick: async () => {
        if (!await confirmDialog(
          'Isso apaga TODOS os dados locais (agenda, finanças, tudo). Se a nuvem estiver ativa, o próximo sync traz os dados de volta. Exporte um backup antes.',
          { title: 'Apagar tudo', danger: true, okLabel: 'Apagar' })) return;
        for (const c of db.COLLECTIONS) await db.clear(c);
        await store.reload();
        toast('Dados locais apagados.');
        emit('nav:refresh');
      },
    })));

  return sectionCard('Sobre e atalhos', null, body);
}

/* ---------- auxiliares de formulário ---------- */

function campo(label, control, hint) {
  const node = el('div', { class: 'field' }, el('label', { text: label }), control);
  if (hint) node.append(el('div', { class: 'hint', text: hint }));
  return node;
}

function seletor(options, value, onChange) {
  return el('select', { onchange: (e) => onChange(e.target.value) },
    ...options.map(([v, t]) => el('option', { value: v, selected: String(v) === String(value) }, t)));
}

function alternar(label, value, onChange) {
  const input = el('input', { type: 'checkbox', onchange: (e) => onChange(e.target.checked) });
  input.checked = !!value;
  return el('div', { class: 'field' },
    el('label', { style: 'display:flex;align-items:center;gap:9px;text-transform:none;letter-spacing:0;font-size:13px;color:var(--txt)' },
      input, label));
}

function deslizante(label, value, min, max, step, onChange) {
  const saida = el('span', { class: 'mono tiny dim', text: Number(value).toFixed(2) });
  const input = el('input', {
    type: 'range', min, max, step, value,
    oninput: (e) => { saida.textContent = Number(e.target.value).toFixed(2); },
    onchange: (e) => onChange(Number(e.target.value)),
  });
  return el('div', { class: 'field' },
    el('label', { style: 'display:flex;justify-content:space-between' }, el('span', { text: label }), saida),
    input);
}
