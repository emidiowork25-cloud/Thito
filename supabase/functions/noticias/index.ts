// Edge Function "noticias" — busca as manchetes do dia. Custo zero.
//
// Por que ela existe: os sites de notícia não mandam cabeçalho CORS, então o
// navegador não consegue ler um feed RSS direto. Esta função faz a leitura do
// lado do servidor e devolve as manchetes já limpas.
//
// Nenhuma IA participa disto. A manchete já vem escrita por quem a escreveu —
// mandar um modelo reescrevê-la seria o passo mais caro e menos útil da
// corrente. Se você quiser o comentário do JARBAS, isso é um botão à parte,
// no app, com as manchetes já buscadas.
//
// Deploy: supabase functions deploy noticias

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

/** Limites de sanidade: o cliente manda os temas, mas não manda o que quiser. */
const MAX_TEMAS = 10;
const MAX_CONSULTA = 120;
const POR_TEMA = 5;
const TIMEOUT_MS = 9000;
const MAX_TITULO = 160;

/**
 * Rede social entra no índice do Google Notícias e sai como manchete, mas não
 * é manchete: vem sem edição, com emoji, hashtag e o texto inteiro do post no
 * título. Uma linha dessas come o cartão sozinha.
 */
const FONTES_FORA = ['instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com'];

type Tema = { id?: string; label?: string; q?: string };
type Item = { titulo: string; fonte: string; link: string; quando: string | null };

/**
 * O cliente manda só o texto da consulta — a URL é montada aqui. É o que
 * impede a função de virar um proxy para buscar qualquer endereço da internet.
 */
function urlDoTema(q: string): string {
  const base = 'https://news.google.com/rss';
  const idioma = 'hl=pt-BR&gl=BR&ceid=BR:pt-419';
  const consulta = q.trim().slice(0, MAX_CONSULTA);
  return consulta
    ? `${base}/search?q=${encodeURIComponent(consulta)}&${idioma}`
    : `${base}?${idioma}`;   // sem consulta = manchetes gerais do dia
}

const ENTIDADES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&apos;': "'", '&#39;': "'", '&nbsp;': ' ',
};

function limpar(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}

const entre = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? limpar(m[1]) : null;
};

/**
 * O Google Notícias escreve o título como "Manchete - Veículo" e repete o
 * veículo na tag <source>. Quando os dois batem, o sufixo sai do título: ler
 * "- G1" no fim de toda linha não informa nada que a etiqueta de fonte já não diga.
 */
function partirTitulo(titulo: string, fonte: string | null): string {
  if (!fonte) return titulo;
  const sufixo = ` - ${fonte}`;
  return titulo.endsWith(sufixo) ? titulo.slice(0, -sufixo.length).trim() : titulo;
}

function parsear(xml: string): Item[] {
  const itens: Item[] = [];
  for (const bloco of xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []) {
    const titulo = entre(bloco, 'title');
    const link = entre(bloco, 'link');
    if (!titulo || !link) continue;
    const fonte = entre(bloco, 'source');
    const limpo = partirTitulo(titulo, fonte);
    if (fonte && FONTES_FORA.some((d) => fonte.toLowerCase().includes(d))) continue;
    if (limpo.length > MAX_TITULO) continue;
    itens.push({ titulo: limpo, fonte: fonte ?? '', link, quando: entre(bloco, 'pubDate') });
  }
  return itens;
}

async function buscarTema(tema: Tema): Promise<{ id: string; label: string; itens: Item[]; erro?: string }> {
  const id = String(tema.id ?? '').slice(0, 40) || 'tema';
  const label = String(tema.label ?? id).slice(0, 60);
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(urlDoTema(String(tema.q ?? '')), {
      signal: controle.signal,
      headers: {
        // Navegador de verdade: a partir de um datacenter, um User-Agent
        // esquisito é o caminho mais curto para levar 403 ou página de captcha.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          + '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        // Pula o muro de consentimento do Google, que responde 200 com uma
        // página HTML no lugar do feed — e HTML sem <item> é indistinguível
        // de "não há notícias" para quem só conta itens.
        Cookie: 'CONSENT=YES+cb; SOCS=CAI',
      },
    });
    if (!res.ok) return { id, label, itens: [], erro: `feed respondeu ${res.status}` };

    const corpo = await res.text();
    const vistos = new Set<string>();
    const itens = parsear(corpo)
      .filter((i) => (vistos.has(i.titulo) ? false : (vistos.add(i.titulo), true)))
      .slice(0, POR_TEMA);

    // Zero itens com HTTP 200 quase nunca é "não há notícias": é outra coisa no
    // lugar do feed. O tipo e o tamanho do que veio dizem qual — e sem isso o
    // erro chega na tela como "não veio nada", que não ajuda ninguém.
    if (!itens.length) {
      const tipo = res.headers.get('content-type')?.split(';')[0] ?? 'sem tipo';
      return { id, label, itens: [], erro: `resposta sem notícias (${tipo}, ${Math.round(corpo.length / 1024)} KB)` };
    }
    return { id, label, itens };
  } catch (e) {
    // Um tema que falha não pode derrubar os outros: o cartão mostra o que veio
    // e diz o que faltou, em vez de aparecer vazio sem explicação.
    const erro = (e as Error).name === 'AbortError' ? 'demorou demais' : (e as Error).message;
    return { id, label, itens: [], erro };
  } finally {
    clearTimeout(relogio);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    const { temas } = await req.json() as { temas?: Tema[] };
    if (!Array.isArray(temas) || !temas.length) return json({ error: 'Nenhum tema pedido.' }, 400);

    const resultado = await Promise.all(temas.slice(0, MAX_TEMAS).map(buscarTema));
    return json({ geradoEm: new Date().toISOString(), temas: resultado });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Falha ao buscar notícias.' }, 500);
  }
});
