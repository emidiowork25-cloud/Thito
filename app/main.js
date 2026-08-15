// Ponto de entrada: carrega tudo na ordem certa e sobe a interface.

import * as db from './core/db.js';
import * as settings from './core/settings.js';
import * as store from './core/store.js';
import * as prefs from './core/prefs.js';
import * as sb from './core/supabase.js';
import * as sync from './core/sync.js';
import * as contas from './core/contas.js';
import * as shell from './ui/shell.js';
import * as jarbas from './assistant/jarbas.js';
import * as convite from './views/convite.js';
import { toast } from './ui/components.js';
import { $ } from './core/util.js';

const passo = (texto) => {
  const node = $('#boot-status');
  if (node) node.textContent = texto;
};

/*
 * A abertura tem um tempo mínimo, e é de propósito.
 *
 * Num computador rápido, com o service worker já servindo tudo do cache, o
 * carregamento acaba em uns 200 ms — e o cérebro girando some antes de ser
 * visto, o que na tela parece um piscar defeituoso, não uma abertura. Aqui a
 * conta é ao contrário do costume: não se espera por dado nenhum, espera-se
 * para que a marca apareça pelo tempo em que ela foi desenhada para aparecer.
 *
 * Quando a máquina é lenta e o boot demora mais do que isto, nada é somado —
 * o piso não vira teto.
 */
const ABERTURA_MINIMA_MS = 3600;
const nascimento = performance.now();

const esperarAAbertura = () => {
  const falta = ABERTURA_MINIMA_MS - (performance.now() - nascimento);
  return falta > 0 ? new Promise((pronto) => setTimeout(pronto, falta)) : Promise.resolve();
};

/** Some por transparência e só então sai do documento. */
const SAIDA_MS = 420;

function despedirAAbertura() {
  const boot = document.getElementById('boot');
  if (!boot) return Promise.resolve();
  boot.classList.add('saindo');
  return new Promise((pronto) => setTimeout(() => { boot.remove(); pronto(); }, SAIDA_MS));
}

async function boot() {
  try {
    passo('lendo preferências…');
    await settings.load();

    passo('abrindo banco local…');
    await db.kvGet('settings');       // força a abertura/upgrade do IndexedDB
    await store.load();

    // Depois do store e antes da interface: as preferências pessoais moram numa
    // coleção, então precisam do store carregado, e a tela precisa nascer já
    // com o tema e o nome certos.
    await prefs.iniciar();

    passo('verificando sessão…');
    await sb.loadSession();
    await contas.iniciar();

    // Quem chegou por um link de convite e ainda não tem sessão para na porta.
    // Antes de montar o hub, porque montar um hub que a pessoa não pode usar é
    // pior do que não montar: ela veria as telas e nada funcionaria.
    //
    // A porta mora num elemento próprio, e não dentro de #app: a casca do app
    // (lateral, barra, painel do JARBAS) continua intacta por baixo, esperando.
    const codigo = convite.conviteNaUrl();
    if (codigo && !sb.isSignedIn()) {
      passo('conferindo o convite…');
      await esperarAAbertura();
      await despedirAAbertura();
      const porta = document.createElement('div');
      document.body.append(porta);
      // Só resolve quando houver sessão. Quem acabou de se cadastrar fica na
      // tela de espera, que é o certo: ainda não há o que abrir para ele.
      await convite.abrirPorta(porta, codigo);
      // Recomeça do zero com a sessão nova — mais honesto do que remendar um
      // app que já nasceu sem saber quem é o dono da tela.
      location.reload();
      return;
    }

    passo('montando interface…');
    jarbas.init();
    shell.init();

    passo('conectando…');
    sync.start();

    // A sincronização segue por conta dela; só a saída da tela de abertura
    // espera. Segurar o sync aqui atrasaria os dados por causa da estética.
    passo('tudo pronto.');
    await esperarAAbertura();

    // O app entra por baixo antes de a abertura sair, senão o corte deixa um
    // quadro de fundo vazio no meio da transição.
    document.getElementById('app').hidden = false;
    await despedirAAbertura();

    // A primeira conversa: quem é você, e o que você quer ler.
    //
    // Só para quem entrou por convite — o dono da casa já configurou tudo à
    // mão, e recebê-lo com um questionário seria começar mandando nele.
    if (contas.estado() === 'aprovado' && !contas.souSuperAdmin() && settings.get('boasVindas')) {
      convite.primeirasPerguntas(() => shell.render());
    }

    if (settings.get('autoListen')) {
      // Sem um clique prévio, o navegador pode negar o microfone — avisamos em vez de falhar em silêncio.
      setTimeout(() => jarbas.startListening(), 800);
    }

    registrarErrosGlobais();
  } catch (err) {
    console.error('[boot]', err);
    mostrarFalhaDeBoot(err);
  }
}

function registrarErrosGlobais() {
  window.addEventListener('error', (e) => {
    console.error('[erro]', e.error ?? e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[promessa]', e.reason);
    const msg = String(e.reason?.message ?? e.reason ?? '');
    if (/quota|QuotaExceeded/i.test(msg)) {
      toast('O armazenamento local encheu. Exporte um backup e limpe dados antigos.', 'err', 8000);
    }
  });
}

function mostrarFalhaDeBoot(err) {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.innerHTML = '';
  boot.style.padding = '24px';
  const box = document.createElement('div');
  box.style.cssText = 'max-width:560px;text-align:center;display:grid;gap:12px;justify-items:center';
  box.innerHTML = `
    <div style="font-size:32px">⚠</div>
    <div style="font-size:15px">Não consegui iniciar o JARBAS.</div>
    <pre style="font-size:11px;color:#9db4bd;white-space:pre-wrap;text-align:left;max-width:100%;overflow:auto">${
  String(err?.stack ?? err).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>
    <div style="font-size:12px;color:#6c8791">
      Causa mais comum: o app foi aberto direto pelo arquivo (file://) em vez de um servidor local.
      Feche esta janela e use o <strong>start.bat</strong>.
    </div>`;
  boot.append(box);
}

boot();
