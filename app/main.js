// Ponto de entrada: carrega tudo na ordem certa e sobe a interface.

import * as db from './core/db.js';
import * as settings from './core/settings.js';
import * as store from './core/store.js';
import * as sb from './core/supabase.js';
import * as sync from './core/sync.js';
import * as shell from './ui/shell.js';
import * as jarbas from './assistant/jarbas.js';
import { toast } from './ui/components.js';
import { $ } from './core/util.js';

const passo = (texto) => {
  const node = $('#boot-status');
  if (node) node.textContent = texto;
};

async function boot() {
  try {
    passo('lendo preferências…');
    await settings.load();

    passo('abrindo banco local…');
    await db.kvGet('settings');       // força a abertura/upgrade do IndexedDB
    await store.load();

    passo('verificando sessão…');
    await sb.loadSession();

    passo('montando interface…');
    jarbas.init();
    shell.init();

    passo('conectando…');
    sync.start();

    document.getElementById('boot').remove();
    document.getElementById('app').hidden = false;

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
    <div style="font-size:15px">Não consegui iniciar o THITO.</div>
    <pre style="font-size:11px;color:#8aa0bd;white-space:pre-wrap;text-align:left;max-width:100%;overflow:auto">${
  String(err?.stack ?? err).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</pre>
    <div style="font-size:12px;color:#5b6f8c">
      Causa mais comum: o app foi aberto direto pelo arquivo (file://) em vez de um servidor local.
      Feche esta janela e use o <strong>start.bat</strong>.
    </div>`;
  boot.append(box);
}

boot();
