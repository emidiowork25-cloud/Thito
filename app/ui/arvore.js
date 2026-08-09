// Layout de árvore bilateral, compartilhado pelo Mind map e pelo Cofre.
//
// Modelo de entrada: lista plana de nós { id, text, parent, depth }.
// Saída: { id -> {x, y} }. Nada de coordenadas guardadas em disco — o desenho
// é recalculado a cada render, então dois aparelhos nunca discordam de onde
// uma caixa deveria estar.

/** Índice de filhos por pai — a base de todos os cálculos da árvore. */
export function indexar(nodes) {
  const filhosDe = {};
  for (const n of nodes ?? []) (filhosDe[n.parent ?? '__root'] ||= []).push(n);
  return filhosDe;
}

/**
 * Raiz no centro, ramos alternando para a direita e para a esquerda, cada lado
 * crescendo como uma árvore vertical. Cada nó ocupa uma faixa proporcional ao
 * número de folhas abaixo dele, então nada se sobrepõe por mais fundo que vá.
 */
export function layout(nodes, { coluna = 250, linha = 56 } = {}) {
  const pos = {};
  const filhosDe = indexar(nodes);
  const raiz = (filhosDe.__root ?? [])[0];
  if (!raiz) return pos;

  const folhas = (n) => {
    const filhos = filhosDe[n.id] ?? [];
    return filhos.length ? filhos.reduce((a, f) => a + folhas(f), 0) : 1;
  };

  pos[raiz.id] = { x: 0, y: 0 };

  const posicionar = (node, lado, nivel, topo, altura) => {
    pos[node.id] = { x: lado * coluna * nivel, y: topo + altura / 2 };
    const filhos = filhosDe[node.id] ?? [];
    if (!filhos.length) return;
    const total = filhos.reduce((a, f) => a + folhas(f), 0) || 1;
    let cursor = topo;
    for (const f of filhos) {
      const fatia = (folhas(f) / total) * altura;
      posicionar(f, lado, nivel + 1, cursor, fatia);
      cursor += fatia;
    }
  };

  const ramos = filhosDe[raiz.id] ?? [];
  const direita = ramos.filter((_, i) => i % 2 === 0);
  const esquerda = ramos.filter((_, i) => i % 2 === 1);

  for (const [lista, lado] of [[direita, 1], [esquerda, -1]]) {
    const total = lista.reduce((a, r) => a + folhas(r), 0);
    let cursor = -(total * linha) / 2;
    for (const ramo of lista) {
      const altura = folhas(ramo) * linha;
      posicionar(ramo, lado, 1, cursor, altura);
      cursor += altura;
    }
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
