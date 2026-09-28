/*
 * arte.js  ·  Núcleo de arte dos carrosséis @kadu.lins
 *
 * Não depende de framework nem do editor. Serve para:
 *   - desenhar um slide em HTML (prévia ao vivo)
 *   - exportar o mesmo slide em PNG 1080x1350
 *   - empacotar um carrossel ou vários num ZIP
 *
 * O PNG é gerado pelo próprio navegador: o slide é montado em tamanho real
 * fora da tela, embrulhado num SVG com as fontes e as imagens embutidas, e
 * desenhado num canvas. Quem quebra as linhas é o motor de layout do
 * navegador, então o arquivo sai idêntico ao que aparece na prévia.
 */

export const NAVY = "#0D1B3E";
export const AZUL = "#3B4EE0";
export const TINTA = "#FFFFFF";
export const SECUNDARIA = "rgba(255,255,255,.78)";
export const LARGURA = 1080;
export const ALTURA = 1350;
export const PADDING = 64;

/* ---------------------------------------------------------------- texto --- */

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Só <b> é permitido no texto dos slides. O resto é escapado. */
const rico = s => esc(s).replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
const semTags = s => String(s == null ? "" : s).replace(/<\/?b>/g, "");
const tamanho = s => semTags(s).length;
const temTexto = v => typeof v === "string" && v.trim() !== "";

/* ------------------------------------------------------------- modelo ---- */

/** Preenche os campos de foto que podem faltar num slide vindo do banco. */
export function normalizarSlide(s) {
  if (!s || typeof s !== "object") return s;
  if (s.opac == null) s.opac = 20;
  if (!s.escala) s.escala = 100;
  if (s.posX == null) s.posX = 50;
  if (s.posY == null) s.posY = 50;
  if (s.foto === undefined) s.foto = null;
  return s;
}

export function normalizarCarrossel(c) {
  if (!c || !Array.isArray(c.slides)) return c;
  c.slides.forEach(normalizarSlide);
  if (c.postado == null) c.postado = false;
  if (c.postadoEm === undefined) c.postadoEm = null;
  return c;
}

/** A foto entra como camada sutil sobre o azul: no máximo 20%. */
const opacidadeFoto = v => Math.max(0, Math.min(20, +v || 0)) / 100;

/* ------------------------------------------------------------- blocos ---- */

const cabecalho = base => `<div style="display:flex;align-items:center;gap:22px;">
 <div style="width:104px;height:104px;border-radius:50%;padding:4px;background:linear-gradient(135deg,#f9a03c 0%,#ee3968 45%,#b2519f 100%);box-sizing:border-box;flex:none;">
  <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:#fff;padding:3px;box-sizing:border-box;">
   <img data-k="av" src="${base}avatar.png" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;"></div></div>
 <div style="display:flex;flex-direction:column;gap:2px;">
  <div style="display:flex;align-items:flex-start;gap:6px;">
   <span style="font-size:40px;font-weight:700;color:#fff;letter-spacing:-0.02em;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.35);">Kadu Lins</span>
   <span style="width:22px;height:22px;border-radius:50%;background:#1d9bf0;display:inline-flex;align-items:center;justify-content:center;margin-top:4px;flex:none;">
    <span style="width:9px;height:5px;border-left:2.5px solid #fff;border-bottom:2.5px solid #fff;transform:rotate(-45deg) translate(1px,-1px);"></span></span></div>
  <span style="font-size:28px;font-weight:400;color:rgba(255,255,255,.8);line-height:1.2;">@kadu.lins</span></div></div>`;

const rodape = (base, n, total) => `<div style="display:flex;align-items:flex-end;justify-content:space-between;">
 <img data-k="mc" src="${base}marca-branca.svg" alt="Kadu Lins" style="height:56px;width:173px;display:block;opacity:.95;">
 <span style="font-size:40px;font-weight:400;color:rgba(255,255,255,.45);line-height:1;">${n}/${total}</span></div>`;

const titulo = (t, em, mw) =>
  `<h1 style="margin:0;font-size:${em}em;font-weight:800;line-height:1.04;letter-spacing:-0.035em;color:${TINTA};text-wrap:balance;max-width:${mw}ch;text-shadow:0 2px 18px rgba(0,0,0,.35);">${rico(t)}</h1>`;

const paragrafo = (t, em = 2.375, mw = 31) =>
  `<p style="margin:0;font-size:${em}em;font-weight:400;line-height:1.35;color:${SECUNDARIA};text-wrap:pretty;max-width:${mw}ch;">${rico(t)}</p>`;

