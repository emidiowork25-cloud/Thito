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
