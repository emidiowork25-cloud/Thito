// Edge Function "prompter" — serve a página do exibidor do teleprompter.
//
// É pública de propósito: o celular precisa abrir o link sem login, apontando a
// câmera para um QR. A página em si não contém roteiro nenhum — o texto chega
// depois, pelo canal Realtime, e só para quem tem o código da sala.
//
// Deploy:  supabase functions deploy prompter --no-verify-jwt

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/** Escapa para inserir com segurança dentro de um <script type="application/json">. */
const seguro = (s: string) =>
  JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

function pagina(url: string, chave: string, sala: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#08181d">
<title>Exibidor — THITO</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23000'/><rect x='14' y='40' width='72' height='7' fill='%2300e5ff'/></svg>">
<style>
  /* Saira Condensed viaja embutida: o exibidor tem que ficar idêntico ao
     preview do editor, e não dá para depender de rede no meio do programa. */
  @font-face {
    font-family: 'Saira Condensed';
    font-style: normal; font-weight: 600; font-display: block;
    src: url(data:font/woff2;base64,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) format('woff2');
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body {
    margin: 0; height: 100%; overflow: hidden; background: #000; color: #fff;
    font-family: 'Saira Condensed', "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  body.claro { background: #fff; color: #000; }

  #palco { position: fixed; inset: 0; overflow: hidden; }

  /* linha-guia: onde o apresentador fixa o olhar */
  #guia {
    position: fixed; left: 0; right: 0; top: 42%; height: 0;
    border-top: 2px solid rgba(0, 229, 255, .55); z-index: 3; pointer-events: none;
  }
  #guia::before, #guia::after {
    content: ''; position: absolute; top: -9px;
    border: 9px solid transparent; border-top-width: 9px;
  }
  #guia::before { left: 0; border-left-color: rgba(0, 229, 255, .8); }
  #guia::after { right: 0; border-right-color: rgba(0, 229, 255, .8); }
  body.sem-guia #guia { display: none; }

  #trilho {
    position: absolute; top: 42%; left: 0; right: 0;
    will-change: transform; transform-origin: center center;
  }
  #trilho p {
    margin: 0; padding: 0; white-space: pre-wrap; word-wrap: break-word;
    font-weight: 600; letter-spacing: .01em;
  }
  #trilho p.cue {
    color: #e39a3c; font-weight: 400; font-style: italic;
    opacity: .85; font-size: .62em;
  }
  body.claro #trilho p.cue { color: #96610f; }

  /* aviso enquanto o editor não manda nada */
  #espera {
    position: fixed; inset: 0; z-index: 5; display: grid; place-content: center;
    gap: 16px; justify-items: center; background: #000; text-align: center; padding: 24px;
  }
  #espera.oculto { display: none; }
  .anel { width: 62px; height: 62px; border-radius: 50%; border: 2px solid #123; border-top-color: #d4c757; animation: girar 1.1s linear infinite; }
  @keyframes girar { to { transform: rotate(360deg); } }
  #espera h1 { font-size: 15px; font-weight: 600; letter-spacing: .22em; margin: 0; color: #9fb6ba; }
  #espera p { font-size: 13px; color: #6d8b93; margin: 0; max-width: 30ch; line-height: 1.6; }

  /* barra de status, some sozinha */
  #barra {
    position: fixed; top: 0; left: 0; right: 0; z-index: 4;
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 10px 14px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
    color: #6d8b93; background: linear-gradient(#000c, transparent);
    transition: opacity .4s; font-family: ui-monospace, monospace;
  }
  #barra.sumiu { opacity: 0; }
  body.claro #barra { color: #6d8b93; background: linear-gradient(#fffc, transparent); }
  .luz { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #e2553a; margin-right: 6px; }
  .luz.on { background: #3fa08d; }

  @media (prefers-reduced-motion: reduce) { .anel { animation: none; } }
</style>
</head>
<body class="sem-guia">
  <div id="barra">
    <span><span class="luz" id="luz"></span><span id="estado">conectando</span></span>
    <span id="relogio"></span>
  </div>

  <div id="palco"><div id="trilho"></div></div>
  <div id="guia"></div>

  <div id="espera">
    <div class="anel"></div>
    <h1>E X I B I D O R</h1>
    <p id="dica">Conectando ao editor. Deixe esta tela aberta — o texto aparece sozinho.</p>
  </div>

<script id="cfg" type="application/json">${seguro(JSON.stringify({ url, chave, sala }))}</script>
<script>
(function () {
  'use strict';

  var cfg = JSON.parse(JSON.parse(document.getElementById('cfg').textContent));
  var palco = document.getElementById('palco');
  var trilho = document.getElementById('trilho');
  var espera = document.getElementById('espera');
  var barra = document.getElementById('barra');
  var luz = document.getElementById('luz');
  var estadoTxt = document.getElementById('estado');
  var relogio = document.getElementById('relogio');
  var dica = document.getElementById('dica');

  if (!cfg.sala) {
    dica.textContent = 'Link sem código de sala. Leia o QR de novo no editor.';
    return;
  }

  /* ---------------- estado ---------------- */

  var st = {
    texto: '', fonte: 58, altura: 1.5, velocidade: 130,
    espelhoH: false, espelhoV: false, margem: 12, contraste: 'claro',
    rodando: false, pos: 0
  };
  var recebidoEm = 0;      // performance.now() de quando o estado chegou
  var offsetInicial = 0;   // segundos que o editor já tinha rolado
  var temEstado = false;

  function posicaoAtual() {
    if (!st.rodando) return st.pos;
    var decorrido = offsetInicial + (performance.now() - recebidoEm) / 1000;
    return st.pos + (decorrido * st.velocidade) / 60;
  }

  /* ---------------- desenho ---------------- */

  var assinaturaTexto = null;

  function montarTexto() {
    var linhas = (st.texto || '').split('\\n');
    trilho.innerHTML = '';
    for (var i = 0; i < linhas.length; i++) {
      var p = document.createElement('p');
      var ehCue = /^\\s*\\[.*\\]\\s*$/.test(linhas[i]);
      if (ehCue) p.className = 'cue';
      p.textContent = linhas[i] || ' ';
      trilho.appendChild(p);
    }
    // respiro no fim para a última linha alcançar a guia
    var fim = document.createElement('p');
    fim.textContent = ' ';
    fim.style.height = '60vh';
    trilho.appendChild(fim);
  }

  function aplicarEstilo() {
    trilho.style.fontSize = st.fonte + 'px';
    trilho.style.lineHeight = String(st.altura);
    trilho.style.paddingLeft = st.margem + '%';
    trilho.style.paddingRight = st.margem + '%';
    document.body.classList.toggle('claro', st.contraste === 'escuro');
  }

  function quadro() {
    if (temEstado) {
      var alturaLinha = st.fonte * st.altura;
      var t = [];
      t.push('translateY(' + (-posicaoAtual() * alturaLinha) + 'px)');
      if (st.espelhoH) t.push('scaleX(-1)');
      if (st.espelhoV) t.push('scaleY(-1)');
      trilho.style.transform = t.join(' ');
    }
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);

  function aplicar(novo) {
    var textoMudou = novo.texto !== st.texto;
    for (var k in novo) if (Object.prototype.hasOwnProperty.call(novo, k)) st[k] = novo[k];

    recebidoEm = performance.now();
    offsetInicial = Number(novo.t0) || 0;

    if (textoMudou || assinaturaTexto === null) { montarTexto(); assinaturaTexto = st.texto; }
    aplicarEstilo();

    if (!temEstado) {
      temEstado = true;
      espera.classList.add('oculto');
      document.body.classList.remove('sem-guia');
    }
    estadoTxt.textContent = st.rodando ? 'no ar' : 'pausado';
  }

  /* ---------------- canal Realtime ---------------- */

  var ws = null, ref = 0, batida = null, tentativas = 0, entrou = false;
  var topico = 'realtime:prompter:' + cfg.sala;

  function envia(evento, dados) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({
      topic: topico, event: 'broadcast',
      payload: { type: 'broadcast', event: evento, payload: dados || {} }, ref: null
    }));
  }

  function conectar() {
    estadoTxt.textContent = 'conectando';
    luz.classList.remove('on');
    var endpoint = cfg.url.replace(/^http/, 'ws').replace(/\\/+$/, '')
      + '/realtime/v1/websocket?apikey=' + encodeURIComponent(cfg.chave) + '&vsn=1.0.0';

    try { ws = new WebSocket(endpoint); } catch (e) { reagendar(); return; }

    ws.onopen = function () {
      ref++;
      ws.send(JSON.stringify({
        topic: topico, event: 'phx_join',
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false } },
        ref: String(ref)
      }));
      clearInterval(batida);
      batida = setInterval(function () {
        ref++;
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref) }));
        }
        envia('ping');
      }, 20000);
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }

      if (msg.event === 'phx_reply' && msg.topic === topico) {
        if (msg.payload && msg.payload.status === 'ok') {
          entrou = true;
          tentativas = 0;
          luz.classList.add('on');
          estadoTxt.textContent = temEstado ? (st.rodando ? 'no ar' : 'pausado') : 'aguardando editor';
          envia('entrou');   // faz o editor mandar o estado completo
        }
        return;
      }

      if (msg.event === 'broadcast' && msg.topic === topico) {
        var p = msg.payload || {};
        if (p.event === 'estado' && p.payload) aplicar(p.payload);
      }
    };

    ws.onclose = function () {
      entrou = false;
      clearInterval(batida);
      luz.classList.remove('on');
      estadoTxt.textContent = 'reconectando';
      reagendar();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function reagendar() {
    var espera_ms = Math.min(15000, 800 * Math.pow(2, tentativas));
    tentativas++;
    setTimeout(conectar, espera_ms);
  }

  window.addEventListener('beforeunload', function () { envia('saiu'); });
  conectar();

  /* ---------------- conforto de uso ---------------- */

  // tela cheia + trava de suspensão no primeiro toque
  var wakeLock = null;
  async function segurarTela() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* alguns navegadores negam; segue sem */ }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !wakeLock) segurarTela();
  });

  palco.addEventListener('click', function () {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    }
    segurarTela();
    barra.classList.remove('sumiu');
    reiniciarSumico();
  });

  var sumicoTimer = null;
  function reiniciarSumico() {
    clearTimeout(sumicoTimer);
    sumicoTimer = setTimeout(function () { barra.classList.add('sumiu'); }, 4000);
  }
  reiniciarSumico();

  setInterval(function () {
    var d = new Date();
    relogio.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
  }, 1000);
})();
</script>
</body>
</html>`;
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const sala = (url.searchParams.get('s') ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

  const projeto = Deno.env.get('SUPABASE_URL') ?? '';
  const chave = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!projeto || !chave) {
    return new Response('Exibidor sem configuração do projeto.', {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(pagina(projeto, chave, sala), {
    headers: {
      ...CORS,
      'Content-Type': 'text/html; charset=utf-8',
      // a página é estática; o conteúdo do roteiro chega pelo Realtime
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