const rotulo = t =>
  `<p style="margin:0;font-size:2.375em;font-weight:500;line-height:1.3;color:${SECUNDARIA};text-wrap:balance;max-width:26ch;">${rico(t)}</p>`;

const listaItens = linhas =>
  `<div style="display:flex;flex-direction:column;align-items:center;gap:2.625em;">` +
  linhas.map(([a, b]) => `<div style="display:flex;flex-direction:column;gap:6px;max-width:43.75em;">
   <span style="font-size:2.75em;font-weight:700;line-height:1.15;letter-spacing:-0.02em;color:${TINTA};">${rico(a)}</span>
   <span style="font-size:2.125em;font-weight:400;line-height:1.32;color:${SECUNDARIA};text-wrap:balance;">${rico(b)}</span></div>`).join("") +
  `</div>`;

const caixaAzul = (t, em = 2.875, mw = 48.75) =>
  `<p style="margin:0;background:${AZUL};color:#fff;font-size:${em}em;font-weight:700;line-height:1.22;letter-spacing:-0.02em;text-wrap:balance;max-width:${mw}em;padding:1.375em 2.125em;border-radius:14px;box-sizing:border-box;">${rico(t)}</p>`;

const fechoNu = (t, em = 2.875, mw = 22) =>
  `<p style="margin:0;color:#fff;font-size:${em}em;font-weight:700;line-height:1.2;letter-spacing:-0.025em;text-wrap:balance;max-width:${mw}ch;text-shadow:0 2px 14px rgba(0,0,0,.3);">${rico(t)}</p>`;

/** "caixa" (padrão) | "texto" (sem a caixa) | "oculto" (fora da arte) */
export const modoFecho = s => s.punchModo || "caixa";

const fecho = s => {
  if (!temTexto(s.punch)) return [];
  const m = modoFecho(s);
  if (m === "oculto") return [];
  if (m === "texto") return [fechoNu(s.punch)];
  return [caixaAzul(s.punch)];
};

/** Tipos de slide: cover | def | list | cta */
function corpo(s) {
  if (s.t === "cover") {
    const L = tamanho(s.h);
    return [titulo(s.h, L <= 8 ? 9 : (L <= 32 ? 6.25 : 5.25), L <= 8 ? 10 : 18),
            paragrafo(s.p, 2.625, 32)];
  }
  if (s.t === "def") {
    const L = tamanho(s.h);
    return [titulo(s.h, L <= 8 ? 7.5 : 4.0, L <= 8 ? 10 : 17),
            ...(s.ps || []).map(p => paragrafo(p)),
            ...fecho(s)];
  }
  if (s.t === "list") {
    return [...(temTexto(s.label) ? [rotulo(s.label)] : []),
            listaItens(s.items || []),
            ...(temTexto(s.foot) ? [paragrafo(s.foot, 2.125, 40)] : []),
            ...fecho(s)];
  }
  return [...(temTexto(s.label) ? [rotulo(s.label)] : []),
          titulo(s.h, 4.5, 14),
          ...fecho(s)];
}

/* --------------------------------------------------------------- slide --- */

/**
 * HTML de um slide em tamanho real (1080x1350).
 * @param {object} slide
 * @param {number} numero  posição do slide, começando em 1
 * @param {number} total   quantos slides o carrossel tem
 * @param {object} opcoes  { baseAssets, urlFoto, fotoEmbutida }
 *   - baseAssets: pasta com avatar.png, marca-branca.svg e as fontes
 *   - urlFoto(id): transforma o id guardado no banco numa URL exibível
 *   - fotoEmbutida: data URL já resolvida (usado na exportação)
 */
export function slideHTML(slide, numero, total, opcoes = {}) {
  const s = normalizarSlide(slide);
  const base = opcoes.baseAssets || "/assets/carrossel/";
  const urlFoto = opcoes.urlFoto || (id => id);
  const src = opcoes.fotoEmbutida || (s.foto ? urlFoto(s.foto) : null);

  const camadaFoto = src
    ? `<img data-k="foto" src="${src}" alt="" style="position:absolute;top:0;left:0;width:${LARGURA}px;height:${ALTURA}px;object-fit:cover;object-position:${s.posX}% ${s.posY}%;transform:scale(${(s.escala || 100) / 100});transform-origin:${s.posX}% ${s.posY}%;display:block;opacity:${opacidadeFoto(s.opac)};">`
    : "";

  return `<div class="kl-slide" style="position:relative;overflow:hidden;width:${LARGURA}px;height:${ALTURA}px;background:${NAVY};font-family:Poppins,Helvetica,sans-serif;color:#fff;">
   ${camadaFoto}
   <div class="kl-conteudo" style="position:absolute;top:0;left:0;width:${LARGURA}px;height:${ALTURA}px;box-sizing:border-box;padding:${PADDING}px;display:grid;grid-template-rows:auto 1fr auto;">
    ${cabecalho(base)}<div class="kl-mid" style="font-size:16px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:1.75em;">${corpo(s).join("")}</div>${rodape(base, numero, total)}
   </div></div>`;
}

