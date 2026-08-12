// De um link a um post — a peça de social do Copywriter.
//
// O que este arquivo guarda não é código difícil: é o BRIEFING. Um pedido
// vago ("escreva um post sobre isso") devolve o texto que qualquer um
// escreveria, e é justamente esse texto que ninguém lê. Então aqui está
// escrito o que um bom post tem, formato por formato, com número de caracteres
// e ordem das partes.

import { pedirEstrutura, LER_PAGINA } from './modelo.js';

/** Os formatos que o gerador sabe escrever, com o que cada um exige. */
export const FORMATOS = {
  carrossel: {
    rotulo: 'Carrossel',
    tipo: 'carrossel',
    regra: 'De 6 a 10 cards. O card 1 é a promessa e sozinho decide se o resto será visto; os do meio entregam UMA ideia cada, em no máximo 20 palavras; o último pede a ação. Nada de "arrasta pro lado" — se o card 1 prender, a pessoa arrasta.',
  },
  reels: {
    rotulo: 'Reels / TikTok',
    tipo: 'roteiro de reels',
    regra: 'Roteiro de 30 a 45 segundos, marcado em blocos de tempo. Os 3 primeiros segundos são fala, não vinheta, e já entregam o conflito. Escreva a fala, e entre colchetes o que aparece na tela.',
  },
  estatico: {
    rotulo: 'Post estático',
    tipo: 'post',
    regra: 'Uma imagem e uma legenda. A primeira linha da legenda tem que funcionar sozinha, porque é só ela que aparece antes do "mais". Sugira o que a imagem mostra.',
  },
  card: {
    rotulo: 'Card com texto',
    tipo: 'post',
    regra: 'O texto vai DENTRO da arte: no máximo 12 palavras, em duas ou três linhas, legível a três metros de distância. A legenda desdobra o que o card afirma.',
  },
  stories: {
    rotulo: 'Stories',
    tipo: 'post',
    regra: 'De 3 a 5 telas, uma frase por tela. Uma delas traz enquete, caixinha ou pergunta — stories sem interação é stories que o algoritmo não mostra de novo.',
  },
  thread: {
    rotulo: 'Thread',
    tipo: 'thread',
    regra: 'De 5 a 8 posts numerados, cada um com no máximo 280 caracteres e fazendo sentido sozinho. O primeiro é a tese inteira; o último resume e chama.',
  },
  legenda: {
    rotulo: 'Legenda curta',
    tipo: 'legenda',
    regra: 'Até 3 linhas. Para quando a imagem já diz quase tudo e o texto só dá o contexto e o convite.',
  },
  youtube: {
    rotulo: 'Título e descrição (YouTube)',
    tipo: 'outro',
    regra: 'Título de até 60 caracteres com a palavra-chave nas primeiras palavras. Descrição com o resumo nos dois primeiros parágrafos, depois capítulos com tempo, depois links.',
  },
};

export const OBJETIVOS = {
  alcance: 'alcance — ser mostrado para quem ainda não te segue',
  engajamento: 'engajamento — provocar comentário e salvamento',
  autoridade: 'autoridade — mostrar que você entende do assunto',
  trafego: 'tráfego — levar para um link',
  venda: 'venda — fazer comprar ou se inscrever',
};

export const FERRAMENTA = {
  name: 'criar_variacoes',
  description: 'Entrega as variações de post pedidas, junto do que foi apurado sobre a fonte.',
  input_schema: {
    type: 'object',
    properties: {
      fonte_lida: {
        type: 'boolean',
        description: 'true SOMENTE se você realmente leu o conteúdo do link ou o texto colado. false se a página não abriu, exigiu login ou veio vazia.',
      },
      fonte_titulo: { type: 'string', description: 'Título do que você leu. Vazio se não leu nada.' },
      fonte_resumo: { type: 'string', description: 'Em até 3 linhas, o que a fonte diz. Só o que está lá dentro.' },
      angulo: { type: 'string', description: 'O recorte escolhido para o post e por que ele interessa a este público, em uma frase.' },
      palavras_chave: {
        type: 'array', items: { type: 'string' },
        description: 'De 4 a 8 termos que as pessoas realmente digitam ao procurar este assunto. Eles devem aparecer nas primeiras linhas dos textos, não só nas hashtags.',
      },
      variacoes: {
        type: 'array',
        description: 'Uma entrada por formato pedido.',
        items: {
          type: 'object',
          properties: {
            formato: { type: 'string', description: 'A chave do formato pedido: carrossel, reels, estatico, card, stories, thread, legenda, youtube.' },
            titulo_interno: { type: 'string', description: 'Nome curto para achar esta peça depois. Não é o texto do post.' },
            gancho: { type: 'string', description: 'A primeira linha, a que decide se o resto é lido.' },
            corpo: { type: 'string', description: 'O texto principal, pronto para copiar e colar. Use quebras de linha de verdade.' },
            cards: {
              type: 'array', items: { type: 'string' },
              description: 'Um texto por card/tela/post, quando o formato tiver partes (carrossel, stories, thread). Vazio nos demais.',
            },
            cta: { type: 'string', description: 'A ação pedida, uma só, escrita como se fala.' },
            hashtags: { type: 'string', description: 'De 5 a 12 hashtags separadas por espaço, misturando amplas e de nicho. Sem inventar hashtag que ninguém usa.' },
            visual: { type: 'string', description: 'O que a imagem, o card ou a cena mostram. Uma frase, para quem vai produzir.' },
          },
          required: ['formato', 'titulo_interno', 'gancho', 'corpo'],
        },
      },
    },
    required: ['fonte_lida', 'variacoes'],
  },
};

