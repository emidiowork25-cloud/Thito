// Leitura de tópicos exportados de fora — XMind, Obsidian, Notion, ou qualquer
// lista indentada escrita à mão.
//
// Existe por um motivo específico: para o cofre receber um mapa de acessos que
// já existe em outro lugar sem que ninguém precise digitar tudo de novo, e sem
// que essas senhas passem por mim. Você cola, o seu navegador interpreta e
// cifra com a sua senha-mestra. O texto nunca sai da máquina.

/**
 * Reconhece linhas de credencial pelo rótulo. A chave do lado esquerdo vira
 * campo do nó pai e a linha some da árvore: "senha: abc" pendurado embaixo de
 * "Nubank" é um atributo do Nubank, não um filho dele.
 */
const CAMPOS = [
  { campo: 'login', teste: /^(?:usu[áa]rio|user(?:name)?|login|e-?mail|conta)$/i },
  { campo: 'senha', teste: /^(?:senha|password|pass|pwd|chave)$/i },
  { campo: 'url', teste: /^(?:url|link|site|endere[çc]o|p[áa]gina)$/i },
  { campo: 'recuperacao', teste: /^(?:2fa|mfa|recupera[çc][ãa]o|backup|c[óo]digos?(?: de recupera[çc][ãa]o)?|token)$/i },
  { campo: 'note', teste: /^(?:obs|observa[çc][ãa]o|nota|notas|coment[áa]rio)$/i },
];

/** Um item cru da árvore, antes de virar nó do cofre. */
const item = (text) => ({ text, filhos: [] });

/* ---------- OPML (XMind, Workflowy, MindNode) ---------- */

function deOpml(texto) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.querySelector('parsererror')) return null;

  const converte = (el) => {
    const no = item((el.getAttribute('text') ?? el.getAttribute('title') ?? '').trim());
    for (const filho of el.children) {
      if (filho.tagName.toLowerCase() === 'outline') no.filhos.push(converte(filho));
    }
    return no;
  };

  const corpo = doc.querySelector('body');
  if (!corpo) return null;
  return [...corpo.children]
    .filter((e) => e.tagName.toLowerCase() === 'outline')
    .map(converte);
}

/* ---------- texto indentado / markdown ---------- */

/**
 * Nível de uma linha. Títulos de markdown (`##`) mandam sobre a indentação:
 * é assim que o XMind exporta os primeiros níveis, com lista só nas folhas.
 */
function nivelDe(linha, nivelDoTitulo) {
  const titulo = linha.match(/^(#{1,6})\s+/);
  if (titulo) return { nivel: titulo[1].length - 1, titulo: true, texto: linha.slice(titulo[0].length) };

  const recuo = linha.match(/^[ \t]*/)[0];
  const texto = linha.replace(/^[ \t]*(?:[-*+•]|\d+[.)])?\s*/, '');

  // Tabulação conta um nível por tabulação — é o que sai ao copiar de um
  // programa de tópicos direto para a área de transferência. Só quando não há
  // tabulação vale a régua do markdown, de dois espaços por nível.
  const tabs = (recuo.match(/\t/g) ?? []).length;
  const degrau = tabs || Math.floor(recuo.length / 2);
  return { nivel: nivelDoTitulo + 1 + degrau, titulo: false, texto };
}

function deTexto(texto) {
  const raizes = [];
  const pilha = [];   // [{ nivel, no }]
  let nivelDoTitulo = -1;

  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue;
    const { nivel, titulo, texto: rotulo } = nivelDe(linha, nivelDoTitulo);
    if (!rotulo.trim()) continue;
    if (titulo) nivelDoTitulo = nivel;

    const no = item(rotulo.trim());
    while (pilha.length && pilha[pilha.length - 1].nivel >= nivel) pilha.pop();

    if (pilha.length) pilha[pilha.length - 1].no.filhos.push(no);
    else raizes.push(no);
    pilha.push({ nivel, no });
  }
  return raizes;
}

/* ---------- extração de credenciais ---------- */

/**
 * Puxa "senha: abc" para dentro do pai. Também aceita a linha inteira solta
 * como valor quando o pai já se chama "senha" — mapa mental de verdade é
 * escrito dos dois jeitos.
 */
function extrair(no) {
  const filhos = [];
  for (const filho of no.filhos) {
    extrair(filho);

    const par = filho.text.match(/^([^:=]{1,24})\s*[:=]\s*(.+)$/s);
    if (par && !filho.filhos.length) {
      const achado = CAMPOS.find((c) => c.teste.test(par[1].trim()));
      if (achado) { no[achado.campo] = par[2].trim(); continue; }
    }

    const rotuloSozinho = CAMPOS.find((c) => c.teste.test(filho.text.trim()));
    if (rotuloSozinho && filho.filhos.length === 1 && !filho.filhos[0].filhos.length) {
      no[rotuloSozinho.campo] = filho.filhos[0].text.trim();
      continue;
    }

    filhos.push(filho);
  }
  no.filhos = filhos;
}

/* ---------- saída ---------- */

/**
 * Converte o texto colado em nós do cofre.
 * `novoId` é injetado para o módulo do cofre usar o mesmo gerador de id do resto
 * do sistema — este arquivo não precisa conhecer nada além da árvore.
 */
export function lerTopicos(texto, novoId) {
  const bruto = String(texto ?? '').trim();
  if (!bruto) return { nodes: [], comAcesso: 0 };

  let raizes = bruto.startsWith('<') ? deOpml(bruto) : null;
  if (!raizes?.length) raizes = deTexto(bruto);
  return deArvore(raizes, novoId);
}

/**
 * Mesma saída, partindo de uma árvore já montada — é por aqui que entra o
 * leitor de .xmind, que produz { text, filhos } sem passar por texto.
 */
export function deArvore(raizesCruas, novoId) {
  const raizes = raizesCruas ?? [];
  if (!raizes.length) return { nodes: [], comAcesso: 0 };
  for (const r of raizes) extrair(r);

  // Uma raiz só vira o centro do mapa. Várias ganham um centro chamado
  // "Acessos", porque a árvore do cofre é desenhada a partir de um nó único.
  const topo = raizes.length === 1 ? raizes[0] : { ...item('Acessos'), filhos: raizes };

  const nodes = [];
  let comAcesso = 0;

  const achatar = (no, parent, depth) => {
    const id = novoId();
    const registro = { id, text: no.text || 'sem nome', parent, depth };
    for (const { campo } of CAMPOS) if (no[campo]) registro[campo] = no[campo];
    if (registro.login || registro.senha) comAcesso += 1;
    nodes.push(registro);
    for (const filho of no.filhos) achatar(filho, id, depth + 1);
  };

  achatar(topo, null, 0);
  return { nodes, comAcesso, nome: topo.text || 'Acessos' };
}
