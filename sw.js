/**
 * Service worker do JARBAS.
 *
 * Existe por um motivo só: deixar o hub abrir como aplicativo instalado, com o
 * servidor local desligado. Ele guarda o app inteiro no primeiro carregamento e,
 * a partir daí, responde do cache — a rede vira apenas a fonte de atualização.
 *
 * Nada de dados pessoais passa por aqui. Só os arquivos do programa; a agenda, as
 * finanças e o resto moram no IndexedDB, que o navegador já mantém sozinho.
 */

const VERSAO = 'jarbas-v38';

const CASCA = [
  './',
  './index.html',
  // O exibidor é uma página à parte, e a gravação costuma ser justamente onde
  // a rede é ruim. Guardado aqui, ele abre com o sinal caindo.
  './exibidor.html',
  './styles/fontes.css',
  './styles/base.css',
  './styles/views.css',
  './app/main.js',
  './app/core/bus.js',
  './app/core/cofre.js',
  './app/core/noticias.js',
  './app/core/outline.js',
  './app/core/xmind.js',
  './app/core/db.js',
  './app/core/modelo.js',
  './app/core/prefs.js',
  './app/core/qr.js',
  './app/core/realtime.js',
  './app/core/redator.js',
  './app/core/settings.js',
  './app/core/store.js',
  './app/core/supabase.js',
  './app/core/sync.js',
  './app/core/util.js',
  './app/core/visao.js',
  './app/ui/arvore.js',
  './app/ui/mapa.js',
  './app/ui/components.js',
  './app/ui/icones.js',
  './app/ui/shell.js',
  './app/assistant/context.js',
  './app/assistant/jarbas.js',
  './app/assistant/face.js',
  './app/assistant/orb.js',
  './app/assistant/tools.js',
  './app/assistant/voice.js',
  './app/views/agenda.js',
  './app/views/ajustes.js',
  './app/views/apresentacoes.js',
  './app/views/compras.js',
  './app/views/copywriter.js',
  './app/views/dashboard.js',
  './app/views/eventos.js',
  './app/views/financas.js',
  './app/views/freela.js',
  './app/views/mindmap.js',
  './app/views/reunioes.js',
  './app/views/rotina.js',
  './app/views/senhas.js',
  './app/views/teleprompter.js',
  './manifest.webmanifest',
  './assets/fontes/bebas-neue-400-latin-ext.woff2',
  './assets/fontes/bebas-neue-400-latin.woff2',
  './assets/fontes/figtree-400-latin-ext.woff2',
  './assets/fontes/figtree-400-latin.woff2',
  './assets/fontes/figtree-500-latin-ext.woff2',
  './assets/fontes/figtree-500-latin.woff2',
  './assets/fontes/figtree-600-latin-ext.woff2',
  './assets/fontes/figtree-600-latin.woff2',
  './assets/fontes/figtree-700-latin-ext.woff2',
  './assets/fontes/figtree-700-latin.woff2',
  './assets/fontes/ibm-plex-mono-400-latin-ext.woff2',
  './assets/fontes/ibm-plex-mono-400-latin.woff2',
  './assets/fontes/ibm-plex-mono-500-latin-ext.woff2',
  './assets/fontes/ibm-plex-mono-500-latin.woff2',
  './assets/fontes/montserrat-600-latin-ext.woff2',
  './assets/fontes/montserrat-600-latin.woff2',
  './assets/fontes/montserrat-700-latin-ext.woff2',
  './assets/fontes/montserrat-700-latin.woff2',
  './assets/fontes/montserrat-800-latin-ext.woff2',
  './assets/fontes/montserrat-800-latin.woff2',
  './assets/jarbas-retrato.png',
  './assets/jarbas-cerebro.png',
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

  if (req.mode === 'navigate') {
    /*
     * Nem toda navegação neste endereço é o hub.
     *
     * O exibidor do teleprompter mora em /exibidor.html, no mesmo domínio. A
     * versão anterior devolvia o index.html guardado para QUALQUER navegação —
     * então ler o QR no celular abria o Painel em vez do teleprompter, e o
     * endereço na barra estava certo o tempo todo, o que tornava o engano
     * difícil de enxergar.
     *
     * Só o hub tem direito à resposta pronta do cache. As outras páginas
     * passam pela rede e caem no cache DELAS quando a rede falta.
     */
    const ehOHub = url.pathname === '/' || url.pathname.endsWith('/index.html');

    evento.respondWith((async () => {
      if (ehOHub) {
        const casca = await caches.match('./index.html');
        if (casca) { revalidar(req); return casca; }
      } else {
        // O código da sala vai na busca (?s=…) e muda a cada roteiro; sem
        // ignoreSearch, cada sala viraria uma entrada nova e nenhuma seria achada.
        const guardada = await caches.match(req, { ignoreSearch: true });
        if (guardada) { revalidar(req); return guardada; }
      }

      try {
        const nova = await fetch(req);
        // Guarda sem a busca, pelo mesmo motivo: uma cópia por página, não por sala.
        if (nova.ok && !ehOHub) {
          (await caches.open(VERSAO)).put(new Request(url.origin + url.pathname), nova.clone());
        }
        return nova;
      } catch {
        return new Response('Esta página do JARBAS ainda não foi carregada uma vez neste navegador.', {
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
  const url = new URL(req.url);
  const chave = req.mode === 'navigate' ? new Request(url.origin + url.pathname) : req;
  fetch(req)
    .then(async (nova) => {
      if (nova.ok) (await caches.open(VERSAO)).put(chave, nova);
    })
    .catch(() => { /* offline: o que está no cache continua valendo */ });
}