/**
 * Mede se o conteúdo passou do espaço útil do slide.
 * @param {HTMLElement} el elemento .kl-slide já no documento
 * @param {number} escala fator de redução aplicado por transform, se houver
 */
export function medirEstouro(el, escala = 1) {
  const box = el.querySelector(".kl-conteudo");
  const mid = el.querySelector(".kl-mid");
  if (!box || !mid) return { estourou: false, excesso: 0 };
  const alturaDe = n => n.getBoundingClientRect().height / escala;
  const disponivel = ALTURA - PADDING * 2 - alturaDe(box.children[0]) - alturaDe(box.children[2]);
  const gap = parseFloat(getComputedStyle(mid).rowGap) || 0;
  const filhos = [...mid.children];
  const usado = filhos.reduce((a, x) => a + alturaDe(x), 0) + gap * (filhos.length - 1);
  return { estourou: usado > disponivel - 1, excesso: Math.round(usado - disponivel) };
}

/* ----------------------------------------------------------- exportação -- */

const cacheAssets = new Map();
const cacheFotos = new Map();

async function paraDataURL(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("não consegui carregar " + url);
  const b = await r.blob();
  return await new Promise(res => {
    const f = new FileReader();
    f.onload = () => res(f.result);
    f.readAsDataURL(b);
  });
}

async function assetsEmbutidos(base) {
  if (cacheAssets.has(base)) return cacheAssets.get(base);
  const [av, mc, f4, f5, f7] = await Promise.all([
    paraDataURL(base + "avatar.png"),
    paraDataURL(base + "marca-branca.svg"),
    paraDataURL(base + "poppins-400.ttf"),
    paraDataURL(base + "poppins-500.ttf"),
    paraDataURL(base + "poppins-700.ttf"),
  ]);
  const pacote = {
    av, mc,
    css:
      `@font-face{font-family:Poppins;src:url(${f4}) format("truetype");font-weight:400}` +
      `@font-face{font-family:Poppins;src:url(${f5}) format("truetype");font-weight:500}` +
      `@font-face{font-family:Poppins;src:url(${f7}) format("truetype");font-weight:700}`,
  };
  cacheAssets.set(base, pacote);
  return pacote;
}

/** Um blob: URL contamina o canvas no Chrome. Data URL não. */
function svgParaDataURL(svg) {
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  const PEDACO = 0x8000;
  for (let i = 0; i < bytes.length; i += PEDACO) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO));
  }
  return "data:image/svg+xml;base64," + btoa(bin);
}

