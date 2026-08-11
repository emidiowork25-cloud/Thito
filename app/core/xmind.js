// Leitura de arquivos .xmind, aqui mesmo no navegador.
//
// Existe porque exportar para Markdown ou OPML é recurso pago do XMind, mas o
// arquivo do mapa é seu e você já o tem. Um .xmind é um ZIP com um
// `content.json` dentro — e ZIP e JSON o navegador lê sozinho.
//
// Nada é enviado a lugar nenhum: o arquivo é aberto na memória da aba e o
// resultado vai direto para a criptografia do cofre.

/* ============================ ZIP ============================ */
//
// Um leitor de ZIP em 60 linhas, sem biblioteca. Lê pelo diretório central e
// não pelos cabeçalhos locais: em arquivos gravados em fluxo, o cabeçalho
// local traz tamanho zero e só o diretório central tem o valor verdadeiro.

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;

function acharFimDoDiretorio(dv) {
  // O comentário final do ZIP tem no máximo 65535 bytes, então o registro de
  // fim está sempre dentro dos últimos ~64 KB.
  const minimo = Math.max(0, dv.byteLength - 65557);
  for (let i = dv.byteLength - 22; i >= minimo; i -= 1) {
    if (dv.getUint32(i, true) === ASSINATURA_FIM) return i;
  }
  return -1;
}

async function inflar(bytes, metodo) {
  if (metodo === 0) return bytes;                        // guardado, sem compressão
  if (metodo !== 8) throw new Error(`compressão ${metodo} não suportada`);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('este navegador não descomprime ZIP (DecompressionStream ausente)');
  }
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Devolve { nome -> Uint8Array } com o conteúdo já descomprimido. */
export async function lerZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(buffer);

  const fim = acharFimDoDiretorio(dv);
  if (fim < 0) throw new Error('não parece um arquivo ZIP válido');

  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);

  const saida = {};
  for (let n = 0; n < total; n += 1) {
    if (dv.getUint32(p, true) !== ASSINATURA_CENTRAL) break;

    const metodo = dv.getUint16(p + 10, true);
    const tamComprimido = dv.getUint32(p + 20, true);
    const tamNome = dv.getUint16(p + 28, true);
    const tamExtra = dv.getUint16(p + 30, true);
    const tamComentario = dv.getUint16(p + 32, true);
    const inicioLocal = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + tamNome));

    // O cabeçalho local repete nome e extra, com tamanhos que podem diferir
    // dos do diretório central — por isso são relidos aqui.
    const nomeLocal = dv.getUint16(inicioLocal + 26, true);
    const extraLocal = dv.getUint16(inicioLocal + 28, true);
    const dados = inicioLocal + 30 + nomeLocal + extraLocal;

    saida[nome] = await inflar(bytes.subarray(dados, dados + tamComprimido), metodo);
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return saida;
}

/* ============================ XMind ============================ */

const texto = (v) => (typeof v === 'string' ? v.trim() : '');

/** A nota de um tópico, que no XMind fica em notes.plain.content. */
const notaDe = (t) => texto(t?.notes?.plain?.content);

/**
 * Converte um tópico do XMind na mesma forma que o leitor de tópicos usa:
 * { text, filhos }. Rótulos e nota entram como filhos de texto, para o
 * extrator de credenciais reconhecer "senha: …" de onde quer que venha.
 */
function converter(topico) {
  const no = { text: texto(topico?.title) || 'sem nome', filhos: [] };

  const nota = notaDe(topico);
  // Uma nota multilinha vira várias linhas soltas: é comum guardar
  // "usuário: x / senha: y" na nota em vez de em subtópicos.
  for (const linha of nota.split('\n').map((l) => l.trim()).filter(Boolean)) {
    no.filhos.push({ text: linha, filhos: [] });
  }

  // Marcadores de texto (labels) também carregam informação em mapas reais.
  for (const rotulo of topico?.labels ?? []) {
    if (texto(rotulo)) no.filhos.push({ text: texto(rotulo), filhos: [] });
  }

  for (const filho of topico?.children?.attached ?? []) no.filhos.push(converter(filho));
  for (const filho of topico?.children?.detached ?? []) no.filhos.push(converter(filho));
  return no;
}

/**
 * Lê um .xmind e devolve as raízes no formato de árvore crua.
 * Cada folha do arquivo (sheet) vira uma raiz.
 */
export async function lerXmind(buffer) {
  const arquivos = await lerZip(buffer);

  const alvo = arquivos['content.json'] ?? arquivos['content.json/content.json'];
  if (!alvo) {
    const nomes = Object.keys(arquivos).join(', ');
    throw new Error(`não achei content.json dentro do arquivo (contém: ${nomes.slice(0, 120)})`);
  }

  let dados;
  try {
    dados = JSON.parse(new TextDecoder().decode(alvo));
  } catch {
    throw new Error('o content.json do arquivo está ilegível');
  }

  const folhas = Array.isArray(dados) ? dados : [dados];
  return folhas
    .map((folha) => folha?.rootTopic)
    .filter(Boolean)
    .map(converter);
}
