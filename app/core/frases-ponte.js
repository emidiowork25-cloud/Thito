// A ponte entre o editor Frases com Foto e o JARBAS.
//
// Este editor veio melhor preparado que o Próximo Destino: o README dele já
// descreve um contrato de nove métodos — `Store` — e diz, com todas as letras,
// que para ligar num app basta reimplementá-los. Este arquivo é essa
// reimplementação. Nenhuma outra linha do editor precisou mudar por causa dela.
//
// O que muda ligando a ponte: as frases e as fotos passam a morar nas coleções
// do JARBAS, e portanto sincronizam entre os seus aparelhos e vão no backup,
// como a agenda. Sem a ponte, o editor volta sozinho para o IndexedDB dele.
//
// O CAMINHO VIRA O ID, como no Próximo Destino: `frase/7` é o card número 7 e
// `meta/galeria` é a lista de fotos enviadas. Uma coleção, dois prefixos, e
// nenhuma tradução para manter nos dois sentidos.

import * as store from './store.js';
import { reduzir, LIMITE_REGISTRO } from './imagem.js';

const PREFIXO = 'frase/';
const GALERIA = 'meta/galeria';

/** Os campos de controle do JARBAS não pertencem ao editor. */
const limpar = (r) => {
  if (!r) return null;
  const { id, updatedAt, createdAt, deleted, ...resto } = r;
  return resto;
};

const erro = (code, msg) => Object.assign(new Error(msg), { code });

export function criarPonte() {
  /*
   * `fotoURL` é SÍNCRONO — o editor chama no meio do desenho do card.
   *
   * Por isso este mapa existe: `preloadFotos` enche, `uploadFoto` acrescenta, e
   * a leitura é imediata. Sem ele, a única resposta possível seria uma promessa,
   * e o card sairia sem foto.
   */
  const urls = new Map();

  return {
    ponte: {
      async listFrases() {
        return store.list('frases', (r) => String(r.id).startsWith(PREFIXO)).map(limpar);
      },

      async saveFrase(card) {
        if (!card || card.n == null) return;
        await store.save('frases', { ...card, id: PREFIXO + card.n });
      },

      async getGaleria() {
        const ids = store.get('frases', GALERIA)?.ids;
        return Array.isArray(ids) ? ids : [];
      },

      async saveGaleria(ids) {
        await store.save('frases', { id: GALERIA, ids: Array.isArray(ids) ? ids : [] });
      },

      async uploadFoto(file) {
        if (!/^image\//i.test(file?.type || '')) throw erro('unsupported_type', 'não é imagem');
        if (file.size > 20 * 1024 * 1024) throw erro('too_large', 'acima de 20 MB');

        const dataUrl = await reduzir(file);
        // Uma foto que continua enorme depois de reduzida (um PNG gigante de
        // pouca cor, por exemplo) não cabe num registro. Melhor recusar aqui,
        // com um aviso que o editor sabe mostrar, do que gravar algo que a
        // sincronização vai reenviar inteiro para sempre.
        if (dataUrl.length > LIMITE_REGISTRO) throw erro('quota_or_state', 'não cabe num registro');

        const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        await store.save('fraseFotos', { id, dataUrl });
        urls.set(id, dataUrl);
        return { id };
      },

      fotoURL(id) { return urls.get(id) || ''; },

      async preloadFotos(ids) {
        for (const id of ids || []) {
          if (urls.has(id)) continue;
          const dataUrl = store.get('fraseFotos', id)?.dataUrl;
          if (dataUrl) urls.set(id, dataUrl);
        }
      },

      /*
       * O download acontece AQUI, no documento do JARBAS, e não lá dentro.
       *
       * O quadro roda em sandbox. `allow-downloads` está ligado, mas um clique
       * sintético num link dentro de um iframe em sandbox é justamente o tipo de
       * coisa que navegador bloqueia sem avisar. Feito na página de fora, é um
       * download comum — e o ZIP com os trinta PNGs desce igual ao de sempre.
       */
      async download(filename, bytes) {
        const tipo = filename.endsWith('.zip') ? 'application/zip' : 'image/png';
        const blob = new Blob([bytes], { type: tipo });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        return true;
      },
    },

    // Esta ponte não escuta nada: o editor relê o que precisa quando precisa.
    // Devolver um `desligar` mesmo assim mantém a mesma forma da outra ponte,
    // então a tela do módulo trata as duas igual.
    desligar() {},
  };
}
