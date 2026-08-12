// Olhar uma foto e devolver estrutura — a peça compartilhada entre o print que
// vira mapa mental e a nota fiscal que vira compra.
//
// O caminho é o mesmo da conversa com o JARBAS: a imagem sobe junto de uma
// instrução e de UMA ferramenta com o formato esperado, e o que volta é a
// chamada dessa ferramenta, já em objeto. A chave da Anthropic não passa por
// aqui — quem fala com o modelo é a Edge Function, e é lá que ela mora.
//
// Duas coisas custam caro numa foto e por isso são tratadas antes de sair:
// tamanho (imagem grande é token à toa) e o fato de que o modelo pode
// simplesmente não conseguir ler. O segundo não é erro de programa, é resposta:
// quando ele responde em texto em vez de chamar a ferramenta, o texto é o
// diagnóstico e vai para a tela como está.

import * as sb from './supabase.js';
import * as settings from './settings.js';

/** Lado maior depois da redução. Acima disso a API reduz sozinha e cobra pelo que reduziu. */
const LADO_MAX = 1568;
const QUALIDADE = 0.85;
const TAMANHO_MAX = 5 * 1024 * 1024;   // limite da API por imagem

export const TIPOS = 'image/png,image/jpeg,image/webp,image/gif';

/**
 * Reduz a foto e devolve o bloco de imagem no formato que a API espera.
 * Um print de celular tem 3 a 4 mil pixels de lado; mandar isso inteiro é
 * pagar o dobro para o modelo ler a mesma coisa.
 */
export async function prepararImagem(file) {
  if (!file) throw new Error('Nenhuma imagem escolhida.');
  if (!file.type?.startsWith('image/')) throw new Error(`"${file.name}" não é uma imagem.`);

  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', QUALIDADE));
  if (!blob) throw new Error('Não consegui converter a imagem.');
  if (blob.size > TAMANHO_MAX) throw new Error('A imagem continua grande demais mesmo depois de reduzida.');

  return {
    bloco: {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: await paraBase64(blob) },
    },
    largura: w,
    altura: h,
    kb: Math.round(blob.size / 1024),
  };
}

/** FileReader e não btoa: a string binária de uma foto estoura o argumento de btoa. */
function paraBase64(blob) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader();
    leitor.onerror = () => falha(new Error('Falha ao ler a imagem.'));
    leitor.onload = () => ok(String(leitor.result).split(',')[1] ?? '');
    leitor.readAsDataURL(blob);
  });
}

/* ---------- PDF ---------- */

export const TIPOS_PDF = 'application/pdf,.pdf';

/** Teto por arquivo. Acima disso a requisição estoura antes de chegar ao modelo. */
const PDF_MAX = 20 * 1024 * 1024;

/**
 * PDF vai inteiro, sem conversão.
 *
 * O modelo lê PDF direto — texto e desenho da página. Extrair o texto aqui
 * daria um resultado pior: extrato de banco é tabela, e tabela sem as colunas
 * vira uma fila de números soltos onde ninguém sabe qual é data e qual é valor.
 */
export async function prepararPdf(file) {
  if (!file) throw new Error('Nenhum arquivo escolhido.');
  const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
  if (!ehPdf) throw new Error(`"${file.name}" não é um PDF.`);
  if (file.size > PDF_MAX) {
    throw new Error(`O PDF tem ${Math.round(file.size / 1024 / 1024)} MB e o limite é 20 MB. Exporte um período menor.`);
  }

  return {
    bloco: {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: await paraBase64(file) },
    },
    kb: Math.round(file.size / 1024),
  };
}

/**
 * Manda o arquivo com uma instrução e uma ferramenta, e devolve
 * `{ dados }` quando o modelo preencheu a ferramenta, ou
 * `{ texto }` quando ele respondeu com palavras — o que acontece, e deve
 * acontecer, quando a foto está tremida, o PDF é outra coisa, ou o conteúdo
 * não é o que se esperava.
 */
export async function lerArquivo(file, { instrucao, ferramenta, effort = 'high' }) {
  if (!settings.isCloudConfigured()) throw new Error('SEM_CONFIG');
  if (!sb.isSignedIn()) throw new Error('SEM_LOGIN');

  const ehPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name ?? '');
  const { bloco } = ehPdf ? await prepararPdf(file) : await prepararImagem(file);

  const resposta = await sb.invokeJarbas({
    messages: [{ role: 'user', content: [bloco, { type: 'text', text: instrucao }] }],
    // Sem contexto do hub: esta chamada olha uma foto, não conversa sobre a vida
    // de ninguém. Mandar agenda e finanças aqui seria pagar tokens por nada.
    context: '',
    tools: [ferramenta],
    effort,
    userName: settings.get('name') || '',
  });

  const blocos = Array.isArray(resposta?.content) ? resposta.content : [];
  const chamada = blocos.find((b) => b.type === 'tool_use' && b.name === ferramenta.name);
  if (chamada) return { dados: chamada.input ?? {} };

  const texto = blocos.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { texto: texto || 'O modelo não devolveu nada sobre esse arquivo.' };
}

/** Nome antigo, mantido porque o mapa mental e a nota fiscal já o usam. */
export const lerImagem = lerArquivo;

/** Traduz as falhas de configuração para o que a pessoa precisa fazer. */
export function explicarFalha(err) {
  const msg = String(err?.message || err);
  if (msg === 'SEM_CONFIG') return 'Configure a nuvem em Ajustes antes — a leitura de imagem passa por ela.';
  if (msg === 'SEM_LOGIN') return 'Entre na sua conta em Ajustes › Nuvem para eu poder olhar a foto.';
  if (/ANTHROPIC_API_KEY/i.test(msg)) return 'Falta o segredo ANTHROPIC_API_KEY no seu projeto Supabase — sem ele eu não enxergo.';
  if (/401|403/.test(msg)) return 'A chave da Anthropic foi recusada. Confira o segredo ANTHROPIC_API_KEY.';
  if (/429|rate.?limit/i.test(msg)) return 'A API está limitando as requisições. Espere alguns segundos.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com a nuvem agora.';
  return msg;
}