/**
 * O briefing.
 *
 * A regra que mais importa é a primeira, e não é sobre escrita: **não inventar
 * o que não foi lido**. Instagram exige login e quase nunca abre para um
 * leitor automático; se o modelo preencher a lacuna com o que "provavelmente"
 * estava lá, o post sai afirmando coisas sobre uma notícia que ninguém leu — e
 * quem publica assina embaixo. Melhor voltar de mãos vazias e dizer isso.
 */
function briefing({ url, colado, formatos, objetivo, publico, marca, extra }) {
  const pedidos = formatos.map((f) => `- ${FORMATOS[f].rotulo} (chave "${f}"): ${FORMATOS[f].regra}`);

  return [
    'Você é o redator de redes desta casa. Conhece o que faz um post ser lido até o fim,',
    'escreve para busca sem soar como texto de robô, e prefere uma frase que morde a três que enfeitam.',
    '',
    '## A fonte',
    url ? `Link: ${url}` : 'Sem link.',
    url ? 'Use a ferramenta web_fetch para ler a página antes de escrever qualquer coisa.' : '',
    colado ? `\nTexto fornecido por quem pediu:\n"""\n${colado}\n"""` : '',
    '',
    '### A regra que vem antes de todas',
    'Não invente o conteúdo da fonte. Se o link não abrir, exigir login ou vier vazio — o que é comum',
    'no Instagram —, marque fonte_lida como false e diga isso. Só escreva as variações se você tiver',
    'material de verdade: a página que abriu ou o texto colado acima. Um post que afirma coisas sobre',
    'uma matéria que ninguém leu é pior do que post nenhum, porque quem publica assina embaixo.',
    '',
    '## O que escrever',
    `Objetivo: ${OBJETIVOS[objetivo] ?? objetivo}.`,
    publico ? `Público: ${publico}` : '',
    marca ? `\nVoz da marca (siga, não descreva):\n${marca}` : '',
    extra ? `\nPedido específico de quem encomendou: ${extra}` : '',
    '',
    'Formatos pedidos:',
    ...pedidos,
    '',
    '## Como escrever',
    '- Escreva em português do Brasil, na primeira pessoa de quem publica.',
    '- O gancho não pode ser pergunta genérica ("você sabia que…?") nem promessa vazia ("isso vai mudar tudo").',
    '  Um bom gancho traz um número, uma tensão ou uma frase que contraria o senso comum.',
    '- Uma ideia por bloco. Frase longa é onde o leitor solta o polegar.',
    '- Busca: as palavras que a pessoa digitaria precisam estar nas PRIMEIRAS linhas, não só nas hashtags.',
    '- Sem emoji em cada linha, sem CAIXA ALTA gritando, sem "link na bio" se não há link.',
    '- Um CTA por peça. Dois pedidos ao mesmo tempo viram nenhum.',
    '- Nada de dado, número ou citação que não esteja na fonte.',
  ].filter((l) => l !== '').join('\n');
}

/**
 * Transforma a fonte em variações. Devolve `{ dados }` ou `{ texto }` — ver
 * pedirEstrutura em modelo.js.
 */
export function gerar(opcoes) {
  return pedirEstrutura({
    mensagens: [{ role: 'user', content: briefing(opcoes) }],
    ferramenta: FERRAMENTA,
    // A leitura da página só entra quando há link. Sem isso o modelo tenta
    // buscar na web um texto que já está colado na frente dele.
    extras: opcoes.url ? [LER_PAGINA] : [],
  });
}

/** Monta o texto final da peça, na ordem em que se cola no aplicativo. */
export function montarCorpo(v) {
  const partes = [];
  if (v.cards?.length) {
    partes.push(v.cards.map((c, i) => `${i + 1}. ${c}`).join('\n\n'));
    if (v.corpo && v.corpo !== v.cards.join('\n')) partes.push('—\n' + v.corpo);
  } else {
    partes.push(v.corpo ?? '');
  }
  if (v.cta) partes.push(v.cta);
  return partes.filter(Boolean).join('\n\n').trim();
}
