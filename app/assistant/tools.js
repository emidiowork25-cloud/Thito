// Ferramentas do JARBAS: o que ele pode consultar e alterar nos seus dados.
//
// As definições viajam até o Claude; a execução acontece aqui, no seu navegador.
// Nenhum dado precisa ser copiado para o servidor além do contexto resumido.

import * as store from '../core/store.js';
import { emit } from '../core/bus.js';
import { novaSala } from '../core/realtime.js';
import {
  today, addDays, monthKey, money, fmtDate, fmtTime, parseMoney, norm, uid, sum,
} from '../core/util.js';

/* ============================ definições ============================ */

export const definitions = [
  {
    name: 'criar_evento',
    description: 'Cria um compromisso na agenda. Use para reuniões, consultas, aulas, viagens e lembretes com data. Se o usuário disser "amanhã", "sexta" ou "semana que vem", converta para a data absoluta a partir da data de hoje informada no contexto.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título curto e específico do compromisso.' },
        data: { type: 'string', description: 'Data no formato AAAA-MM-DD.' },
        hora: { type: 'string', description: 'Hora de início HH:MM, se houver.' },
        hora_fim: { type: 'string', description: 'Hora de término HH:MM, se houver.' },
        categoria: { type: 'string', enum: ['trabalho', 'pessoal', 'estudo', 'saúde', 'financeiro', 'outro'] },
        notas: { type: 'string', description: 'Detalhes adicionais, local, link da chamada.' },
        recorrencia: { type: 'string', enum: ['diario', 'semanal', 'quinzenal', 'mensal', 'anual'], description: 'Só preencha se o compromisso se repete.' },
      },
      required: ['titulo', 'data'],
    },
  },
  {
    name: 'criar_tarefa',
    description: 'Cria uma tarefa/pendência, com ou sem prazo. Use quando não houver hora marcada — algo a fazer, não um compromisso.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        prazo: { type: 'string', description: 'Data limite AAAA-MM-DD, se houver.' },
        prioridade: { type: 'string', enum: ['baixa', 'normal', 'alta'] },
        notas: { type: 'string' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'concluir_tarefa',
    description: 'Marca como concluída a tarefa aberta que melhor corresponde ao texto informado.',
    input_schema: {
      type: 'object',
      properties: { busca: { type: 'string', description: 'Trecho do título da tarefa.' } },
      required: ['busca'],
    },
  },
  {
    name: 'registrar_transacao',
    description: 'Registra uma entrada ou saída de dinheiro. Use sempre que o usuário mencionar que gastou, pagou, recebeu ou comprou algo com valor.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'O que foi, em poucas palavras.' },
        valor: { type: 'number', description: 'Valor absoluto, sempre positivo.' },
        tipo: { type: 'string', enum: ['entrada', 'saida'] },
        data: { type: 'string', description: 'AAAA-MM-DD. Se omitido, usa hoje.' },
        categoria: {
          type: 'string',
          enum: ['moradia', 'alimentação', 'transporte', 'saúde', 'educação', 'lazer',
            'assinaturas', 'compras', 'impostos', 'salário', 'investimento', 'outro'],
        },
        conta: { type: 'string', description: 'Nome da conta. Se omitido, usa a primeira.' },
        recorrente: { type: 'boolean', description: 'Marque para contas fixas mensais.' },
      },
      required: ['descricao', 'valor', 'tipo'],
    },
  },
  {
    name: 'definir_orcamento',
    description: 'Define ou atualiza o limite mensal de gasto de uma categoria.',
    input_schema: {
      type: 'object',
      properties: {
        categoria: { type: 'string' },
        limite_mensal: { type: 'number' },
      },
      required: ['categoria', 'limite_mensal'],
    },
  },
  {
    name: 'adicionar_compra',
    description: 'Adiciona um item a uma lista de compras. Cria a lista se ela não existir.',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string' },
        lista: { type: 'string', description: 'Nome da lista. Padrão: Mercado.' },
        quantidade: { type: 'number' },
        preco_estimado: { type: 'number' },
        categoria: { type: 'string' },
      },
      required: ['item'],
    },
  },
  {
    name: 'marcar_compra',
    description: 'Marca um item da lista de compras como comprado (ou desmarca).',
    input_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Trecho do nome do item.' },
        comprado: { type: 'boolean', description: 'true para marcar, false para desmarcar. Padrão true.' },
      },
      required: ['item'],
    },
  },
  {
    name: 'registrar_reuniao',
    description: 'Salva uma anotação de reunião com participantes, decisões e encaminhamentos. Os encaminhamentos viram pendências rastreáveis.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        data: { type: 'string', description: 'AAAA-MM-DD. Padrão: hoje.' },
        participantes: { type: 'array', items: { type: 'string' } },
        pauta: { type: 'string' },
        notas: { type: 'string', description: 'Anotações corridas da conversa.' },
        decisoes: { type: 'string', description: 'O que ficou decidido.' },
        encaminhamentos: {
          type: 'array',
          description: 'Ações combinadas.',
          items: {
            type: 'object',
            properties: {
              texto: { type: 'string' },
              responsavel: { type: 'string' },
              prazo: { type: 'string', description: 'AAAA-MM-DD' },
            },
            required: ['texto'],
          },
        },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'criar_mindmap',
    description: 'Cria um mapa mental a partir de uma estrutura hierárquica de tópicos. Ótimo para organizar um assunto de estudo.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        raiz: {
          type: 'object',
          description: 'Nó central com filhos aninhados (até 4 níveis).',
          properties: {
            texto: { type: 'string' },
            filhos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  texto: { type: 'string' },
                  filhos: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        texto: { type: 'string' },
                        filhos: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] } },
                      },
                      required: ['texto'],
                    },
                  },
                },
                required: ['texto'],
              },
            },
          },
          required: ['texto'],
        },
      },
      required: ['titulo', 'raiz'],
    },
  },
  {
    name: 'criar_apresentacao',
    description: 'Monta uma apresentação a partir de tópicos. Gere slides com título e 3 a 5 marcadores objetivos cada, mais notas do apresentador.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        tema: { type: 'string', description: 'O assunto/briefing original pedido pelo usuário.' },
        slides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              marcadores: { type: 'array', items: { type: 'string' } },
              notas: { type: 'string', description: 'Roteiro de fala para este slide.' },
            },
            required: ['titulo', 'marcadores'],
          },
        },
      },
      required: ['titulo', 'slides'],
    },
  },
  {
    name: 'lembrar',
    description: 'Guarda um fato duradouro sobre o usuário (preferência, aniversário, meta, contexto de trabalho) para usar em conversas futuras. Use quando ele contar algo que valha lembrar depois — não para dados que já estão na agenda ou no financeiro.',
    input_schema: {
      type: 'object',
      properties: { fato: { type: 'string', description: 'Frase curta em primeira pessoa sobre o usuário.' } },
      required: ['fato'],
    },
  },
  {
    name: 'esquecer',
    description: 'Remove um fato guardado na memória.',
    input_schema: {
      type: 'object',
      properties: { busca: { type: 'string' } },
      required: ['busca'],
    },
  },
  {
    name: 'buscar',
    description: 'Busca em tudo (agenda, tarefas, financeiro, compras, reuniões, mapas, apresentações). Use quando precisar de algo que não está no contexto resumido.',
    input_schema: {
      type: 'object',
      properties: { termo: { type: 'string' } },
      required: ['termo'],
    },
  },
  {
    name: 'consultar_agenda',
    description: 'Lista os compromissos entre duas datas, expandindo recorrências.',
    input_schema: {
      type: 'object',
      properties: {
        de: { type: 'string', description: 'AAAA-MM-DD' },
        ate: { type: 'string', description: 'AAAA-MM-DD' },
      },
      required: ['de', 'ate'],
    },
  },
  {
    name: 'consultar_financas',
    description: 'Detalha as finanças de um mês: totais, por categoria e a lista de lançamentos.',
    input_schema: {
      type: 'object',
      properties: {
        mes: { type: 'string', description: 'AAAA-MM. Padrão: mês atual.' },
        categoria: { type: 'string', description: 'Filtra os lançamentos por categoria.' },
      },
    },
  },
  {
    name: 'criar_copy',
    description: 'Cria uma peça de texto no COPYWRITER (post, roteiro, anúncio, e-mail…). Respeite a voz de marca e o limite de caracteres da plataforma que estão no contexto. Se o usuário pediu variações, preencha o campo variacoes com abordagens realmente diferentes entre si, não sinônimos.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título interno, para o usuário achar depois.' },
        tipo: {
          type: 'string',
          enum: ['post', 'carrossel', 'roteiro de reels', 'roteiro de vídeo', 'anúncio', 'e-mail', 'thread', 'legenda', 'headline', 'outro'],
        },
        plataforma: {
          type: 'string',
          enum: ['instagram', 'reels', 'threads', 'x', 'linkedin', 'facebook', 'youtube', 'email', 'anuncio', 'site'],
        },
        texto: { type: 'string', description: 'O texto da peça, pronto para publicar.' },
        briefing: { type: 'string', description: 'Para quem é e o que precisa acontecer depois de ler.' },
        hashtags: { type: 'string', description: 'Hashtags separadas por espaço, quando fizerem sentido.' },
        variacoes: { type: 'array', items: { type: 'string' }, description: 'Outras abordagens do mesmo tema.' },
        campanha: { type: 'string', description: 'Nome da campanha a que esta peça pertence, se houver.' },
      },
      required: ['titulo', 'texto'],
    },
  },
  {
    name: 'criar_campanha',
    description: 'Cria uma campanha para agrupar peças em torno de um objetivo e um período.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        objetivo: { type: 'string', description: 'O que precisa acontecer: vendas, inscrições, alcance.' },
        de: { type: 'string', description: 'AAAA-MM-DD' },
        ate: { type: 'string', description: 'AAAA-MM-DD' },
        verba: { type: 'number' },
        notas: { type: 'string' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'criar_roteiro',
    description: 'Cria um roteiro no TELEPROMPTER, pronto para ser lido no ar. Escreva para ser FALADO: frases curtas, uma ideia por linha, sem parênteses, sem siglas não explicadas. Linhas entre colchetes viram marcação de operação e não são lidas — use para [VT 30s], [SOBE SOM], [VIRA CÂMERA 2].',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        texto: { type: 'string', description: 'O roteiro completo, com quebras de linha entre as falas.' },
        velocidade: { type: 'number', description: 'Linhas por minuto, de 20 a 400. Padrão 130.' },
      },
      required: ['titulo', 'texto'],
    },
  },
  {
    name: 'criar_freela',
    description: 'Registra um trabalho avulso no módulo FREELA: para quem é, qual a função, quanto e quando paga. Use quando a pessoa contar sobre um trabalho novo, mesmo que ainda seja proposta.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'O que é o trabalho.' },
        cliente: { type: 'string' },
        funcao: { type: 'string', description: 'O papel dela no trabalho: roteiro, apresentação, edição…' },
        valor: { type: 'number', description: 'Quanto paga, em reais.' },
        situacao: { type: 'string', enum: ['proposta', 'fechado', 'em andamento', 'entregue', 'cancelado'] },
        entrega_em: { type: 'string', description: 'AAAA-MM-DD' },
        paga_em: { type: 'string', description: 'AAAA-MM-DD' },
        como_paga: { type: 'string', description: 'ex.: 50% na assinatura, 50% na entrega' },
        contato: { type: 'string' },
        notas: { type: 'string' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'criar_evento_producao',
    description: 'Registra um evento no módulo EVENTOS, com cachê, equipe e checklist de antes/durante/depois. Não confundir com agendar_compromisso: este é a produção inteira, aquele é só o horário na agenda.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        data: { type: 'string', description: 'AAAA-MM-DD' },
        local: { type: 'string' },
        papel: { type: 'string', enum: ['contrato', 'integrante', 'sozinho'], description: 'contrato = ela contrata a equipe; integrante = ela é parte de uma equipe de outro.' },
        cache: { type: 'number', description: 'Quanto ela recebe, em reais.' },
        equipe: {
          type: 'array',
          description: 'Quem trabalha no evento e quanto cada um recebe.',
          items: {
            type: 'object',
            properties: { nome: { type: 'string' }, funcao: { type: 'string' }, valor: { type: 'number' } },
            required: ['nome'],
          },
        },
        antes: { type: 'array', items: { type: 'string' }, description: 'Checklist do que fazer antes.' },
        durante: { type: 'array', items: { type: 'string' } },
        depois: { type: 'array', items: { type: 'string' } },
        notas: { type: 'string' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'marcar_pago',
    description: 'Marca um freela ou o cachê de um evento como recebido, e lança a entrada no financeiro. Use quando a pessoa disser que o dinheiro caiu.',
    input_schema: {
      type: 'object',
      properties: {
        o_que: { type: 'string', description: 'Trecho do nome do freela ou do evento.' },
        valor: { type: 'number', description: 'Quanto caiu. Vazio = o valor combinado.' },
        quando: { type: 'string', description: 'AAAA-MM-DD. Vazio = hoje.' },
      },
      required: ['o_que'],
    },
  },
  {
    name: 'analisar_metricas',
    description: 'Lê um conjunto de métricas já importado (Meta Business, YouTube, planilha) e devolve os números crus para você analisar. Use antes de opinar sobre desempenho, em vez de confiar só no resumo do contexto.',
    input_schema: {
      type: 'object',
      properties: {
        conjunto: { type: 'string', description: 'Trecho do nome do conjunto. Vazio = o mais recente.' },
        limite: { type: 'number', description: 'Quantas linhas trazer. Padrão 40.' },
      },
    },
  },
  {
    name: 'abrir_secao',
    description: 'Abre uma seção do hub na tela do usuário. Use quando ele pedir para ver/mostrar algo.',
    input_schema: {
      type: 'object',
      properties: {
        secao: {
          type: 'string',
          enum: ['dashboard', 'agenda', 'financas', 'compras', 'mindmap', 'reunioes',
            'apresentacoes', 'copywriter', 'teleprompter', 'ajustes'],
        },
      },
      required: ['secao'],
    },
  },
];

/* ============================ execução ============================ */

const ok = (msg) => ({ content: msg, is_error: false });
const fail = (msg) => ({ content: msg, is_error: true });

/** Acha o registro cujo campo textual mais se aproxima da busca. */
function bestMatch(rows, field, query) {
  const q = norm(query);
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const r of rows) {
    const hay = norm(r[field]);
    if (!hay) continue;
    let score = 0;
    if (hay === q) score = 100;
    else if (hay.startsWith(q)) score = 80;
    else if (hay.includes(q)) score = 60 - Math.min(20, hay.length - q.length) / 2;
    else {
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      const hits = words.filter((w) => hay.includes(w)).length;
      if (hits) score = 20 + hits * 10;
    }
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return bestScore >= 20 ? best : null;
}

export async function execute(name, input = {}) {
  try {
    const handler = handlers[name];
    if (!handler) return fail(`Ferramenta desconhecida: ${name}`);
    return await handler(input);
  } catch (err) {
    console.error(`[tool:${name}]`, err);
    return fail(`Erro ao executar ${name}: ${err.message}`);
  }
}

const handlers = {
  async criar_evento(i) {
    const ev = await store.save('events', {
      title: i.titulo,
      date: i.data,
      time: i.hora || '',
      endTime: i.hora_fim || '',
      category: i.categoria || 'outro',
      notes: i.notas || '',
      recur: i.recorrencia || null,
    });
    emit('nav:refresh');
    return ok(`Compromisso criado: "${ev.title}" em ${fmtDate(ev.date, { weekday: true })}${ev.time ? ` às ${fmtTime(ev.time)}` : ''}${ev.recur ? ` (repete ${ev.recur})` : ''}.`);
  },

  async criar_tarefa(i) {
    const t = await store.save('tasks', {
      title: i.titulo,
      due: i.prazo || '',
      priority: i.prioridade || 'normal',
      notes: i.notas || '',
      done: false,
    });
    emit('nav:refresh');
    return ok(`Tarefa criada: "${t.title}"${t.due ? ` com prazo ${fmtDate(t.due)}` : ' sem prazo'}.`);
  },

  async concluir_tarefa(i) {
    const alvo = bestMatch(store.openTasks(), 'title', i.busca);
    if (!alvo) return fail(`Nenhuma tarefa aberta parecida com "${i.busca}".`);
    await store.save('tasks', { id: alvo.id, done: true, doneAt: today() });
    emit('nav:refresh');
    return ok(`Tarefa concluída: "${alvo.title}".`);
  },

  async registrar_transacao(i) {
    const contas = store.list('accounts');
    const conta = (i.conta && bestMatch(contas, 'name', i.conta)) || contas[0];
    if (!conta) return fail('Nenhuma conta cadastrada. Crie uma conta em Finanças primeiro.');
    const tx = await store.save('transactions', {
      desc: i.descricao,
      amount: Math.abs(parseMoney(i.valor)),
      type: i.tipo === 'entrada' ? 'in' : 'out',
      date: i.data || today(),
      category: i.categoria || 'outro',
      accountId: conta.id,
      recurring: !!i.recorrente,
    });
    emit('nav:refresh');
    const saldo = store.accountBalance(conta.id);
    return ok(`Lançado: ${tx.type === 'out' ? 'saída' : 'entrada'} de ${money(tx.amount)} em "${tx.desc}" (${tx.category}) na conta ${conta.name}. Saldo da conta agora: ${money(saldo)}.`);
  },

  async definir_orcamento(i) {
    const existente = store.list('budgets').find((b) => norm(b.category) === norm(i.categoria));
    const b = await store.save('budgets', {
      id: existente?.id,
      category: i.categoria,
      monthly: Math.abs(parseMoney(i.limite_mensal)),
    });
    emit('nav:refresh');
    return ok(`Orçamento de ${b.category} definido em ${money(b.monthly)} por mês.`);
  },

  async adicionar_compra(i) {
    const nomeLista = i.lista || 'Mercado';
    let lista = bestMatch(store.activeLists(), 'name', nomeLista);
    if (!lista) lista = await store.save('lists', { name: nomeLista, archived: false });
    const item = await store.save('items', {
      listId: lista.id,
      name: i.item,
      qty: Number(i.quantidade) || 1,
      price: i.preco_estimado != null ? parseMoney(i.preco_estimado) : 0,
      category: i.categoria || '',
      done: false,
    });
    emit('nav:refresh');
    return ok(`"${item.name}"${item.qty > 1 ? ` ×${item.qty}` : ''} adicionado à lista ${lista.name}.`);
  },

  async marcar_compra(i) {
    const todos = store.activeLists().flatMap((l) => store.listItems(l.id));
    const alvo = bestMatch(todos, 'name', i.item);
    if (!alvo) return fail(`Não achei "${i.item}" nas listas de compras.`);
    const comprado = i.comprado !== false;
    await store.save('items', { id: alvo.id, done: comprado });
    emit('nav:refresh');
    return ok(`"${alvo.name}" marcado como ${comprado ? 'comprado' : 'pendente'}.`);
  },

  async registrar_reuniao(i) {
    const actions = (i.encaminhamentos || []).map((a) => ({
      id: uid(), text: a.texto, owner: a.responsavel || '', due: a.prazo || '', done: false,
    }));
    const m = await store.save('meetings', {
      title: i.titulo,
      date: i.data || today(),
      participants: i.participantes || [],
      agenda: i.pauta || '',
      notes: i.notas || '',
      decisions: i.decisoes || '',
      actions,
    });
    emit('nav:refresh');
    return ok(`Reunião "${m.title}" registrada em ${fmtDate(m.date)}${actions.length ? ` com ${actions.length} encaminhamento(s)` : ''}.`);
  },

  async criar_mindmap(i) {
    const nodes = [];
    const walk = (node, parentId, depth) => {
      const id = uid();
      nodes.push({ id, text: node.texto, parent: parentId, depth });
      for (const child of node.filhos || []) walk(child, id, depth + 1);
      return id;
    };
    walk(i.raiz, null, 0);
    const map = await store.save('mindmaps', { title: i.titulo, nodes, layout: 'radial' });
    emit('nav:refresh');
    emit('nav:go', { view: 'mindmap', id: map.id });
    return ok(`Mapa mental "${map.title}" criado com ${nodes.length} nós e aberto na tela.`);
  },

  async criar_apresentacao(i) {
    const slides = (i.slides || []).map((s) => ({
      id: uid(), title: s.titulo, bullets: s.marcadores || [], notes: s.notas || '',
    }));
    const deck = await store.save('decks', { title: i.titulo, topic: i.tema || '', slides, theme: 'hud' });
    emit('nav:refresh');
    emit('nav:go', { view: 'apresentacoes', id: deck.id });
    return ok(`Apresentação "${deck.title}" criada com ${slides.length} slides e aberta na tela.`);
  },

  async lembrar(i) {
    const n = await store.save('notes', { kind: 'memory', body: i.fato, title: i.fato.slice(0, 60) });
    return ok(`Anotado na memória: "${n.body}".`);
  },

  async esquecer(i) {
    const alvo = bestMatch(store.list('notes', (n) => n.kind === 'memory'), 'body', i.busca);
    if (!alvo) return fail(`Não encontrei nada na memória sobre "${i.busca}".`);
    await store.remove('notes', alvo.id);
    return ok(`Esquecido: "${alvo.body}".`);
  },

  async buscar(i) {
    const res = store.search(i.termo, 25);
    if (!res.length) return ok(`Nenhum resultado para "${i.termo}".`);
    return ok(`${res.length} resultado(s):\n${res.map((r) => `- [${r.label}] ${r.title}${r.date ? ` — ${r.date}` : ''}`).join('\n')}`);
  },

  async consultar_agenda(i) {
    const evs = store.eventsBetween(i.de, i.ate);
    if (!evs.length) return ok(`Nada na agenda entre ${i.de} e ${i.ate}.`);
    return ok(`${evs.length} compromisso(s):\n${evs.map((e) =>
      `- ${fmtDate(e.occurrence, { weekday: true })}${e.time ? ` ${fmtTime(e.time)}` : ''} — ${e.title}${e.category ? ` [${e.category}]` : ''}`).join('\n')}`);
  },

  async consultar_financas(i) {
    const mk = i.mes || monthKey(today());
    const resumo = store.monthSummary(mk);
    let txs = store.monthTransactions(mk);
    if (i.categoria) txs = txs.filter((t) => norm(t.category) === norm(i.categoria));

    const linhas = [
      `Mês ${mk}: entradas ${money(resumo.income)} | saídas ${money(resumo.expense)} | resultado ${money(resumo.net)}`,
      `Por categoria: ${Object.entries(resumo.byCategory).sort((a, b) => b[1] - a[1])
        .map(([c, v]) => `${c} ${money(v)}`).join(', ') || 'sem gastos'}`,
      '',
      `Lançamentos${i.categoria ? ` em ${i.categoria}` : ''} (${txs.length}):`,
      ...txs.slice(0, 40).map((t) => `- ${fmtDate(t.date)} ${t.type === 'out' ? '−' : '+'}${money(t.amount)} ${t.desc} [${t.category}]`),
    ];
    return ok(linhas.join('\n'));
  },

  async criar_copy(i) {
    let campaignId;
    if (i.campanha) campaignId = bestMatch(store.list('campaigns'), 'name', i.campanha)?.id;
    const peca = await store.save('copies', {
      title: i.titulo,
      kind: i.tipo || 'post',
      platform: i.plataforma || 'instagram',
      body: i.texto,
      brief: i.briefing || '',
      hashtags: i.hashtags || '',
      variants: i.variacoes || [],
      status: 'revisar',
      campaignId,
    });
    emit('nav:refresh');
    emit('nav:go', { view: 'copywriter', id: peca.id });
    const n = peca.body.length;
    return ok(`Peça "${peca.title}" criada com ${n} caracteres${peca.variants.length ? ` e ${peca.variants.length} variação(ões)` : ''}, e aberta na tela para você revisar.`);
  },

  async criar_campanha(i) {
    const c = await store.save('campaigns', {
      name: i.nome,
      goal: i.objetivo || '',
      from: i.de || today(),
      to: i.ate || '',
      budget: i.verba != null ? parseMoney(i.verba) : 0,
      notes: i.notas || '',
    });
    emit('nav:refresh');
    return ok(`Campanha "${c.name}" criada${c.goal ? ` com o objetivo: ${c.goal}` : ''}.`);
  },

  async criar_roteiro(i) {
    const linhas = String(i.texto || '').split('\n').length;
    const velocidade = Math.min(400, Math.max(20, Number(i.velocidade) || 130));
    const script = await store.save('scripts', {
      title: i.titulo,
      body: i.texto,
      sala: novaSala(),
      config: { velocidade },
    });
    emit('nav:refresh');
    emit('nav:go', { view: 'teleprompter', id: script.id });
    const minutos = (linhas / velocidade).toFixed(1);
    return ok(`Roteiro "${script.title}" criado com ${linhas} linhas (~${minutos} min no ar a ${velocidade} linhas/min) e aberto no teleprompter.`);
  },

  async criar_freela(i) {
    const f = await store.save('freelas', {
      title: i.titulo, client: i.cliente, role: i.funcao,
      valor: Number(i.valor) || 0, status: i.situacao || 'proposta',
      entregaEm: i.entrega_em || null, pagaEm: i.paga_em || null,
      comoPaga: i.como_paga, contato: i.contato, notes: i.notas,
      pago: false, pagoEm: null, transactionId: null,
    });
    emit('nav:refresh');
    return ok(`Freela "${f.title}" registrado${f.client ? ` para ${f.client}` : ''}${f.valor ? `, ${money(f.valor)}` : ''}.`);
  },

  async criar_evento_producao(i) {
    const lista = (itens) => (itens ?? []).map((text) => ({ id: uid(), text, done: false }));
    const e = await store.save('producoes', {
      title: i.titulo, date: i.data || null, local: i.local,
      papel: i.papel || 'contrato', cache: Number(i.cache) || 0, notes: i.notas,
      equipe: (i.equipe ?? []).map((m) => ({ id: uid(), nome: m.nome, funcao: m.funcao, valor: Number(m.valor) || 0, pago: false })),
      checklist: { antes: lista(i.antes), durante: lista(i.durante), depois: lista(i.depois) },
      custos: [], pago: false, pagoEm: null, transactionId: null,
    });
    emit('nav:refresh');
    const n = (i.antes?.length ?? 0) + (i.durante?.length ?? 0) + (i.depois?.length ?? 0);
    return ok(`Evento "${e.title}" criado${e.date ? ` para ${e.date}` : ''}${n ? `, com ${n} item(ns) de checklist` : ''}.`);
  },

  async marcar_pago(i) {
    const quando = i.quando || store.today();
    const freela = bestMatch(store.list('freelas', (f) => !f.pago), 'title', i.o_que);
    const evento = freela ? null : bestMatch(store.list('producoes', (e) => !e.pago), 'title', i.o_que);
    if (!freela && !evento) return fail(`Não achei nada em aberto com o nome "${i.o_que}".`);

    const alvo = freela ?? evento;
    const colecao = freela ? 'freelas' : 'producoes';
    const valor = Number(i.valor) || Number(freela ? alvo.valor : alvo.cache) || 0;

    const contas = store.list('accounts');
    let transactionId = null;
    if (valor > 0 && contas.length) {
      const tx = await store.save('transactions', {
        desc: `${freela ? 'Freela' : 'Evento'} — ${alvo.title || 'sem título'}`,
        amount: valor, type: 'in', date: quando, category: 'salário', accountId: contas[0].id,
      });
      transactionId = tx.id;
    }
    await store.save(colecao, {
      id: alvo.id, pago: true, pagoEm: quando, transactionId,
      ...(freela ? { valor } : { cache: valor }),
    });
    emit('nav:refresh');
    return ok(`"${alvo.title}" marcado como recebido${valor ? ` — ${money(valor)} lançado no financeiro` : ''}.`);
  },

  async analisar_metricas(i) {
    const conjuntos = store.list('metrics')
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (!conjuntos.length) return fail('Nenhum conjunto de métricas importado ainda. Importe pelo COPYWRITER → Insights.');

    const alvo = i.conjunto ? bestMatch(conjuntos, 'title', i.conjunto) : conjuntos[0];
    if (!alvo) return fail(`Não achei um conjunto parecido com "${i.conjunto}".`);

    const limite = Math.min(120, Math.max(1, Number(i.limite) || 40));
    const linhas = alvo.linhas.slice(0, limite);
    const cabecalho = alvo.colunas.join(' | ');
    const corpo = linhas.map((l) => alvo.colunas.map((c) => l[c] ?? '').join(' | ')).join('\n');
    const resto = alvo.linhas.length > limite ? `\n… e mais ${alvo.linhas.length - limite} linhas` : '';
    return ok(`Conjunto "${alvo.title}" (${alvo.linhas.length} linhas, importado em ${alvo.date}):\n\n${cabecalho}\n${corpo}${resto}`);
  },

  async abrir_secao(i) {
    emit('nav:go', { view: i.secao });
    return ok(`Seção "${i.secao}" aberta na tela.`);
  },
};

/** Rótulo curto exibido no log da conversa enquanto a ferramenta roda. */
export const label = (name, input = {}) => ({
  criar_evento: `agendando "${input.titulo}"`,
  criar_tarefa: `criando tarefa "${input.titulo}"`,
  concluir_tarefa: `concluindo "${input.busca}"`,
  registrar_transacao: `lançando ${money(input.valor)} — ${input.descricao}`,
  definir_orcamento: `definindo orçamento de ${input.categoria}`,
  adicionar_compra: `adicionando "${input.item}" à lista`,
  marcar_compra: `marcando "${input.item}"`,
  registrar_reuniao: `salvando reunião "${input.titulo}"`,
  criar_mindmap: `montando mapa "${input.titulo}"`,
  criar_apresentacao: `montando apresentação "${input.titulo}"`,
  lembrar: 'guardando na memória',
  esquecer: 'apagando da memória',
  buscar: `buscando "${input.termo}"`,
  consultar_agenda: `consultando agenda ${input.de} → ${input.ate}`,
  consultar_financas: `consultando finanças de ${input.mes || 'este mês'}`,
  criar_copy: `escrevendo "${input.titulo}"`,
  criar_campanha: `criando campanha "${input.nome}"`,
  criar_roteiro: `montando roteiro "${input.titulo}"`,
  analisar_metricas: `lendo métricas${input.conjunto ? ` de "${input.conjunto}"` : ''}`,
  abrir_secao: `abrindo ${input.secao}`,
}[name] ?? `executando ${name}`);
