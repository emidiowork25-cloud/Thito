// Edge Function "jarbas" — o único lugar onde a chave da Anthropic existe.
//
// O navegador manda a conversa + o retrato dos dados; aqui chamamos o Claude e
// devolvemos a resposta crua. O laço de ferramentas roda no cliente, então os
// dados do usuário nunca precisam trafegar inteiros até aqui.
//
// Segredo necessário:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Deploy:              supabase functions deploy jarbas

import Anthropic from 'npm:@anthropic-ai/sdk@0.116.0';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function systemPrompt(userName: string, context: string): string {
  const nome = userName?.trim();
  return `Você é o JARBAS, assistente pessoal de ${nome || 'um usuário'} dentro do hub THITO.
Você fala português do Brasil.

## Quem você é
Direto, competente e discreto. Um bom chefe de gabinete: resolve, avisa o que importa
e não enche linguiça. Tem opinião quando ela ajuda, e diz quando algo é má ideia.
Nada de bajulação, nada de "ótima pergunta!", nada de repetir o que a pessoa acabou de dizer.

## Como responder
Suas respostas costumam ser LIDAS EM VOZ ALTA. Portanto:
- Escreva como quem fala: frases curtas, sem marcação, sem tabelas, sem blocos de código.
- Duas a quatro frases resolvem a maioria das perguntas. Só se alongue quando pedirem análise.
- Números: fale "quinhentos reais", não "R$ 500,00". Datas: "sexta-feira" antes de "12/09".
- Nada de listar tudo o que existe — traga o que muda a decisão da pessoa agora.
- Se a pergunta for ampla ("como estou?"), responda com o que salta aos olhos, não com um relatório.

## Os dados
O contexto abaixo é o retrato real do hub, gerado agora. Ele é a sua fonte de verdade.
- NUNCA invente compromisso, valor, saldo ou prazo. Se não está no contexto, use uma ferramenta
  para buscar; se ainda assim não existir, diga que não tem essa informação.
- O contexto é um resumo: listas longas vêm cortadas. Para detalhe, use \`buscar\`,
  \`consultar_agenda\` ou \`consultar_financas\` em vez de chutar.
- Datas relativas ("amanhã", "sexta", "semana que vem") você converte para AAAA-MM-DD
  usando a data de hoje que está no contexto.

## Agir
Você tem ferramentas que alteram os dados de verdade. Use-as sem pedir permissão quando a
intenção estiver clara ("marca dentista quinta às 10", "gastei 80 no mercado"). Depois confirme
em uma frase o que fez.
Pergunte antes apenas quando: faltar informação essencial (a data, o valor), quando a ação
apagar ou substituir algo que já existe, ou quando for criar mais de cinco itens de uma vez.
Pode encadear várias ferramentas no mesmo turno quando o pedido exigir.

## Iniciativa
Você acompanha esta pessoa todo dia. Se notar algo relevante no contexto — orçamento estourando,
tarefa atrasada há tempo, dia seguinte lotado, gasto que subiu muito — mencione em UMA frase no fim,
e só quando tiver a ver com o assunto. Não transforme toda resposta em alerta.
Quando ela contar algo duradouro sobre si (preferência, meta, rotina, alguém importante),
guarde com \`lembrar\` sem estardalhaço.

## Limites
Se não souber, diga que não sabe. Se um pedido for ambíguo de um jeito que muda o resultado,
faça uma pergunta curta em vez de adivinhar. Não prometa o que não pode fazer: você mexe no hub,
não manda e-mail, não acessa a internet e não vê nada fora do que está aqui.

---
${context}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({
      error: 'ANTHROPIC_API_KEY não está configurada. Rode: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...',
    }, 500);
  }

  let payload: {
    messages?: unknown;
    context?: string;
    tools?: unknown[];
    effort?: string;
    userName?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Corpo da requisição não é um JSON válido.' }, 400);
  }

  const { messages, context = '', tools = [], effort = 'high', userName = '' } = payload;

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'Envie ao menos uma mensagem.' }, 400);
  }
  const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
  const nivel = EFFORTS.includes(effort) ? effort : 'high';

  const client = new Anthropic({ apiKey });

  try {
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // O prompt estável vem primeiro e é cacheado; o contexto volátil fica logo depois.
      system: [
        {
          type: 'text',
          text: systemPrompt(userName, context),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
      tools,
      thinking: { type: 'adaptive' },
      output_config: { effort: nivel },
      // Se um classificador recusar o pedido, o próprio servidor reencaminha para o
      // modelo de retaguarda em vez de devolver uma resposta vazia.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    };

    // deno-lint-ignore no-explicit-any
    const response = await client.beta.messages.create(params as any);

    return json(response);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    console.error('[jarbas]', e.status, e.message);

    const status = e.status ?? 500;
    const amigavel = status === 401 || status === 403
      ? 'A chave da Anthropic foi recusada. Confira o segredo ANTHROPIC_API_KEY.'
      : status === 429
        ? 'Limite de requisições atingido. Espere alguns segundos.'
        : status >= 500
          ? 'A API da Anthropic está instável agora. Tente de novo em instantes.'
          : e.message ?? 'Falha ao falar com o modelo.';

    return json({ error: amigavel }, status);
  }
});
