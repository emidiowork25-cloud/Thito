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
<meta name="theme-color" content="#000000">
<title>Exibidor — THITO</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23000'/><rect x='14' y='40' width='72' height='7' fill='%2300e5ff'/></svg>">
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body {
    margin: 0; height: 100%; overflow: hidden; background: #000; color: #fff;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
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
    color: #ffb454; font-weight: 400; font-style: italic;
    opacity: .85; font-size: .62em;
  }
  body.claro #trilho p.cue { color: #b3700c; }

  /* aviso enquanto o editor não manda nada */
  #espera {
    position: fixed; inset: 0; z-index: 5; display: grid; place-content: center;
    gap: 16px; justify-items: center; background: #000; text-align: center; padding: 24px;
  }
  #espera.oculto { display: none; }
  .anel { width: 62px; height: 62px; border-radius: 50%; border: 2px solid #123; border-top-color: #00e5ff; animation: girar 1.1s linear infinite; }
  @keyframes girar { to { transform: rotate(360deg); } }
  #espera h1 { font-size: 15px; font-weight: 600; letter-spacing: .22em; margin: 0; color: #8aa0bd; }
  #espera p { font-size: 13px; color: #5b6f8c; margin: 0; max-width: 30ch; line-height: 1.6; }

  /* barra de status, some sozinha */
  #barra {
    position: fixed; top: 0; left: 0; right: 0; z-index: 4;
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 10px 14px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
    color: #5b6f8c; background: linear-gradient(#000c, transparent);
    transition: opacity .4s; font-family: ui-monospace, monospace;
  }
  #barra.sumiu { opacity: 0; }
  body.claro #barra { color: #6b7d94; background: linear-gradient(#fffc, transparent); }
  .luz { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #ff5f6d; margin-right: 6px; }
  .luz.on { background: #22e39a; }

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
