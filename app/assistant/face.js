/**
 * O rosto do JARBAS.
 *
 * Um perfil humano preenchido por trilhas de circuito, desenhado por código —
 * nada de imagem pronta, para escalar em qualquer tela e reagir ao que ele está
 * fazendo. As trilhas são sempre as mesmas (o gerador é semeado): uma identidade
 * que muda de forma a cada carregamento não é uma identidade.
 *
 * Expõe a mesma interface do orbe (setMode, setLevel, destroy), então dá para
 * trocar um pelo outro sem mexer no resto.
 */

const PALETA = {
  idle:      { traco: '#a89a45', vivo: '#e8dc86', pulso: '#fff7c4' },
  listening: { traco: '#c4b451', vivo: '#f2e79c', pulso: '#ffffff' },
  thinking:  { traco: '#b8823f', vivo: '#e8a86a', pulso: '#f2e79c' },
  speaking:  { traco: '#b0522f', vivo: '#e07a52', pulso: '#f6b48f' },
  error:     { traco: '#a33a26', vivo: '#e2553a', pulso: '#ff9a80' },
};
/* Perfil olhando para a direita, em coordenadas 0..1000 × 0..1200.
   Desenhado à mão porque contorno de rosto não sai de gerador. */
function silhueta() {
  const p = new Path2D();
  p.moveTo(342, 96);
  p.bezierCurveTo(520, 40, 700, 132, 742, 300);      // testa
  p.bezierCurveTo(756, 356, 742, 384, 726, 400);     // curva da sobrancelha
  p.bezierCurveTo(704, 420, 716, 430, 742, 452);     // raiz do nariz
  p.bezierCurveTo(790, 490, 828, 528, 826, 548);     // dorso até a ponta
  p.bezierCurveTo(824, 566, 786, 570, 752, 572);     // base do nariz
  p.bezierCurveTo(736, 574, 736, 588, 744, 600);     // sulco
  p.bezierCurveTo(752, 612, 734, 620, 722, 626);     // lábio superior
  p.bezierCurveTo(742, 640, 742, 654, 722, 664);     // boca e lábio inferior
  p.bezierCurveTo(712, 700, 730, 726, 706, 762);     // queixo
  p.bezierCurveTo(672, 806, 596, 828, 528, 828);     // mandíbula
  p.bezierCurveTo(500, 890, 512, 946, 540, 1000);    // pescoço à frente
  p.lineTo(556, 1200);
  p.lineTo(232, 1200);
  p.bezierCurveTo(238, 1040, 210, 980, 168, 906);    // trapézio
  p.bezierCurveTo(118, 818, 96, 700, 100, 592);      // nuca
  p.bezierCurveTo(104, 420, 180, 148, 342, 96);      // volta ao alto do crânio
  p.closePath();
  return p;
}

/* Orelha: um detalhe pequeno que faz o perfil deixar de ser máscara. */
function orelha() {
  const p = new Path2D();
  p.moveTo(566, 498);
  p.bezierCurveTo(614, 486, 638, 522, 630, 566);
  p.bezierCurveTo(624, 606, 598, 630, 570, 624);
  p.moveTo(580, 522);                                // hélice interna
  p.bezierCurveTo(606, 516, 616, 540, 610, 566);
  p.bezierCurveTo(606, 588, 594, 600, 582, 598);
  return p;
}

