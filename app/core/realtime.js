// Canal de tempo real sobre o Supabase Realtime, falado direto no WebSocket.
//
// O Realtime do Supabase usa o protocolo de canais do Phoenix. São quatro
// mensagens no total, então vale mais implementá-las aqui do que carregar uma
// biblioteca inteira só para isso — e o resto do projeto também não tem dependências.
//
// Uso:
//   const canal = conectar('prompter:ABC123', { onMessage, onStatus });
//   canal.enviar('estado', { velocidade: 40 });
//   canal.fechar();

const HEARTBEAT_MS = 25000;
const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 15000;

/**
 * Abre um canal de transmissão. Reconecta sozinho enquanto não for fechado.
 *
 * @param {string} sala        nome do canal (mesmo nos dois lados)
 * @param {object} opcoes
 * @param {string} opcoes.url  URL do projeto Supabase (https://xxx.supabase.co)
 * @param {string} opcoes.chave chave publishable/anon
 * @param {(evento: string, dados: any) => void} opcoes.onMessage
 * @param {(estado: 'conectando'|'aberto'|'fechado') => void} [opcoes.onStatus]
 */
export function conectar(sala, { url, chave, onMessage, onStatus }) {
  if (!url || !chave) throw new Error('Realtime exige a URL e a chave do Supabase.');

  const endpoint = `${String(url).replace(/^http/, 'ws').replace(/\/+$/, '')}`
    + `/realtime/v1/websocket?apikey=${encodeURIComponent(chave)}&vsn=1.0.0`;
  const topico = `realtime:${sala}`;

  let ws = null;
  let ref = 0;
  let heartbeat = null;
  let reconexao = null;
  let tentativas = 0;
  let vivo = true;      // false depois de fechar() — impede reconectar
  let entrou = false;
  const fila = [];      // mensagens enviadas antes do canal abrir

  const status = (estado) => { try { onStatus?.(estado); } catch { /* ignora */ } };

  function bruto(mensagem) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(mensagem));
      return true;
    }
    return false;
  }

  function abrir() {
    if (!vivo) return;
    status('conectando');
    entrou = false;

    try {
      ws = new WebSocket(endpoint);
    } catch {
      agendarReconexao();
      return;
    }

    ws.onopen = () => {
      ref += 1;
      bruto({
        topic: topico,
        event: 'phx_join',
        payload: {
          config: {
            broadcast: { self: false, ack: false },
            presence: { key: '' },
            private: false,
          },
        },
        ref: String(ref),
      });

      clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        ref += 1;
        bruto({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref) });
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (evento) => {
      let msg;
      try { msg = JSON.parse(evento.data); } catch { return; }

      // confirmação de entrada no canal: só agora dá para transmitir
      if (msg.event === 'phx_reply' && msg.topic === topico) {
        if (msg.payload?.status === 'ok') {
          entrou = true;
          tentativas = 0;
          status('aberto');
          while (fila.length) bruto(fila.shift());
        }
        return;
      }

      if (msg.event === 'broadcast' && msg.topic === topico) {
        const { event, payload } = msg.payload ?? {};
        if (event) { try { onMessage?.(event, payload); } catch (err) { console.error('[realtime]', err); } }
      }
    };

    ws.onclose = () => {
      clearInterval(heartbeat);
      entrou = false;
      status('fechado');
      agendarReconexao();
    };

    ws.onerror = () => { try { ws.close(); } catch { /* o onclose cuida */ } };
  }

  function agendarReconexao() {
    if (!vivo) return;
    clearTimeout(reconexao);
    // recuo exponencial com teto, para não martelar o servidor quando cai a rede
    const espera = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** tentativas);
    tentativas += 1;
    reconexao = setTimeout(abrir, espera);
  }

  abrir();

  return {
    /** Transmite um evento para os outros participantes do canal. */
    enviar(evento, dados) {
      const mensagem = {
        topic: topico,
        event: 'broadcast',
        payload: { type: 'broadcast', event: evento, payload: dados },
        ref: null,
      };
      // se ainda não entrou, guarda para mandar assim que o canal abrir
      if (!entrou || !bruto(mensagem)) {
        fila.push(mensagem);
        if (fila.length > 30) fila.shift();
      }
    },

    get conectado() { return entrou; },

    fechar() {
      vivo = false;
      clearInterval(heartbeat);
      clearTimeout(reconexao);
      try { ws?.close(); } catch { /* já fechado */ }
      ws = null;
    },
  };
}

/** Código de sala curto, legível e difícil de adivinhar. */
export function novaSala(tamanho = 14) {
  // sem 0/O/1/I/l para não confundir quem digitar à mão
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}
