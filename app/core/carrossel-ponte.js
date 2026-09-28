// A ponte entre o editor de carrosséis e o JARBAS.
//
// Este módulo veio diferente dos dois anteriores: não é uma página que roda
// sozinha dentro de um quadro, é uma BIBLIOTECA — ES modules, sem build e sem
// dependência nenhuma, exatamente a arquitetura que o JARBAS já usa. Então ele
// não entra num iframe: monta direto na tela, como qualquer outro módulo.
//
// O README dele descreve cinco métodos de armazenamento, e diz que trocar o
// adaptador não muda mais nada. Este arquivo é esse adaptador. O pacote traz um
// `adaptadores.js` com versões para REST e para localStorage; nenhuma das duas
// serve aqui, porque o JARBAS não tem API REST nem guarda dado em localStorage
// — ele tem coleções que sincronizam e entram no backup. Por isso aquele
// arquivo não foi copiado: seria código que ninguém importa.
//
// O CAMINHO VIRA O ID, como nos outros dois: `carrossel/7` é o carrossel de
// número 7. Uma coleção, um prefixo, nenhuma tradução para manter nos dois
// sentidos.

import * as store from './store.js';
import { reduzir, LIMITE_REGISTRO } from './imagem.js';

const PREFIXO = 'carrossel/';

/** Os campos de controle do JARBAS não pertencem ao editor. */
const limpar = (r) => {
  if (!r) return null;
  const { id, updatedAt, createdAt, deleted, ...resto } = r;
  return resto;
};

export function criarPonte() {
  /*
   * `urlFoto` é SÍNCRONO — o editor chama no meio de montar o HTML do slide,
   * e a exportação em PNG chama de novo. Daí este mapa: `listarFotos` enche no
   * boot e `enviarFoto` acrescenta. Uma promessa aqui faria o card sair sem
   * foto, sem erro nenhum aparecendo.
   *
   * Guardar data URL também resolve, de graça, o problema que o README chama
   * de "atenção ao CORS das fotos": uma data URL não tem origem, então o
   * canvas nunca é contaminado e o PNG sai COM a imagem.
   */
  const urls = new Map();

  return {
    ponte: {
      async carregar() {
        return store.list('carrosseis', (r) => String(r.id).startsWith(PREFIXO))
          .map(limpar)
          .sort((a, b) => a.n - b.n);
      },

      async salvar(carrossel) {
        if (!carrossel || carrossel.n == null) return;
        await store.save('carrosseis', { ...carrossel, id: PREFIXO + carrossel.n });
      },

      async listarFotos() {
        const fotos = store.list('carrosselFotos');
        for (const f of fotos) if (f.dataUrl) urls.set(f.id, f.dataUrl);
        // Mais nova primeiro: é a que ele acabou de mandar e vai querer usar.
        return fotos
          .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
          .map((f) => ({ id: f.id, url: f.dataUrl }));
      },

      async enviarFoto(arquivo) {
        if (!/^image\//i.test(arquivo?.type || '')) throw new Error('Isso não é uma imagem.');
        if (arquivo.size > 20 * 1024 * 1024) throw new Error('A foto passa de 20 MB.');

        const dataUrl = await reduzir(arquivo);
        // Uma foto que continua enorme depois de reduzida não cabe num
        // registro. Recusar aqui é melhor do que gravar algo que a
        // sincronização vai reenviar inteiro para sempre.
        if (dataUrl.length > LIMITE_REGISTRO) throw new Error('A foto é pesada demais, mesmo reduzida.');

        const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        await store.save('carrosselFotos', { id, dataUrl });
        urls.set(id, dataUrl);
        return { id, url: dataUrl };
      },

      urlFoto(id) { return urls.get(id) || ''; },
    },
  };
}