/** Gerador determinístico — mesma semente, mesmo rosto, sempre. */
function semear(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Trilhas ortogonais, como numa placa: anda em linha reta, dobra em ângulo
 * reto, às vezes termina num pad. É o que dá a leitura de "circuito" —
 * curvas livres virariam nervura, não placa.
 */
function gerarTrilhas(rnd, { colunas = 44, linhas = 54, passo = 23 }) {
  const trilhas = [];
  const ocupado = new Set();
  const chave = (c, l) => `${c},${l}`;

  const tentativas = 620;
  for (let i = 0; i < tentativas; i++) {
    let c = Math.floor(rnd() * colunas);
    let l = Math.floor(rnd() * linhas);
    if (ocupado.has(chave(c, l))) continue;

    const pontos = [[c, l]];
    let dir = rnd() < 0.5 ? [1, 0] : [0, 1];
    if (rnd() < 0.5) dir = [-dir[0], -dir[1]];
    const comprimento = 4 + Math.floor(rnd() * 16);

    for (let n = 0; n < comprimento; n++) {
      const salto = 1 + Math.floor(rnd() * 3);
      const nc = c + dir[0] * salto;
      const nl = l + dir[1] * salto;
      if (nc < 0 || nl < 0 || nc >= colunas || nl >= linhas) break;
      c = nc; l = nl;
      pontos.push([c, l]);
      ocupado.add(chave(c, l));
      // dobra em ângulo reto com frequência alta: é isso que faz parecer placa
      if (rnd() < 0.55) dir = dir[0] !== 0 ? [0, rnd() < 0.5 ? 1 : -1] : [rnd() < 0.5 ? 1 : -1, 0];
    }
    if (pontos.length < 3) continue;

    const emPixels = pontos.map(([cc, ll]) => [cc * passo + 70, ll * passo + 50]);
    trilhas.push({
      pontos: emPixels,
      comprimento: medir(emPixels),
      pad: rnd() < 0.42,
      via: rnd() < 0.22,
      espessura: rnd() < 0.16 ? 3.2 : rnd() < 0.5 ? 2.2 : 1.5,
      brilho: rnd(),
    });
  }
  return trilhas;
}

function medir(pontos) {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) {
    total += Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]);
  }
  return total;
}

/** Ponto a `d` pixels do início da trilha. */
function andar(pontos, d) {
  let resto = d;
  for (let i = 1; i < pontos.length; i++) {
    const [x0, y0] = pontos[i - 1];
    const [x1, y1] = pontos[i];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (resto <= seg) {
      const k = seg === 0 ? 0 : resto / seg;
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k];
    }
    resto -= seg;
  }
  return pontos[pontos.length - 1];
}

