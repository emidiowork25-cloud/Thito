// Reduzir uma foto antes de ela virar registro.
//
// Mora aqui porque dois módulos precisam da mesma coisa pelo mesmo motivo — o
// Próximo Destino e o Frases com Foto — e uma segunda cópia seria uma segunda
// chance de as duas discordarem sobre o que é "grande demais".
//
// Sem isto a nuvem seria pior que o armazenamento local: uma foto de celular
// tem de três a oito megabytes, e ela subiria inteira, em base64, dentro de um
// registro que a sincronização reenvia POR COMPLETO a cada mudança.

/** Largura máxima que a foto precisa ter: maior que o card, que é 1080. */
export const LARGURA_MAX = 1280;
const QUALIDADE = 0.82;

/** O maior tamanho que um registro aguenta sem virar problema de sincronização. */
export const LIMITE_REGISTRO = 900 * 1024;

/**
 * Devolve a foto como data URL, reduzida se fizer sentido.
 *
 * Nunca piora: se o redesenho sair maior que o original (acontece com PNG de
 * pouca cor), fica o original; se o formato não der para redesenhar, vai como
 * veio. Reduzir é um esforço, não uma promessa.
 */
export async function reduzir(file) {
  const dataUrl = await new Promise((res, rej) => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.onerror = () => rej(f.error);
    f.readAsDataURL(file);
  });

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
    return menor.length < dataUrl.length ? menor : dataUrl;
  } catch {
    return dataUrl;
  }
}
