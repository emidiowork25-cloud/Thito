// Layout de árvore bilateral, compartilhado pelo Mind map e pelo Cofre.
//
// Modelo de entrada: lista plana de nós { id, text, parent, depth }.
// Saída: { id -> {x, y} }, recalculada a cada desenho.
//
// Um nó pode carregar `desloc: {x, y}` — o quanto ele foi arrastado à mão. É
// deslocamento, e não coordenada absoluta, de propósito: assim o mapa continua
// se auto-organizando quando você adiciona um tópico novo, e o que você moveu
// continua onde você deixou, em relação ao resto. Guardar coordenada absoluta
// congelaria o mapa inteiro no primeiro arrasto.
//
// E pode carregar `colapsado: true`, que esconde tudo abaixo dele.

/** Índice de filhos por pai — a base de todos os cálculos da árvore. */
export function indexar(nodes) {
  const filhosDe = {};
  for (const n of nodes ?? []) (filhosDe[n.parent ?? '__root'] ||= []).push(n);
  return filhosDe;
}

/**
 * O tamanho da caixa de um nó, em unidades do desenho.
 *
 * Mora aqui, e não no desenho, porque o layout PRECISA saber de que tamanho é
 * cada caixa antes de decidir onde ela cabe. Enquanto essa conta viveu só do
 * lado do desenho, o layout espaçava por número de folhas e por coluna fixa —
 * quer dizer, chutava. Um rótulo comprido virava uma caixa que ninguém tinha
 * orçado, e ela ia parar em cima do vizinho.
 *
 * Quem desenha tem de usar exatamente esta função. Duas fórmulas parecidas em
 * arquivos diferentes é como ter dois relógios: nunca se sabe que horas são.
 */
export const medidaDoNo = (texto, depth) => ({
  w: Math.min(240, Math.max(80, String(texto ?? '').length * 7.6 + 26)),
  h: depth === 0 ? 46 : 34,
});

/**
 * Raiz no centro, ramos alternando para a direita e para a esquerda, cada lado
 * crescendo como uma árvore vertical.
 *
 * A regra é uma só: **cada ramo reserva a altura de que precisa, medida de
 * baixo para cima**, e o vão entre irmãos cresce com quantos eles são. Assim o
 * espaçamento é consequência do conteúdo, não de um número escolhido a dedo —
 * um mapa de três tópicos fica justo, um de quarenta se abre sozinho, e nenhum
 * dos dois se atropela.
 *
 * A versão anterior fatiava a altura pelo número de FOLHAS abaixo do nó e
 * usava 250px de coluna, sempre. Nenhuma das duas contas sabia de que tamanho
 * eram as caixas. Com rótulos longos, dois níveis vizinhos chegavam a ficar a
 * 10px um do outro, e o vão vertical era 22px em qualquer mapa — tão apertado
 * que um empurrãozinho de 26px no arrasto já enterrava o nó no vizinho.
 *
 * Agora:
 *  - a coluna de cada nível fica a `folgaH` da anterior, contando a largura
 *    real das caixas mais largas dos dois níveis;
 *  - a faixa de um nó é `max(o que ele mesmo ocupa, a soma do que os filhos
 *    ocupam)`, então ramo nenhum invade a faixa do irmão;
 *  - o nó fica no meio dos próprios filhos, que é onde a vista procura por ele.
 *
 * @param {(n)=>{w,h}} [opcoes.medir] tamanho da caixa — passe o MESMO que desenha
 * @param {number} [opcoes.folgaH] vão horizontal garantido entre dois níveis
 * @param {number} [opcoes.vaoBase] vão vertical mínimo entre irmãos
 * @param {number} [opcoes.vaoPorIrmao] quanto o vão cresce a cada irmão
 * @param {number} [opcoes.vaoMax] teto do vão, para o mapa não virar um corredor
 */
