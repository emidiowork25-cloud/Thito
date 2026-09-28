/*
 * editor.js  ·  Interface de edição dos carrosséis
 *
 *   import { montarEditor } from "./src/editor.js";
 *   import { adaptadorREST } from "./src/adaptadores.js";
 *
 *   const editor = montarEditor(document.getElementById("raiz"), {
 *     armazenamento: adaptadorREST({ base: "/api/carrosseis" }),
 *     baseAssets: "/assets/carrossel/",
 *     sementes: dadosIniciais,   // opcional
 *   });
 *   // editor.destruir()  quando desmontar a tela
 */

import {
  slideHTML, medirEstouro, normalizarCarrossel, normalizarSlide, modoFecho,
  gerarPNG, gerarZIPCarrossel, gerarZIPTudo, baixar, apelido,
  LARGURA, ALTURA,
} from "./arte.js";

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const copiar = o => JSON.parse(JSON.stringify(o));
const hoje = () => new Date().toLocaleDateString("pt-BR",
  { day: "2-digit", month: "2-digit", year: "numeric" });

export function montarEditor(raiz, opcoes = {}) {
  if (!raiz) throw new Error("montarEditor precisa de um elemento");

  const armazenamento = opcoes.armazenamento;
  if (!armazenamento) throw new Error("montarEditor precisa de um armazenamento");
  const baseAssets = opcoes.baseAssets || "/assets/carrossel/";
  const urlFoto = id => (armazenamento.urlFoto ? armazenamento.urlFoto(id) : id);
  const artOpts = { baseAssets, urlFoto };
  const aoSalvar = opcoes.aoSalvar || (() => {});
  const aoErro = opcoes.aoErro || (e => console.error("[carrossel]", e));

  /* ------------------------------------------------------------ estado -- */
  let BASE = [], DADOS = [], atual = 0, iSlide = 0;
  let GALERIA = [], arrastando = null, tSalvar = null, vivo = true;

  /* ------------------------------------------------------------ esqueleto */
  raiz.classList.add("kl-carrossel");
  raiz.innerHTML = `
  <div class="kl-bar">
    <div class="kl-wrap kl-bar-in">
      <div class="kl-brand">Carrosséis <span>@kadu.lins</span></div>
      <div class="kl-stat">
        <span data-el="placar">carregando</span>
        <span><span class="kl-dot" data-el="dot"></span> <span data-el="saveTxt">…</span></span>
      </div>
    </div>
    <div class="kl-rail" data-el="rail" role="tablist"></div>
  </div>
  <div class="kl-wrap">
    <div class="kl-head">
      <h2 data-el="tit">.</h2>
      <div class="kl-origem" data-el="origem"></div>
    </div>
    <div class="kl-steps" data-el="steps" role="tablist"></div>
    <div class="kl-edit">
      <div class="kl-stage">
        <div class="kl-frame" data-el="frame"></div>
        <div class="kl-aviso" data-el="aviso">
          <span>⚠</span>
          <span><b>Conteúdo estourando o slide.</b> <span data-el="avisoTxt"></span>
          Encurte um dos textos, senão a arte quebra na exportação.</span>
        </div>
        <button type="button" class="kl-postar" data-el="postarBox" aria-pressed="false">
          <span class="kl-tick" aria-hidden="true"></span>
          <span data-el="postadoTxt">Já postei este carrossel</span>
        </button>
        <div class="kl-acoes">
          <button class="kl-btn kl-forte" data-acao="slide">Baixar este slide</button>
          <button class="kl-btn kl-forte" data-acao="carrossel">Baixar este carrossel</button>
          <button class="kl-btn" data-acao="tudo">Baixar todos</button>
          <button class="kl-btn" data-acao="reset">Desfazer este slide</button>
        </div>
        <div class="kl-prog" data-el="prog">
          <div class="kl-barra"><i data-el="progBar"></i></div><span data-el="progTxt"></span>
        </div>
      </div>
      <div class="kl-fields" data-el="fields"></div>
    </div>
    <div class="kl-legenda">
      <h3>Legenda do post</h3>
      <textarea data-el="legenda" spellcheck="true"></textarea>
    </div>
  </div>`;

  const $ = n => raiz.querySelector(`[data-el="${n}"]`);

  /* --------------------------------------------------------- utilidades - */
  function estado(classe, txt) {
    $("dot").className = "kl-dot" + (classe ? " " + classe : "");
    $("saveTxt").textContent = txt;
  }
  function progresso(ligado, txt, pct) {
    $("prog").classList.toggle("on", !!ligado);
    $("progTxt").textContent = txt || "";
    $("progBar").style.width = (pct || 0) + "%";
  }
  function travar(v) {
    raiz.querySelectorAll("[data-acao]").forEach(b => { b.disabled = v; });
  }

  /* ------------------------------------------------------------ desenho - */
  function desenharRail() {
    $("rail").innerHTML = DADOS.map((c, i) => {
      const capa = c.slides[0] && c.slides[0].foto;
      const info = c.postado
        ? "postado" + (c.postadoEm ? " em " + c.postadoEm : "")
        : (c.views ? `${c.data} · ${c.views.toLocaleString("pt-BR")} views`
                   : esc(c.origem || "conteúdo novo"));
      return `<button class="kl-tab${c.postado ? " feito" : ""}" role="tab"
        aria-selected="${i === atual}" data-carrossel="${i}">
        <span class="kl-thumb" style="${capa ? `background-image:url('${urlFoto(capa)}')` : ""}"></span>
        <span class="kl-num">${String(c.n).padStart(2, "0")}</span>
        <b>${esc(c.tit)}</b><small>${info}</small></button>`;
    }).join("");
    const feitos = DADOS.filter(c => c.postado).length, total = DADOS.length;
    const slides = DADOS.reduce((a, c) => a + c.slides.length, 0);
    $("placar").textContent = feitos
      ? `${feitos} de ${total} postados · ${total - feitos} na fila`
      : `${total} carrosséis · ${slides} slides`;
  }

  function desenharPostado() {
    const c = DADOS[atual];
    $("postarBox").classList.toggle("feito", !!c.postado);
    $("postarBox").setAttribute("aria-pressed", c.postado ? "true" : "false");
    raiz.classList.toggle("kl-usado", !!c.postado);
    $("postadoTxt").textContent = c.postado
      ? (c.postadoEm ? "Postado em " + c.postadoEm : "Postado")
      : "Já postei este carrossel";
  }

  function desenharSteps() {
    $("steps").innerHTML = DADOS[atual].slides.map((s, i) =>
      `<button class="kl-step" role="tab" aria-selected="${i === iSlide}" data-slide="${i}">
        ${i + 1}<span class="kl-flag"></span></button>`).join("");
  }

  function desenharPalco() {
    const c = DADOS[atual], s = c.slides[iSlide];
    $("frame").innerHTML = slideHTML(s, iSlide + 1, c.slides.length, artOpts);
    const el = $("frame").querySelector(".kl-slide");
    const k = $("frame").clientWidth / LARGURA;
    el.style.transformOrigin = "0 0";
    el.style.position = "absolute";
    el.style.transform = `scale(${k})`;
    requestAnimationFrame(() => {
      const r = medirEstouro(el, k);
      $("aviso").classList.toggle("on", r.estourou);
      $("avisoTxt").textContent = r.estourou ? `Passou ${r.excesso}px do espaço disponível.` : "";
      const bt = $("steps").querySelector(`[data-slide="${iSlide}"]`);
      if (bt) bt.classList.toggle("over", r.estourou);
    });
  }

  function campo(rotulo, valor, aoMudar, dica, azul) {
    const w = document.createElement("div");
    w.className = "kl-fld" + (azul ? " kl-azul" : "");
    w.innerHTML = `<label>${esc(rotulo)}</label><textarea spellcheck="true"></textarea>` +
      (dica ? `<span class="kl-hint">${esc(dica)}</span>` : "");
    const ta = w.querySelector("textarea");
    ta.value = valor || "";
    ta.rows = Math.min(6, Math.max(2, Math.ceil((valor || "").length / 42)));
    ta.addEventListener("input", () => { aoMudar(ta.value); desenharPalco(); agendarSalvar(); });
    return w;
  }

  function campoFecho(s) {
    const w = document.createElement("div");
    w.className = "kl-fld kl-azul";
    const m = modoFecho(s);
    w.innerHTML = `<label>Frase de fecho</label>
      <div class="kl-seg" role="group" aria-label="Como mostrar a frase de fecho">
        <button type="button" data-modo="caixa"  aria-pressed="${m === "caixa"}">Caixa azul</button>
        <button type="button" data-modo="texto"  aria-pressed="${m === "texto"}">Só o texto</button>
        <button type="button" data-modo="oculto" aria-pressed="${m === "oculto"}">Não mostrar</button>
      </div>
      <textarea spellcheck="true"></textarea>
      <span class="kl-hint">${m === "caixa" ? "Sai dentro da caixa azul."
        : m === "texto" ? "Mesma frase, sem a caixa atrás."
        : "Fica guardada aqui, mas não aparece na arte."}</span>`;
    const ta = w.querySelector("textarea");
    ta.value = s.punch || "";
    ta.rows = Math.min(5, Math.max(2, Math.ceil((s.punch || "").length / 42)));
    ta.addEventListener("input", () => { s.punch = ta.value; desenharPalco(); agendarSalvar(); });
    return w;
  }

  function blocoFoto() {
    const s = normalizarSlide(DADOS[atual].slides[iSlide]);
    const g = document.createElement("div");
    g.className = "kl-grupo";
    g.innerHTML = `<label>Foto de fundo deste slide</label>
      <div class="kl-fotoBox">
        <div class="kl-fotoAtual${s.foto ? "" : " vazio"}"
             style="${s.foto ? `background-image:url('${urlFoto(s.foto)}')` : ""}"></div>
        <div class="kl-fotoAcoes">
          <label class="kl-btn kl-forte" data-el="rotFoto">Enviar foto
            <input type="file" data-el="fotoInput" accept="image/png,image/jpeg,image/webp"></label>
          <button type="button" class="kl-btn" data-foto-acao="tirar" ${s.foto ? "" : "disabled"}>Tirar foto</button>
          <button type="button" class="kl-btn" data-foto-acao="todos" ${s.foto ? "" : "disabled"}>Usar em todos os slides</button>
        </div>
      </div>
      <span class="kl-hint">JPG, PNG ou WebP. A foto entra como camada bem sutil (até 20%) por cima do azul marinho, que é o fundo fixo do post.</span>
      <label style="margin-top:4px">Galeria</label>
      <div class="kl-galeria" data-el="galeria"></div>`;
    const gal = g.querySelector('[data-el="galeria"]');
    gal.innerHTML = GALERIA.length
      ? GALERIA.map(f => `<button type="button" data-foto="${esc(f.id)}"
          aria-pressed="${f.id === s.foto}" title="Usar esta foto"
          style="background-image:url('${f.url || urlFoto(f.id)}')"></button>`).join("")
      : `<span class="kl-vazioTxt">As fotos enviadas aparecem aqui para reaproveitar em outros slides.</span>`;
    return g;
  }

  function blocoAjustes() {
    const s = normalizarSlide(DADOS[atual].slides[iSlide]);
    const g = document.createElement("div");
    g.className = "kl-grupo";
    g.innerHTML = `<label>Ajustes da foto</label>
      <div class="kl-ajustes">
        <div class="kl-aj"><label>Presença da foto <span class="kl-val" data-el="opacVal">${s.opac}%</span></label>
          <input type="range" data-ajuste="opac" min="0" max="20" step="1" value="${s.opac}">
          <span class="kl-hint">Máximo 20%: a foto fica como textura por cima do azul.</span></div>
        <div class="kl-aj"><label>Escala <span class="kl-val" data-el="escalaVal">${s.escala}%</span></label>
          <input type="range" data-ajuste="escala" min="100" max="300" step="5" value="${s.escala}">
          <span class="kl-hint">100% cobre o slide; acima disso dá zoom.</span></div>
        <div class="kl-aj"><label>Posição horizontal <span class="kl-val" data-el="posXVal">${s.posX}%</span></label>
          <input type="range" data-ajuste="posX" min="0" max="100" step="1" value="${s.posX}"></div>
        <div class="kl-aj"><label>Posição vertical <span class="kl-val" data-el="posYVal">${s.posY}%</span></label>
          <input type="range" data-ajuste="posY" min="0" max="100" step="1" value="${s.posY}">
          <span class="kl-hint">Dá pra arrastar a foto direto na prévia.</span></div>
      </div>`;
    return g;
  }

  function desenharCampos() {
    const s = DADOS[atual].slides[iSlide], box = $("fields");
    box.innerHTML = "";
    const N = "Use <b>palavra</b> para deixar em negrito.";
    if (s.t === "cover") {
      box.append(campo("Título da capa", s.h, v => s.h = v, N));
      box.append(campo("Subtítulo", s.p, v => s.p = v, N));
    } else if (s.t === "def") {
      box.append(campo("Título", s.h, v => s.h = v, N));
      (s.ps || []).forEach((p, i) => box.append(campo("Parágrafo " + (i + 1), p, v => s.ps[i] = v, N)));
      box.append(campoFecho(s));
    } else if (s.t === "list") {
      box.append(campo("Rótulo do topo", s.label || "", v => s.label = v, "Deixe vazio pra ocultar."));
      (s.items || []).forEach((it, i) => {
        const w = document.createElement("div");
        w.className = "kl-item";
        w.innerHTML = `<span class="kl-tag">ITEM ${i + 1}</span>`;
        w.append(campo("Termo", it[0], v => it[0] = v));
        w.append(campo("Explicação", it[1], v => it[1] = v));
        box.append(w);
      });
      box.append(campo("Linha de fecho", s.foot || "", v => s.foot = v,
        "Vem antes da caixa azul. Deixe vazio pra ocultar."));
      box.append(campoFecho(s));
    } else {
      box.append(campo("Rótulo do topo", s.label || "", v => s.label = v, "Deixe vazio pra ocultar."));
      box.append(campo("Título", s.h, v => s.h = v, N));
      box.append(campoFecho(s));
    }
    box.append(blocoFoto());
    box.append(blocoAjustes());
  }

  function desenharTudo() {
    const c = DADOS[atual];
    $("tit").textContent = c.tit;
    $("origem").innerHTML = c.views
      ? `Post original <b>${esc(c.data)}</b><br>${c.views.toLocaleString("pt-BR")} visualizações`
      : `<b>Conteúdo novo</b><br>${esc(c.origem || "sem post de origem")}`;
    $("legenda").value = c.legenda || "";
    desenharRail(); desenharPostado(); desenharSteps(); desenharPalco(); desenharCampos();
  }

  /* ------------------------------------------------------- persistência - */
  function agendarSalvar() {
    estado(null, "editando");
    clearTimeout(tSalvar);
    tSalvar = setTimeout(salvar, 900);
  }
  async function salvar() {
    try {
      await armazenamento.salvar(copiar(DADOS[atual]));
      estado("on", "salvo");
      aoSalvar(DADOS[atual]);
    } catch (e) { estado("off", "falha ao salvar"); aoErro(e); }
  }

  /* ------------------------------------------------------------ entrega - */
  async function baixarSlide() {
    travar(true);
    try {
      const c = DADOS[atual];
      progresso(true, "Gerando o slide…", 50);
      const png = await gerarPNG(c.slides[iSlide], iSlide + 1, c.slides.length, artOpts);
      baixar(`${String(c.n).padStart(2, "0")}-${apelido(c.tit)}-slide-${iSlide + 1}.png`,
             new Blob([png], { type: "image/png" }));
      progresso(false);
    } catch (e) { progresso(true, "Falhou ao gerar o slide.", 0); aoErro(e); }
    finally { travar(false); }
  }
  async function baixarCarrossel() {
    travar(true);
    try {
      const c = DADOS[atual];
      const zip = await gerarZIPCarrossel(c, artOpts,
        (i, t) => progresso(true, `Slide ${i + 1} de ${t}…`, (i / t) * 100));
      progresso(true, "Montando o ZIP…", 96);
      baixar(`${String(c.n).padStart(2, "0")}-${apelido(c.tit)}.zip`, zip);
      progresso(false);
    } catch (e) { progresso(true, "Falhou ao gerar o carrossel.", 0); aoErro(e); }
    finally { travar(false); }
  }
  async function baixarTudo() {
    travar(true);
    try {
      const zip = await gerarZIPTudo(DADOS, artOpts, (i, n, j, t) =>
        progresso(true, `Carrossel ${i + 1} de ${n}, slide ${j + 1} de ${t}…`,
                  ((i + j / t) / n) * 100));
      progresso(true, "Montando o ZIP…", 98);
      baixar("carrosseis-kadu-lins.zip", zip);
      progresso(false);
    } catch (e) { progresso(true, "Falhou ao gerar o pacote.", 0); aoErro(e); }
    finally { travar(false); }
  }

  /* ------------------------------------------------------------ eventos - */
  function alternarPostado() {
    const antes = !!DADOS[atual].postado, agora = !antes;
    // troca o objeto em vez de alterá-lo: se vier congelado do backend,
    // uma atribuição direta falharia em silêncio
    DADOS[atual] = Object.assign({}, DADOS[atual],
      { postado: agora, postadoEm: agora ? hoje() : null });
    desenharPostado(); desenharRail(); salvar();
  }

  const noClique = async ev => {
    const t = ev.target;
    if (!t || !t.closest || !raiz.contains(t)) return;

    const aba = t.closest("[data-carrossel]");
    if (aba) { atual = +aba.dataset.carrossel; iSlide = 0; desenharTudo();
               raiz.scrollIntoView({ behavior: "smooth", block: "start" }); return; }

    const passo = t.closest("[data-slide]");
    if (passo) { iSlide = +passo.dataset.slide; desenharSteps(); desenharPalco(); desenharCampos(); return; }

    if (t.closest('[data-el="postarBox"]')) { ev.preventDefault(); alternarPostado(); return; }

    const modo = t.closest("[data-modo]");
    if (modo) { DADOS[atual].slides[iSlide].punchModo = modo.dataset.modo;
                desenharPalco(); desenharCampos(); agendarSalvar(); return; }

    const gf = t.closest("[data-foto]");
    if (gf) { normalizarSlide(DADOS[atual].slides[iSlide]).foto = gf.dataset.foto;
              desenharPalco(); desenharCampos(); desenharRail(); agendarSalvar(); return; }

    const fa = t.closest("[data-foto-acao]");
    if (fa) {
      const s = normalizarSlide(DADOS[atual].slides[iSlide]);
      if (fa.dataset.fotoAcao === "tirar") s.foto = null;
      if (fa.dataset.fotoAcao === "todos") {
        DADOS[atual].slides.forEach(x => {
          normalizarSlide(x);
          x.foto = s.foto; x.opac = s.opac; x.escala = s.escala; x.posX = s.posX; x.posY = s.posY;
        });
      }
      desenharPalco(); desenharCampos(); desenharRail(); agendarSalvar(); return;
    }

    const acao = t.closest("[data-acao]");
    if (acao) {
      const a = acao.dataset.acao;
      if (a === "slide") return baixarSlide();
      if (a === "carrossel") return baixarCarrossel();
      if (a === "tudo") return baixarTudo();
      if (a === "reset") {
        DADOS[atual].slides[iSlide] = copiar(BASE[atual].slides[iSlide]);
        desenharPalco(); desenharCampos(); agendarSalvar();
      }
    }
  };

  const noInput = ev => {
    const el = ev.target;
    if (!el || !raiz.contains(el)) return;
    if (el.dataset && el.dataset.el === "legenda") {
      DADOS[atual] = Object.assign({}, DADOS[atual], { legenda: el.value });
      agendarSalvar(); return;
    }
    const aj = el.dataset && el.dataset.ajuste;
    if (!aj) return;
    const s = normalizarSlide(DADOS[atual].slides[iSlide]);
    s[aj] = +el.value;
    const v = $(aj + "Val"); if (v) v.textContent = s[aj] + "%";
    desenharPalco(); agendarSalvar();
  };

  const naMudanca = ev => {
    const el = ev.target;
    if (!el || !raiz.contains(el)) return;
    if (el.dataset && el.dataset.el === "fotoInput" && el.files && el.files[0]) enviarFoto(el.files[0]);
  };

  async function enviarFoto(arquivo) {
    const rot = $("rotFoto");
    const textoAntes = rot ? rot.firstChild.nodeValue : null;
    if (rot) rot.firstChild.nodeValue = "Enviando… ";
    try {
      const f = await armazenamento.enviarFoto(arquivo);
      normalizarSlide(DADOS[atual].slides[iSlide]).foto = f.id;
      if (!GALERIA.some(x => x.id === f.id)) GALERIA.unshift(f);
      desenharPalco(); desenharCampos(); desenharRail(); agendarSalvar();
    } catch (e) {
      estado("off", "falha ao enviar a foto");
      aoErro(e);
      if (rot && textoAntes) rot.firstChild.nodeValue = textoAntes;
    }
  }

  /* arrastar a foto na prévia */
  const frame = $("frame");
  const aoApontar = ev => {
    const s = DADOS[atual] && DADOS[atual].slides[iSlide];
    if (!s || !s.foto) return;
    arrastando = { x: ev.clientX, y: ev.clientY, px: s.posX, py: s.posY,
                   w: frame.clientWidth, h: frame.clientHeight };
    frame.setPointerCapture(ev.pointerId);
    frame.style.cursor = "grabbing";
  };
  const aoMover = ev => {
    if (!arrastando) return;
    const s = DADOS[atual].slides[iSlide];
    const k = Math.max(1, (s.escala || 100) / 100);
    s.posX = Math.round(Math.max(0, Math.min(100,
      arrastando.px - (ev.clientX - arrastando.x) / arrastando.w * 100 / k * 1.5)));
    s.posY = Math.round(Math.max(0, Math.min(100,
      arrastando.py - (ev.clientY - arrastando.y) / arrastando.h * 100 / k * 1.5)));
    desenharPalco();
    const rx = raiz.querySelector('[data-ajuste="posX"]'), ry = raiz.querySelector('[data-ajuste="posY"]');
    if (rx) { rx.value = s.posX; $("posXVal").textContent = s.posX + "%"; }
    if (ry) { ry.value = s.posY; $("posYVal").textContent = s.posY + "%"; }
  };
  const aoSoltar = () => { if (!arrastando) return; arrastando = null; frame.style.cursor = ""; agendarSalvar(); };
  const aoRedimensionar = () => { if (vivo && DADOS.length) desenharPalco(); };

  raiz.addEventListener("click", noClique, true);
  raiz.addEventListener("input", noInput);
  raiz.addEventListener("change", naMudanca);
  frame.addEventListener("pointerdown", aoApontar);
  frame.addEventListener("pointermove", aoMover);
  frame.addEventListener("pointerup", aoSoltar);
  frame.addEventListener("pointercancel", aoSoltar);
  window.addEventListener("resize", aoRedimensionar);

  /* -------------------------------------------------------------- boot -- */
  (async function iniciar() {
    estado(null, "carregando");
    try {
      const guardados = await armazenamento.carregar();
      const sementes = opcoes.sementes || [];
      const mapa = new Map();
      sementes.forEach(c => mapa.set(c.n, copiar(c)));
      (guardados || []).forEach(c => { if (c && c.n != null) mapa.set(c.n, copiar(c)); });
      DADOS = [...mapa.values()].sort((a, b) => a.n - b.n).map(normalizarCarrossel);
      BASE = copiar(sementes.length ? sementes : DADOS).map(normalizarCarrossel);
      if (!DADOS.length) throw new Error("nenhum carrossel para mostrar");
      if (BASE.length !== DADOS.length) BASE = copiar(DADOS);

      try { GALERIA = (await armazenamento.listarFotos()) || []; } catch (e) { GALERIA = []; }
      DADOS.forEach(c => c.slides.forEach(s => {
        if (s.foto && !GALERIA.some(f => f.id === s.foto)) GALERIA.push({ id: s.foto, url: urlFoto(s.foto) });
      }));

      desenharTudo();
      estado("on", "pronto");
    } catch (e) {
      $("tit").textContent = "Não consegui carregar os carrosséis";
      $("origem").textContent = "Confira a conexão com a API e recarregue.";
      estado("off", "erro ao carregar");
      aoErro(e);
    }
  })();

  /* -------------------------------------------------------------- API --- */
  return {
    get dados() { return DADOS; },
    irPara(n) {
      const i = DADOS.findIndex(c => c.n === n);
      if (i >= 0) { atual = i; iSlide = 0; desenharTudo(); }
    },
    baixarSlide, baixarCarrossel, baixarTudo,
    destruir() {
      vivo = false;
      clearTimeout(tSalvar);
      raiz.removeEventListener("click", noClique, true);
      raiz.removeEventListener("input", noInput);
      raiz.removeEventListener("change", naMudanca);
      frame.removeEventListener("pointerdown", aoApontar);
      frame.removeEventListener("pointermove", aoMover);
      frame.removeEventListener("pointerup", aoSoltar);
      frame.removeEventListener("pointercancel", aoSoltar);
      window.removeEventListener("resize", aoRedimensionar);
      raiz.classList.remove("kl-carrossel", "kl-usado");
      raiz.innerHTML = "";
    },
  };
}
