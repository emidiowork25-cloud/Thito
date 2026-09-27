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

/** Largura máxima que a foto precisa ter. */
const LARGURA_MAX = 1280;
const QUALIDADE = 0.82;

/**
 * Reduz a foto antes de guardar.
 *
 * Sem isto a ponte seria pior que o armazenamento local: uma foto de celular
 * tem de três a oito megabytes, e ela subiria inteira, em base64, dentro de um
 * registro que a sincronização reenvia por completo a cada mudança. Reduzida
 * para 1280px ela cabe no bolso e continua maior que o card, que é 1080.
 */
async function reduzir(file) {
  const dataUrl = await new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.onerror = () => rej(f.error);
    f.readAsDataURL(file);
  });

  // Foto pequena ou formato que não dá para redesenhar: vai como veio.
  if (!/^data:image\/(jpeg|png|webp)/i.test(dataUrl)) return dataUrl;

  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('imagem ilegível'));
      i.src = dataUrl;
    });
    if (img.width <= LARGURA_MAX) return dataUrl;

    const escala = LARGURA_MAX / img.width;
    const tela = document.createElement('canvas');
    tela.width = Math.round(img.width * escala);
    tela.height = Math.round(img.height * escala);
    tela.getContext('2d').drawImage(img, 0, 0, tela.width, tela.height);
    const menor = tela.toDataURL('image/jpeg', QUALIDADE);
    // Se o "menor" saiu maior (acontece com PNG de pouca cor), fica o original.
    return menor.length < dataUrl.length ? menor : dataUrl;
  } catch {
    return dataUrl;
  }
}

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
