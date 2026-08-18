// Edge Function "ler" — o leitor de links do JARBAS.
//
// Existe porque o navegador não pode buscar página de outro domínio, e porque a
// ferramenta de leitura do modelo não executa JavaScript. Aqui é um servidor:
// busca de verdade, com cabeçalho de navegador, e devolve texto limpo.
//
// O que ela NÃO faz, e é bom estar escrito: não entra em lugar que exige login.
// Instagram, TikTok, Facebook e afins devolvem a casca da tela de login para
// quem não tem sessão — 600 KB de nada. Fingir que leu seria pior que recusar.
//
// Deploy:  supabase functions deploy ler

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CABECA = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
};

/** Redes que só abrem para quem está logado. Recusar cedo poupa a espera. */
const FECHADAS = /(^|\.)(instagram\.com|tiktok\.com|facebook\.com|threads\.net|x\.com|twitter\.com|linkedin\.com)$/i;

/**
 * Endereços que esta função nunca busca.
 *
 * Um leitor de links é, por natureza, alguém pedindo "busque isto para mim" —
 * e quem pede escolhe o endereço. Sem esta lista, bastaria mandar
 * `169.254.169.254` para a função ir buscar as credenciais da máquina onde ela
 * roda e devolvê-las como se fossem o texto de uma página. Vale para localhost
 * e para as faixas privadas pelo mesmo motivo: são a rede de dentro, não a web.
 */
const PROIBIDOS = [
  /^localhost$/i, /^\[?::1\]?$/, /^0\./,
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /\.internal$/i, /\.local$/i,
];
const enderecoInterno = (host: string) => PROIBIDOS.some((r) => r.test(host));

const buscar = (url: string, extra: Record<string, string> = {}) =>
  fetch(url, { headers: { ...CABECA, ...extra }, redirect: 'follow' });

/* ------------------------------------------------------------------ vídeo */

const idDoYoutube = (u: URL): string => {
  if (/youtu\.be$/i.test(u.hostname)) return u.pathname.slice(1).split('/')[0];
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return '';
  if (u.searchParams.get('v')) return u.searchParams.get('v') as string;
  const m = u.pathname.match(/\/(embed|shorts|live)\/([\w-]{6,})/);
  return m ? m[2] : '';
};

/** Título e autor pelo oEmbed: endpoint leve, público, sem chave. */
async function oembedYoutube(id: string) {
  try {
    const r = await buscar(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/**
 * A transcrição, pelas legendas que o próprio vídeo publica.
 *
 * O caminho é o da página: dentro do HTML vem `ytInitialPlayerResponse`, um
 * JSON com a lista de faixas de legenda e o endereço de cada uma. Nada de
 * chave, nada de serviço de terceiro — é o que o navegador de qualquer pessoa
 * recebe ao abrir o vídeo.
 *
 * Pode não vir: o YouTube barra endereços de datacenter com um "confirme que
 * você não é um robô", e vídeo sem legenda não tem o que extrair. Nos dois
 * casos a resposta diz o motivo em vez de devolver vazio.
 */
async function transcricaoYoutube(id: string) {
  const r = await buscar(`https://www.youtube.com/watch?v=${id}`, { Cookie: 'CONSENT=YES+cb; SOCS=CAI' });
  const html = await r.text();

  if (/Sign in to confirm|not a bot|\/sorry\//i.test(html)) return { erro: 'bloqueado', legendas: '' };

  const trecho = html.match(/"captionTracks":(\[.*?\])/);
  if (!trecho) return { erro: 'sem-legenda', legendas: '' };

  let faixas: Array<{ baseUrl: string; languageCode: string; kind?: string }> = [];
  try { faixas = JSON.parse(trecho[1].replace(/\\u0026/g, '&')); } catch { /* segue */ }
  if (!faixas.length) return { erro: 'sem-legenda', legendas: '' };

  // Português primeiro; depois qualquer uma. Legenda automática serve.
  const escolhida = faixas.find((f) => /^pt/i.test(f.languageCode)) ?? faixas[0];
  const leg = await buscar(escolhida.baseUrl);
  const xml = await leg.text();
  const falas = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1]
      .replace(/&amp;#39;/g, "'").replace(/&amp;quot;/g, '"')
      .replace(/&amp;amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return { erro: '', legendas: falas.join(' '), idioma: escolhida.languageCode };
}

/* ------------------------------------------------------------------ página */

/** Tira o miolo legível do HTML: sem script, sem estilo, sem menu. */
function textoDaPagina(html: string) {
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const desc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:)?description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? '';

  const corpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|svg|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 2)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return { titulo, desc, corpo };
}

/* ------------------------------------------------------------------- porta */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  let corpo: { url?: string; limite?: number } = {};
  try { corpo = await req.json(); } catch { /* segue */ }

  let u: URL;
  try { u = new URL(String(corpo.url ?? '')); } catch { return json({ ok: false, motivo: 'url-invalida' }, 400); }
  if (!/^https?:$/.test(u.protocol)) return json({ ok: false, motivo: 'url-invalida' }, 400);
  if (enderecoInterno(u.hostname)) return json({ ok: false, motivo: 'endereco-interno' }, 400);

  const limite = Math.min(Number(corpo.limite) || 40000, 120000);

  if (FECHADAS.test(u.hostname)) {
    return json({ ok: false, motivo: 'exige-login', host: u.hostname });
  }

  const id = idDoYoutube(u);
  try {
    if (id) {
      const [meta, trans] = await Promise.all([oembedYoutube(id), transcricaoYoutube(id)]);
      const texto = [
        meta?.title ? `Título: ${meta.title}` : '',
        meta?.author_name ? `Canal: ${meta.author_name}` : '',
        trans.legendas ? `\nTranscrição:\n${trans.legendas}` : '',
      ].filter(Boolean).join('\n').slice(0, limite);

      return json({
        ok: !!(meta?.title || trans.legendas),
        tipo: 'video',
        titulo: meta?.title ?? '',
        autor: meta?.author_name ?? '',
        temTranscricao: !!trans.legendas,
        motivoSemTranscricao: trans.erro,
        idioma: trans.idioma ?? '',
        texto,
        fonte: `https://www.youtube.com/watch?v=${id}`,
      });
    }

    const r = await buscar(u.href);
    if (!r.ok) return json({ ok: false, motivo: 'nao-abriu', status: r.status });
    const tipo = r.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain/i.test(tipo)) return json({ ok: false, motivo: 'nao-e-texto', tipo });

    const { titulo, desc, corpo: limpo } = textoDaPagina(await r.text());
    const texto = [titulo && `Título: ${titulo}`, desc && `Resumo: ${desc}`, limpo]
      .filter(Boolean).join('\n\n').slice(0, limite);

    return json({
      ok: limpo.length > 200,
      tipo: 'pagina',
      titulo,
      texto,
      caracteres: limpo.length,
      fonte: r.url || u.href,
      motivo: limpo.length > 200 ? '' : 'pouco-texto',
    });
  } catch (err) {
    return json({ ok: false, motivo: 'falhou', detalhe: String((err as Error).message ?? err) }, 200);
  }
});
