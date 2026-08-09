/**
 * Service worker do THITO.
 *
 * Existe por um motivo só: deixar o hub abrir como aplicativo instalado, com o
 * servidor local desligado. Ele guarda o app inteiro no primeiro carregamento e,
 * a partir daí, responde do cache — a rede vira apenas a fonte de atualização.
 *
 * Nada de dados pessoais passa por aqui. Só os arquivos do programa; a agenda, as
 * finanças e o resto moram no IndexedDB, que o navegador já mantém sozinho.
 */

const VERSAO = 'thito-v2';

const CASCA = [
  './',
  './index.html',
  './styles/base.css',
  './styles/views.css',
  './app/main.js',
  './app/core/bus.js',
  './app/core/db.js',
  './app/core/qr.js',
  './app/core/realtime.js',
  './app/core/settings.js',
  './app/core/store.js',
  './app/core/supabase.js',
  './app/core/sync.js',
  './app/core/util.js',
  './app/ui/components.js',
  './app/ui/shell.js',
  './app/assistant/context.js',
  './app/assistant/jarbas.js',
  './app/assistant/orb.js',
  './app/assistant/tools.js',
  './app/assistant/voice.js',
  './app/views/agenda.js',
  './app/views/ajustes.js',
  './app/views/apresentacoes.js',
  './app/views/compras.js',
  './app/views/copywriter.js',
  './app/views/dashboard.js',
  './app/views/financas.js',
  './app/views/mindmap.js',
  './app/views/reunioes.js',
  './app/views/teleprompter.js',
  './manifest.webmanifest',
  './assets/icone-180.png',
  './assets/icone-192.png',
  './assets/icone-512.png',
  './assets/icone-mascara.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // addAll é tudo-ou-nada: um arquivo faltando derrubaria a instalação inteira.
    await Promise.all(CASCA.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Supabase, Anthropic e qualquer outra origem passam direto — nunca são guardados.
  if (url.origin !== self.location.origin) return;

  // Navegação: cache primeiro, para abrir com o servidor desligado.
  if (req.mode === 'navigate') {
    evento.respondWith((async () => {
      const guardado = await caches.match('./index.html');
      if (guardado) {
        revalidar(req);
        return guardado;
      }
      try {
        return await fetch(req);
      } catch {
        return new Response('O THITO ainda não foi carregado uma vez neste navegador.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Demais arquivos: responde do cache e busca a versão nova em segundo plano.
  evento.respondWith((async () => {
    const guardado = await caches.match(req);
    if (guardado) {
      revalidar(req);
      return guardado;
    }
    const resposta = await fetch(req);
    if (resposta.ok) (await caches.open(VERSAO)).put(req, resposta.clone());
    return resposta;
  })());
});

/** Atualiza o arquivo no cache sem segurar a resposta que já foi entregue. */
function revalidar(req) {
  fetch(req)
    .then(async (nova) => {
      if (nova.ok) (await caches.open(VERSAO)).put(req, nova);
    })
    .catch(() => { /* offline: o que está no cache continua valendo */ });
}