export function layout(nodes, {
  medir = (n) => medidaDoNo(n.text, n.depth),
  folgaH = 64,
  vaoBase = 26,
  vaoPorIrmao = 1.2,
  vaoMax = 44,
} = {}) {
  const pos = {};
  const filhosDe = indexar(nodes);
  const raiz = (filhosDe.__root ?? [])[0];
  if (!raiz) return pos;

  const caixa = {};
  for (const n of nodes ?? []) caixa[n.id] = medir(n);
  const tam = (n) => caixa[n.id] ?? { w: 120, h: 34 };

  // O vão de um grupo de irmãos cresce com quantos eles são — com teto, senão
  // um leque de vinte tópicos viraria uma coluna de dois metros.
  const vaoEntre = (quantos) => Math.min(vaoMax, vaoBase + quantos * vaoPorIrmao);
  const vaoDe = (n) => vaoEntre((filhosDe[n.parent ?? '__root'] ?? [n]).length);

  // Altura que o ramo inteiro reserva. De baixo para cima, memoizada: é esta
  // conta que garante que nada se sobreponha, por mais fundo que a árvore vá.
  const alturas = {};
  const alturaDe = (n) => {
    if (alturas[n.id] != null) return alturas[n.id];
    const filhos = filhosDe[n.id] ?? [];
    const propria = tam(n).h + vaoDe(n);
    const soma = filhos.reduce((a, f) => a + alturaDe(f), 0);
    alturas[n.id] = Math.max(propria, soma);
    return alturas[n.id];
  };

  /* ---- as colunas: uma por nível, por lado, pela largura real das caixas ---- */

  const ramos = filhosDe[raiz.id] ?? [];
  const direita = ramos.filter((_, i) => i % 2 === 0);
  const esquerda = ramos.filter((_, i) => i % 2 === 1);

  /** Maior largura de caixa em cada nível deste lado — inclusive o nível 0. */
  const largurasPorNivel = (lista) => {
    const largs = [tam(raiz).w];
    const andar = (n, nivel) => {
      largs[nivel] = Math.max(largs[nivel] ?? 0, tam(n).w);
      for (const f of filhosDe[n.id] ?? []) andar(f, nivel + 1);
    };
    for (const r of lista) andar(r, 1);
    return largs;
  };

  /** x do centro de cada nível: meia caixa + folga + meia caixa, acumulando. */
  const colunasDe = (largs, lado) => {
    const xs = [0];
    for (let i = 1; i < largs.length; i += 1) {
      xs[i] = xs[i - 1] + lado * (largs[i - 1] / 2 + folgaH + largs[i] / 2);
    }
    return xs;
  };

  /* ---- a colocação ---- */

  const posicionar = (n, xs, nivel, topo) => {
    const filhos = filhosDe[n.id] ?? [];
    const minha = alturaDe(n);
    const x = xs[nivel] ?? xs[xs.length - 1];

    if (!filhos.length) {
      pos[n.id] = { x, y: topo + minha / 2 };
      return;
    }

    // O bloco de filhos vai centrado na faixa: sobra igual em cima e embaixo.
    const somaFilhos = filhos.reduce((a, f) => a + alturaDe(f), 0);
    let cursor = topo + (minha - somaFilhos) / 2;
    for (const f of filhos) {
      posicionar(f, xs, nivel + 1, cursor);
      cursor += alturaDe(f);
    }
    // E o pai fica no meio do primeiro e do último filho — é ali que o olho
    // procura por ele, e é o que faz as curvas saírem em leque.
    const ys = filhos.map((f) => pos[f.id].y);
    pos[n.id] = { x, y: (ys[0] + ys[ys.length - 1]) / 2 };
  };

  pos[raiz.id] = { x: 0, y: 0 };

  for (const [lista, lado] of [[direita, 1], [esquerda, -1]]) {
    if (!lista.length) continue;
    const xs = colunasDe(largurasPorNivel(lista), lado);
    const total = lista.reduce((a, r) => a + alturaDe(r), 0);
    let cursor = -total / 2;
    for (const ramo of lista) {
      posicionar(ramo, xs, 1, cursor);
      cursor += alturaDe(ramo);
    }
  }

  return pos;
}

/**
 * Os nós que devem aparecer: tudo, menos o que está abaixo de um nó colapsado.
 * O nó colapsado em si continua na tela — é ele quem carrega o botão de abrir.
 */
export function visiveis(nodes) {
  const filhosDe = indexar(nodes);
  const fora = new Set();
  const esconder = (n) => {
    for (const f of filhosDe[n.id] ?? []) { fora.add(f.id); esconder(f); }
  };
  for (const n of nodes ?? []) if (n.colapsado) esconder(n);
  return (nodes ?? []).filter((n) => !fora.has(n.id));
}

/** Quantos nós existem abaixo deste — o número que o botão de colapso mostra. */
export const contarDescendentes = (nodes, id) => ramoInteiro(nodes, id).size - 1;