export function createFace(canvas, { semente = 20260809, densidade = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rnd = semear(semente);

  const perfil = silhueta();
  const orelhaPath = orelha();
  const trilhas = gerarTrilhas(rnd, {
    colunas: Math.round(44 * densidade),
    linhas: Math.round(54 * densidade),
    passo: 23 / densidade,
  });

  let modo = 'idle';
  let nivel = 0;
  let suave = 0;
  let t = 0;
  let raf = null;
  const pulsos = [];
  let tamanho = redimensionar();

  function redimensionar() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width) || canvas.width || 200);
    const h = Math.max(1, Math.round(r.height) || canvas.height || 240);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    return { w, h };
  }

  const ro = new ResizeObserver(() => { tamanho = redimensionar(); });
  ro.observe(canvas);

  function novoPulso() {
    if (!trilhas.length) return;
    const i = Math.floor(rnd() * trilhas.length);
    pulsos.push({ i, d: 0, vel: 190 + rnd() * 260 });
  }

  function desenhar() {
    const { w, h } = tamanho;
    const cor = PALETA[modo] ?? PALETA.idle;
    suave += (nivel - suave) * 0.2;
    t += 0.016;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // encaixa o desenho de 1000×1200 na área disponível
    const k = Math.min(w / 1000, h / 1200);
    ctx.save();
    ctx.translate((w - 1000 * k) / 2, (h - 1200 * k) / 2);
    ctx.scale(k, k);

    // brilho por trás da cabeça
    const halo = ctx.createRadialGradient(430, 480, 40, 430, 520, 720);
    halo.addColorStop(0, tinta(cor.vivo, 0.16 + suave * 0.2));
    halo.addColorStop(1, tinta(cor.vivo, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 1000, 1200);

    // Abaixo de ~72px as trilhas viram ruído e a cabeça deixa de ser legível:
    // no tamanho pequeno o rosto se reduz a silhueta, orelha e olho.
    const detalhado = w >= 72;

    ctx.save();
    ctx.clip(perfil);

    if (!detalhado) {
      const cheio = ctx.createLinearGradient(120, 120, 800, 1000);
      cheio.addColorStop(0, tinta(cor.vivo, 0.30 + suave * 0.28));
      cheio.addColorStop(1, tinta(cor.traco, 0.10));
      ctx.fillStyle = cheio;
      ctx.fillRect(0, 0, 1000, 1200);
    }

    // As trilhas dissolvem para baixo, como na referência. Um gradiente só,
    // cobrindo a área inteira: destination-in apaga tudo que a fonte não
    // cobrir, então dois retângulos em sequência apagariam um ao outro.
    const desvanecer = ctx.createLinearGradient(0, 0, 0, 1200);
    desvanecer.addColorStop(0, 'rgba(255,255,255,1)');
    desvanecer.addColorStop(0.56, 'rgba(255,255,255,1)');
    desvanecer.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const tr of detalhado ? trilhas : []) {
      const cintila = 0.86 + Math.sin(t * 0.8 + tr.brilho * 9) * 0.13 + suave * 0.2;
      ctx.globalAlpha = Math.min(1, cintila * (0.5 + tr.brilho * 0.5));
      ctx.strokeStyle = tr.brilho > 0.78 ? cor.vivo : cor.traco;
      ctx.lineWidth = tr.espessura;
      ctx.beginPath();
      ctx.moveTo(tr.pontos[0][0], tr.pontos[0][1]);
      for (let i = 1; i < tr.pontos.length; i++) ctx.lineTo(tr.pontos[i][0], tr.pontos[i][1]);
      ctx.stroke();

      const fim = tr.pontos[tr.pontos.length - 1];
      if (tr.pad) {
        ctx.fillStyle = tr.brilho > 0.78 ? cor.vivo : cor.traco;
        ctx.beginPath();
        ctx.arc(fim[0], fim[1], tr.espessura * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tr.via) {
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(tr.pontos[0][0], tr.pontos[0][1], 6.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // sinais correndo pelas trilhas
    ctx.globalAlpha = 1;
    for (const p of detalhado ? pulsos : []) {
      const tr = trilhas[p.i];
      if (!tr) continue;
      const cauda = 62;
      const a = andar(tr.pontos, Math.max(0, p.d - cauda));
      const b = andar(tr.pontos, p.d);
      const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      g.addColorStop(0, tinta(cor.pulso, 0));
      g.addColorStop(1, tinta(cor.pulso, 0.95));
      ctx.strokeStyle = g;
      ctx.lineWidth = tr.espessura + 1.6;
      ctx.shadowColor = cor.pulso;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // dissolve a parte de baixo
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = desvanecer;
    ctx.fillRect(0, 0, 1000, 1200);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    // contorno e orelha por cima do recorte
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = cor.vivo;
    ctx.lineWidth = 2.2;
    ctx.stroke(perfil);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6;
    ctx.stroke(orelhaPath);

    // o olho: único ponto quente do rosto, é o que faz olhar de volta
    const olho = 0.55 + Math.sin(t * 1.6) * 0.18 + suave * 0.4;
    ctx.globalAlpha = 1;
    ctx.shadowColor = cor.vivo;
    ctx.shadowBlur = 26 * olho;
    ctx.fillStyle = cor.vivo;
    ctx.beginPath();
    ctx.arc(668, 462, 8 + suave * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.restore();

    // avança os sinais
    const alvo = modo === 'idle' ? 2 : modo === 'thinking' ? 9 : 5 + suave * 6;
    if (pulsos.length < alvo && rnd() < 0.14) novoPulso();
    for (let i = pulsos.length - 1; i >= 0; i--) {
      const p = pulsos[i];
      p.d += p.vel * 0.016 * (modo === 'thinking' ? 1.7 : 1);
      if (p.d > (trilhas[p.i]?.comprimento ?? 0) + 70) pulsos.splice(i, 1);
    }

    raf = requestAnimationFrame(desenhar);
  }

  raf = requestAnimationFrame(desenhar);

  return {
    setMode(m) { modo = m in PALETA ? m : 'idle'; },
    setLevel(v) { nivel = Math.max(0, Math.min(1, v || 0)); },
    /** Desenha um quadro único e devolve, para exportar o retrato. */
    frame() { desenhar(); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

function tinta(hex, alfa) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