let palco = null;
function palcoOculto() {
  if (palco && palco.isConnected) return palco;
  palco = document.createElement("div");
  palco.setAttribute("aria-hidden", "true");
  palco.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${LARGURA}px;height:${ALTURA}px;pointer-events:none`;
  document.body.appendChild(palco);
  return palco;
}

/**
 * Gera o PNG de um slide.
 * @returns {Promise<Uint8Array>} bytes do PNG 1080x1350
 */
export async function gerarPNG(slide, numero, total, opcoes = {}) {
  const base = opcoes.baseAssets || "/assets/carrossel/";
  const urlFoto = opcoes.urlFoto || (id => id);
  const A = await assetsEmbutidos(base);

  let fotoEmbutida = null;
  if (slide.foto) {
    const chave = String(slide.foto);
    if (!cacheFotos.has(chave)) {
      try { cacheFotos.set(chave, await paraDataURL(urlFoto(slide.foto))); }
      catch (e) { cacheFotos.set(chave, null); }   // segue sem a foto
    }
    fotoEmbutida = cacheFotos.get(chave);
  }

  await document.fonts.ready;
  const host = palcoOculto();
  host.innerHTML = slideHTML(slide, numero, total, { baseAssets: base, fotoEmbutida });
  const el = host.firstElementChild;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const copia = el.cloneNode(true);
  copia.querySelectorAll("img").forEach(img => {
    const k = img.getAttribute("data-k");
    if (k === "av") img.setAttribute("src", A.av);
    else if (k === "mc") img.setAttribute("src", A.mc);
  });
  copia.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");

  const corpoXML = new XMLSerializer().serializeToString(copia);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGURA}" height="${ALTURA}">` +
    `<defs><style type="text/css"><![CDATA[${A.css}]]></style></defs>` +
    `<foreignObject x="0" y="0" width="${LARGURA}" height="${ALTURA}">${corpoXML}</foreignObject></svg>`;

  const img = new Image();
  img.width = LARGURA; img.height = ALTURA;
  await new Promise((ok, erro) => {
    img.onload = ok;
    img.onerror = () => erro(new Error("não consegui desenhar o slide"));
    img.src = svgParaDataURL(svg);
  });

  const cv = document.createElement("canvas");
  cv.width = LARGURA; cv.height = ALTURA;
  const cx = cv.getContext("2d");
  cx.fillStyle = NAVY;
  cx.fillRect(0, 0, LARGURA, ALTURA);
  cx.drawImage(img, 0, 0, LARGURA, ALTURA);
  host.innerHTML = "";

  const blob = await new Promise(r => cv.toBlob(r, "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

/* ------------------------------------------------------------------ zip -- */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = TABELA_CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * ZIP sem compressão (método store). PNG já vem comprimido, então não há
 * ganho em recomprimir, e assim o módulo não depende de nenhuma biblioteca.
 * @param {{name:string, data:Uint8Array}[]} entradas
 */
export function zipar(entradas) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let desloc = 0;
  const u16 = n => [n & 255, (n >> 8) & 255];
  const u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255];

  for (const e of entradas) {
    const nome = enc.encode(e.name), c = crc32(e.data), tam = e.data.length;
    // bit 11 ligado = nome em UTF-8
    const cabec = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0), ...u32(c), ...u32(tam), ...u32(tam), ...u16(nome.length), ...u16(0)]);
    partes.push(cabec, nome, e.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800),
      ...u16(0), ...u16(0), ...u16(0), ...u32(c), ...u32(tam), ...u32(tam),
      ...u16(nome.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(desloc)]), nome);
    desloc += cabec.length + nome.length + tam;
  }
  let tamCentral = 0;
  for (const p of central) tamCentral += p.length;
  const fim = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entradas.length), ...u16(entradas.length), ...u32(tamCentral), ...u32(desloc), ...u16(0)]);
  return new Blob([...partes, ...central, fim], { type: "application/zip" });
}

export const apelido = s => String(s || "").toLowerCase().normalize("NFD")
  .replace(/[^\x00-\x7F]/g, "").replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "").slice(0, 32);

/** Arquivos de um carrossel: os PNGs mais a legenda. */
export async function arquivosDoCarrossel(carrossel, opcoes = {}, aoAvancar) {
  const enc = new TextEncoder();
  const total = carrossel.slides.length;
  const pasta = `${String(carrossel.n).padStart(2, "0")}-${apelido(carrossel.tit)}`;
  const saida = [];
  for (let i = 0; i < total; i++) {
    if (aoAvancar) aoAvancar(i, total);
    saida.push({ name: `${pasta}/slide-${i + 1}.png`,
                 data: await gerarPNG(carrossel.slides[i], i + 1, total, opcoes) });
  }
  if (carrossel.legenda) {
    saida.push({ name: `${pasta}/LEGENDA.txt`, data: enc.encode(carrossel.legenda) });
  }
  return saida;
}

export async function gerarZIPCarrossel(carrossel, opcoes = {}, aoAvancar) {
  return zipar(await arquivosDoCarrossel(carrossel, opcoes, aoAvancar));
}

export async function gerarZIPTudo(carrosseis, opcoes = {}, aoAvancar) {
  const enc = new TextEncoder();
  const todos = [];
  for (let i = 0; i < carrosseis.length; i++) {
    const c = carrosseis[i];
    todos.push(...await arquivosDoCarrossel(c, opcoes,
      (j, t) => aoAvancar && aoAvancar(i, carrosseis.length, j, t)));
  }
  todos.push({ name: "LEIA-ME.txt", data: enc.encode(
    `${carrosseis.length} CARROSSEIS @kadu.lins\n\n` +
    `${carrosseis.reduce((a, c) => a + c.slides.length, 0)} slides em ${LARGURA}x${ALTURA}, ` +
    `uma pasta por tema, com a legenda de cada post.\n\n` +
    carrosseis.map(c => `${String(c.n).padStart(2, "0")}  ` +
      `${c.postado ? "[POSTADO" + (c.postadoEm ? " em " + c.postadoEm : "") + "]" : "[na fila]"}  ${c.tit}`).join("\n")
  )});
  return zipar(todos);
}

/** Entrega um arquivo ao usuário. Fora do Claude isto é um download comum. */
export function baixar(nomeArquivo, dados) {
  const blob = dados instanceof Blob
    ? dados
    : new Blob([dados], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