/**
 * Soma os deslocamentos manuais sobre as posições calculadas.
 *
 * O deslocamento de um nó vale para ele e para tudo o que vem abaixo: arrastar
 * um tópico leva o ramo inteiro junto. É o que faz o arrasto parecer mover uma
 * ideia, e não descolar uma caixa das suas próprias filhas.
 */
export function aplicarDeslocamentos(nodes, pos) {
  const filhosDe = indexar(nodes);
  const raiz = (filhosDe.__root ?? [])[0];
  if (!raiz) return pos;

  const andar = (n, dx, dy) => {
    const ax = dx + (n.desloc?.x ?? 0);
    const ay = dy + (n.desloc?.y ?? 0);
    if (pos[n.id]) pos[n.id] = { x: pos[n.id].x + ax, y: pos[n.id].y + ay };
    for (const f of filhosDe[n.id] ?? []) andar(f, ax, ay);
  };
  andar(raiz, 0, 0);
  return pos;
}

/**
 * A rede de segurança: desfaz sobreposições que sobraram depois dos arrastos.
 *
 * O layout calculado não se atropela — isso é garantido pela conta de alturas.
 * Mas o deslocamento manual entra por cima dele, e um arrasto pode pôr um nó
 * onde já tem gente. Antes isso ficava assim para sempre: o mapa se recalculava
 * a cada tópico novo, o deslocamento antigo era somado ao lugar novo, e a
 * caixa enterrada continuava enterrada por mais que se mexesse no mapa.
 *
 * Aqui o que encosta é afastado, e só o que encosta: o nó de baixo desce o
 * mínimo para limpar o de cima, levando o próprio ramo junto — porque mover um
 * tópico sem os filhos não separa nada, só desmancha o ramo.
 *
 * O arrasto continua valendo. O que ele perde é o direito de esconder um nó
 * atrás do outro.
 */
export function separar(nodes, pos, { medir = (n) => medidaDoNo(n.text, n.depth), folga = 8, voltas = 24 } = {}) {
  const filhosDe = indexar(nodes);
  const lista = (nodes ?? []).filter((n) => pos[n.id]);
  const caixa = {};
  for (const n of lista) caixa[n.id] = medir(n);

  const mover = (n, dy) => {
    if (pos[n.id]) pos[n.id] = { ...pos[n.id], y: pos[n.id].y + dy };
    for (const f of filhosDe[n.id] ?? []) mover(f, dy);
  };

  // Quem está abaixo de quem: um pai nunca é empurrado pelo próprio filho, senão
  // o ramo se afastaria de si mesmo, para sempre.
  const souDescendente = (a, b) => {
    let atual = a;
    const porId = Object.fromEntries(lista.map((n) => [n.id, n]));
    while (atual?.parent) {
      if (atual.parent === b.id) return true;
      atual = porId[atual.parent];
    }
    return false;
  };

  for (let volta = 0; volta < voltas; volta += 1) {
    let mexeu = false;
    // De cima para baixo: assim um empurrão nunca desfaz o anterior.
    const ordem = [...lista].sort((a, b) => pos[a.id].y - pos[b.id].y);
    for (let i = 0; i < ordem.length && !mexeu; i += 1) {
      for (let j = i + 1; j < ordem.length; j += 1) {
        const a = ordem[i];
        const b = ordem[j];
        if (souDescendente(a, b) || souDescendente(b, a)) continue;
        const ca = caixa[a.id];
        const cb = caixa[b.id];
        const dx = Math.abs(pos[a.id].x - pos[b.id].x);
        const dy = Math.abs(pos[a.id].y - pos[b.id].y);
        const precisaX = (ca.w + cb.w) / 2;
        const precisaY = (ca.h + cb.h) / 2 + folga;
        if (dx >= precisaX || dy >= precisaY) continue;
        mover(b, precisaY - (pos[b.id].y - pos[a.id].y));
        mexeu = true;
        break;
      }
    }
    if (!mexeu) break;
  }

  return pos;
}

/** Todos os descendentes de um nó, incluindo ele — usado para excluir um ramo. */
export function ramoInteiro(nodes, id) {
  const remover = new Set([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const n of nodes ?? []) {
      if (n.parent && remover.has(n.parent) && !remover.has(n.id)) { remover.add(n.id); mudou = true; }
    }
  }
  return remover;
}
