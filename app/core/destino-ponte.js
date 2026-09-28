// A ponte entre o editor Próximo Destino e o JARBAS.
//
// O editor veio pronto, com um lugar exato para ser ligado: ele procura
// `window.parent.PD_ADAPTER` e, se achar, usa em vez do armazenamento próprio.
// Este arquivo é esse adaptador. Nada do editor foi alterado para isto — o que
// prova que ele continua sendo a mesma página que roda sozinha.
//
// O que muda ligando a ponte: as viagens passam a morar nas coleções do JARBAS,
// e portanto sincronizam entre os seus aparelhos e vão no backup, como a agenda.
//
// O CAMINHO VIRA O ID. O editor fala por caminhos ("viagens/abc",
// "meta/galeria") e o JARBAS guarda por id. Em vez de inventar uma tradução nos
// dois sentidos, o caminho É o id. É exatamente o que o editor já fazia no
// IndexedDB dele, então a forma dos dados não mudou de dono.

import * as store from './store.js';
import { on } from './bus.js';
import { reduzir } from './imagem.js';

/**
 * Monta o adaptador. Quem chama é a tela do módulo, antes de criar o quadro —
 * o editor lê `PD_ADAPTER` uma vez, na hora em que o script dele roda.
 */
export function criarPonte() {
  const ouvintes = new Map();   // caminho -> Set(fn)

  // Uma escuta só para todo o módulo. O editor pede onSnapshot por documento;
  // avisar todo mundo a cada mudança da coleção é mais simples e igualmente
  // correto, porque quem recebe relê o próprio documento.
  const parar = on('data:changed', ({ collection }) => {
    if (collection !== 'viagens') return;
    for (const [caminho, fns] of ouvintes) {
      const doc = store.get('viagens', caminho);
      for (const fn of fns) { try { fn(limpar(doc)); } catch { /* o editor que se vire */ } }
    }
  });

  // Os campos de controle do JARBAS não pertencem ao editor: devolvê-los faria
  // ele gravar de volta um `updatedAt` nosso como se fosse dado dele.
  const limpar = (r) => {
    if (!r) return null;
    const { id, updatedAt, createdAt, deleted, ...resto } = r;
    return resto;
  };

  return {
    ponte: {
      db: {
        doc(caminho) {
          return {
            async get() { return limpar(store.get('viagens', caminho)); },
            async set(obj) { await store.save('viagens', { ...obj, id: caminho }); },
            async delete() { await store.remove('viagens', caminho); },
            onSnapshot(fn) {
              if (!ouvintes.has(caminho)) ouvintes.set(caminho, new Set());
              ouvintes.get(caminho).add(fn);
              // Primeira leitura imediata: é o que o editor espera para pintar
              // a tela sem piscar vazio antes do primeiro evento.
              Promise.resolve().then(() => fn(limpar(store.get('viagens', caminho))));
              return () => ouvintes.get(caminho)?.delete(fn);
            },
          };
        },
        collection(nome) {
          return {
            async get() {
              return store.list('viagens', (r) => String(r.id).startsWith(`${nome}/`)).map(limpar);
            },
          };
        },
      },
      assets: {
        async upload(file) {
          const dataUrl = await reduzir(file);
          const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          await store.save('viagemFotos', { id, dataUrl });
          return { id };
        },
        async url(id) { return store.get('viagemFotos', id)?.dataUrl ?? ''; },
      },
      // `downloads` fica de fora de propósito: o download nativo do navegador já
      // faz o certo, e passar o PNG por aqui só acrescentaria um jeito de falhar.
    },
    desligar: parar,
  };
}
