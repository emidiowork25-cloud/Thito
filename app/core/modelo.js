// A conversa de uma pergunta só com o modelo.
//
// Serve às telas que não querem bate-papo: mandam um pedido, esperam uma
// resposta estruturada e seguem a vida. É o caminho da nota fiscal, do mapa
// vindo de imagem, do extrato em PDF e da leitura de link no Copywriter.
//
// A chave da Anthropic não passa por aqui. Quem fala com o modelo é a Edge
// Function; este arquivo só monta o pedido e desembrulha a resposta.

import * as sb from './supabase.js';
import * as settings from './settings.js';

/**
 * Ferramenta de servidor que lê uma página da web.
 *
 * Roda do lado da Anthropic, não daqui: o navegador não consegue buscar uma
 * página de outro domínio, e mesmo que conseguisse, mandar o HTML inteiro pela
 * Edge Function seria pagar token por menu e rodapé.
 */
export const LER_PAGINA = { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3 };

/**
 * Manda o pedido e devolve os blocos da resposta final.
 *
 * `pause_turn` é o motivo de isto ser um laço e não uma chamada. Quando uma
 * ferramenta de servidor demora, a API devolve o turno pela metade com esse
 * motivo de parada — sem erro, sem aviso. Quem tratasse a resposta como final
 * mostraria uma tela vazia e chamaria de "não veio nada". Aqui o turno volta
 * para o modelo continuar de onde parou.
 */
export async function conversar({ mensagens, ferramentas = [], effort = 'high', maxVoltas = 4 }) {
  if (!settings.isCloudConfigured()) throw new Error('SEM_CONFIG');
  if (!sb.isSignedIn()) throw new Error('SEM_LOGIN');

  const historia = [...mensagens];

  for (let volta = 0; volta < maxVoltas; volta += 1) {
    const resposta = await sb.invokeJarbas({
      messages: historia,
      // Sem contexto do hub: estas telas mandam o material junto do pedido, e
      // agenda e finanças não têm nada a ver com o que se pede aqui.
      context: '',
      tools: ferramentas,
      effort,
      userName: settings.get('name') || '',
    });

    const blocos = Array.isArray(resposta?.content) ? resposta.content : [];
    if (resposta?.stop_reason !== 'pause_turn') return blocos;

    historia.push({ role: 'assistant', content: blocos });
  }

  throw new Error('O modelo pausou muitas vezes seguidas sem terminar. Tente de novo.');
}

export const acharFerramenta = (blocos, nome) =>
  blocos.find((b) => b.type === 'tool_use' && b.name === nome)?.input ?? null;

export const juntarTexto = (blocos) =>
  blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

/**
 * O caminho comum: um pedido, uma ferramenta de formato, e duas saídas
 * possíveis — `{ dados }` quando o modelo preencheu a ferramenta, `{ texto }`
 * quando respondeu com palavras.
 *
 * A segunda não é falha. É o que deve acontecer quando o material não dá para
 * o que foi pedido: foto tremida, PDF que não é extrato, link que não abriu.
 * A frase dele explica melhor do que qualquer erro genérico nosso.
 */
export async function pedirEstrutura({ mensagens, ferramenta, extras = [], effort = 'high' }) {
  const blocos = await conversar({ mensagens, ferramentas: [ferramenta, ...extras], effort });
  const dados = acharFerramenta(blocos, ferramenta.name);
  if (dados) return { dados, blocos };
  return { texto: juntarTexto(blocos) || 'O modelo não devolveu nada sobre isso.', blocos };
}

/** Traduz as falhas de configuração para o que a pessoa precisa fazer. */
export function explicarFalha(err) {
  const msg = String(err?.message || err);
  if (msg === 'SEM_CONFIG') return 'Configure a nuvem em Ajustes antes — isto passa por ela.';
  if (msg === 'SEM_LOGIN') return 'Entre na sua conta em Ajustes › Nuvem para eu poder pensar.';
  if (/ANTHROPIC_API_KEY/i.test(msg)) return 'Falta o segredo ANTHROPIC_API_KEY no seu projeto Supabase — sem ele eu não penso.';
  if (/401|403/.test(msg)) return 'A chave da Anthropic foi recusada. Confira o segredo ANTHROPIC_API_KEY.';
  if (/429|rate.?limit/i.test(msg)) return 'A API está limitando as requisições. Espere alguns segundos.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com a nuvem agora.';
  return msg;
}
