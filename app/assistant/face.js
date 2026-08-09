/**
 * O rosto do JARBAS: um crânio em dupla exposição.
 *
 * A silhueta dá a forma; o preenchimento são dois sistemas sobrepostos que se
 * misturam — trilhas de circuito (ortogonais, com pads e vias) e uma rede neural
 * (nós e axônios curvos). É dupla exposição no sentido literal: cada camada é
 * desenhada com um deslocamento próprio, como dois negativos no mesmo filme.
 *
 * A rede neural pesa na abóbada, o circuito pesa na face e na mandíbula, e as
 * duas se cruzam no meio. O ângulo reto de uma contra a curva da outra é o que
 * faz as duas se lerem como coisas diferentes na mesma imagem.
 *
 * Tudo desenhado por código — nada de imagem pronta, para escalar em qualquer
 * tela e reagir ao estado. O gerador é semeado: mesma semente, mesmo crânio,
 * sempre. Identidade que se embaralha a cada carregamento não é identidade.
 *
 * Expõe a mesma interface do orbe (setMode, setLevel, destroy).
 */

const PALETA = {
  idle:      { rede: '#6f8aa3', circuito: '#bcceda', vivo: '#e2eef7', pulso: '#f5faff' },
  listening: { rede: '#89a7c0', circuito: '#dceaf4', vivo: '#ffffff', pulso: '#ffffff' },
  thinking:  { rede: '#9a8a6a', circuito: '#d3a35f', vivo: '#f0dcb4', pulso: '#fff3d8' },
  speaking:  { rede: '#6f8fa8', circuito: '#9fc4dd', vivo: '#e2eef7', pulso: '#ffffff' },
  error:     { rede: '#8a5f5a', circuito: '#d3736b', vivo: '#f0b0a8', pulso: '#ffd8d2' },
};

/* ============================ anatomia ============================ */
/* Perfil olhando para a direita, em coordenadas 0..1000 × 0..1200.
   Desenhado à mão: contorno de crânio não sai de gerador. */

function cranio() {
  const p = new Path2D();
  p.moveTo(600, 176);
  p.bezierCurveTo(694, 190, 766, 250, 796, 330);    // osso frontal, mais baixo
  p.bezierCurveTo(808, 364, 816, 388, 818, 404);    // glabela
  p.bezierCurveTo(802, 416, 792, 422, 798, 436);    // násio: a depressão
  p.bezierCurveTo(816, 466, 844, 492, 846, 508);    // osso nasal
  p.bezierCurveTo(840, 518, 830, 520, 822, 522);    // entalhe piriforme
  p.bezierCurveTo(836, 542, 846, 564, 842, 586);    // espinha nasal
  p.bezierCurveTo(838, 616, 830, 646, 820, 668);    // maxila projetada
  p.bezierCurveTo(814, 682, 806, 692, 796, 698);    // rebordo alveolar
  p.bezierCurveTo(814, 718, 816, 744, 800, 764);    // mento
  p.bezierCurveTo(726, 806, 636, 818, 566, 806);    // corpo da mandíbula
  p.lineTo(524, 792);                               // canto do gônio, anguloso
  p.bezierCurveTo(512, 762, 508, 706, 512, 656);    // ramo subindo ao côndilo
  p.bezierCurveTo(490, 664, 466, 664, 446, 656);    // incisura até a mastoide
  p.bezierCurveTo(384, 632, 328, 566, 308, 494);    // occipital, mais recolhido
  p.bezierCurveTo(286, 414, 330, 250, 440, 198);    // abóbada, mais baixa
  p.bezierCurveTo(492, 176, 550, 172, 600, 176);
  p.closePath();
  return p;
}

/** Órbita: o vazio que faz o crânio ser crânio. */
function orbita() {
  const p = new Path2D();
  p.moveTo(818, 418);
  p.bezierCurveTo(766, 414, 704, 434, 686, 472);
  p.bezierCurveTo(668, 508, 688, 542, 728, 548);
  p.bezierCurveTo(776, 556, 806, 520, 812, 472);
  p.bezierCurveTo(816, 446, 824, 424, 818, 418);
  p.closePath();
  return p;
}

/** Abertura piriforme, logo abaixo do osso nasal. */
function narina() {
  const p = new Path2D();
  p.moveTo(820, 506);
  p.bezierCurveTo(802, 526, 794, 550, 806, 562);
  p.bezierCurveTo(818, 572, 832, 558, 836, 536);
  p.bezierCurveTo(838, 520, 830, 508, 820, 506);
  p.closePath();
  return p;
}

/** Meato acústico: o furo do ouvido, logo à frente do côndilo. */
function meato() {
  const p = new Path2D();
  p.ellipse(548, 604, 19, 15, -0.15, 0, Math.PI * 2);
  return p;
}

/** Arco zigomático, sutura coronal e as linhas alveolares. */
function detalhes() {
  const p = new Path2D();
  p.moveTo(724, 516);                                // arco zigomático
  p.bezierCurveTo(668, 546, 596, 558, 556, 552);
  p.moveTo(462, 216);                                // sutura coronal
  p.bezierCurveTo(508, 312, 520, 410, 504, 492);
  p.moveTo(800, 696);                                // rebordo superior
  p.bezierCurveTo(748, 710, 690, 714, 642, 708);
  p.moveTo(788, 762);                                // linha da mandíbula
  p.bezierCurveTo(718, 788, 640, 796, 580, 788);
  p.moveTo(512, 656);                                // borda anterior do ramo
  p.bezierCurveTo(548, 690, 568, 738, 570, 786);
  return p;
}

/** Dentes: traços curtos pendurados nos rebordos. */
function dentes() {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const x = 790 - i * 25;
    p.moveTo(x, 698 - i * 1.4);
    p.lineTo(x - 2, 718 - i * 1.4);
  }
  for (let i = 0; i < 6; i++) {
    const x = 776 - i * 25;
    p.moveTo(x, 760 - i * 3.6);
    p.lineTo(x - 2, 742 - i * 3.6);
  }
  return p;
}

/* ============================ geradores ============================ */

/** Gerador determinístico — mesma semente, mesmo crânio, sempre. */
function semear(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Trilhas ortogonais, como numa placa: reta, dobra em ângulo reto, às vezes
 * termina num pad. Curva livre viraria nervura — e nervura é trabalho da
 * outra camada.
 */
function gerarCircuito(rnd, { colunas, linhas, passo }) {
  const trilhas = [];
  const ocupado = new Set();
  const chave = (c, l) => `${c},${l}`;

  for (let i = 0; i < 520; i++) {
    let c = Math.floor(rnd() * colunas);
    let l = Math.floor(rnd() * linhas);
    if (ocupado.has(chave(c, l))) continue;

    const pontos = [[c, l]];
    let dir = rnd() < 0.5 ? [1, 0] : [0, 1];
    if (rnd() < 0.5) dir = [-dir[0], -dir[1]];

    const comprimento = 4 + Math.floor(rnd() * 14);
    for (let n = 0; n < comprimento; n++) {
      const salto = 1 + Math.floor(rnd() * 3);
      const nc = c + dir[0] * salto;
      const nl = l + dir[1] * salto;
      if (nc < 0 || nl < 0 || nc >= colunas || nl >= linhas) break;
      c = nc; l = nl;
      pontos.push([c, l]);
      ocupado.add(chave(c, l));
      if (rnd() < 0.55) dir = dir[0] !== 0 ? [0, rnd() < 0.5 ? 1 : -1] : [rnd() < 0.5 ? 1 : -1, 0];
    }
    if (pontos.length < 3) continue;

    const px = pontos.map(([cc, ll]) => [cc * passo + 250, ll * passo + 150]);
    trilhas.push({
      pontos: px,
      comprimento: medir(px),
      pad: rnd() < 0.4,
      via: rnd() < 0.2,
      espessura: rnd() < 0.15 ? 2.8 : rnd() < 0.5 ? 2 : 1.4,
      brilho: rnd(),
    });
  }
  return trilhas;
}

/**
 * Rede neural: nós espalhados com viés para o alto — o pensamento mora na
 * abóbada —, ligados aos vizinhos por axônios arqueados, mais alguns dendritos
 * curtos que não vão a lugar nenhum.
 */
function gerarRede(rnd, quantidade) {
  const nos = [];
  for (let i = 0; i < quantidade; i++) {
    nos.push({
      x: 270 + rnd() * 560,
      y: 160 + Math.pow(rnd(), 1.6) * 560,
      r: 2 + rnd() * 4.2,
      brilho: rnd(),
    });
  }

  const axonios = [];
  for (const a of nos) {
    const perto = nos
      .filter((b) => b !== a)
      .map((b) => ({ b, d: Math.hypot(b.x - a.x, b.y - a.y) }))
      .sort((u, v) => u.d - v.d)
      .slice(0, 2 + Math.floor(rnd() * 2));

    for (const { b, d } of perto) {
      if (d > 230 || d < 1) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const curva = (rnd() - 0.5) * d * 0.55;
      const nx = -(b.y - a.y) / d;
      const ny = (b.x - a.x) / d;
      axonios.push({
        a, b,
        cx: mx + nx * curva, cy: my + ny * curva,
        comprimento: d * 1.15,
        espessura: 0.7 + rnd() * 1.5,
        brilho: rnd(),
      });
    }

    if (rnd() < 0.5) {
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const ang = rnd() * Math.PI * 2;
        const len = 12 + rnd() * 26;
        axonios.push({
          a,
          b: { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len },
          cx: a.x + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 10,
          cy: a.y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 10,
          comprimento: len, espessura: 0.6, brilho: rnd() * 0.5, dendrito: true,
        });
      }
    }
  }
  return { nos, axonios };
}

function medir(pontos) {
  let total = 0;
  for (let i = 1; i < pontos.length; i++) {
    total += Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]);
  }
  return total;
}

/** Ponto a `d` pixels do início de uma polilinha. */
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

/** Ponto em t (0..1) de uma quadrática. */
function naCurva(ax, ay, cx, cy, bx, by, t) {
  const u = 1 - t;
  return [u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by];
}

/* ============================ desenho ============================ */

export function createFace(canvas, { semente = 20260809, densidade = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rnd = semear(semente);

  const silhueta = cranio();
  const olho = orbita();
  const nariz = narina();
  const ouvido = meato();
  const linhas = detalhes();
  const dentadura = dentes();

  const circuito = gerarCircuito(rnd, {
    colunas: Math.round(30 * densidade),
    linhas: Math.round(32 * densidade),
    passo: 22 / densidade,
  });
  const rede = gerarRede(rnd, Math.round(74 * densidade));

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
    if (rnd() < 0.5 && circuito.length) {
      pulsos.push({ tipo: 'c', i: Math.floor(rnd() * circuito.length), d: 0, vel: 200 + rnd() * 260 });
      return;
    }
    const candidatos = rede.axonios.filter((x) => !x.dendrito);
    if (candidatos.length) {
      pulsos.push({ tipo: 'n', ax: candidatos[Math.floor(rnd() * candidatos.length)], d: 0, vel: 140 + rnd() * 190 });
    }
  }

  function desenhar() {
    const { w, h } = tamanho;
    const cor = PALETA[modo] ?? PALETA.idle;
    suave += (nivel - suave) * 0.2;
    t += 0.016;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const k = Math.min(w / 1000, h / 1200);
    ctx.save();
    ctx.translate((w - 1000 * k) / 2, (h - 1200 * k) / 2);
    ctx.scale(k, k);

    // halo atrás da caixa craniana
    const halo = ctx.createRadialGradient(520, 400, 40, 520, 440, 560);
    halo.addColorStop(0, tinta(cor.circuito, 0.13 + suave * 0.18));
    halo.addColorStop(1, tinta(cor.circuito, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 1000, 1200);

    // Abaixo de ~72px de largura o preenchimento vira ruído e a cabeça deixa de
    // ser legível: no tamanho pequeno o crânio se reduz a silhueta e órbita.
    const detalhado = w >= 72;

    ctx.save();
    ctx.clip(silhueta);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // volume: a luz vem de cima à esquerda, como num busto sobre a mesa
    const volume = ctx.createLinearGradient(260, 150, 840, 760);
    volume.addColorStop(0, tinta(cor.circuito, detalhado ? 0.16 : 0.36 + suave * 0.26));
    volume.addColorStop(0.55, tinta(cor.rede, detalhado ? 0.08 : 0.18));
    volume.addColorStop(1, 'rgba(0, 0, 0, 0.30)');
    ctx.fillStyle = volume;
    ctx.fillRect(0, 0, 1000, 1200);

    if (detalhado) {
      // ---- exposição 1: rede neural, deslocada para cima e para a esquerda ----
      ctx.save();
      ctx.translate(-9, -6);
      ctx.globalCompositeOperation = 'lighter';
      for (const ax of rede.axonios) {
        ctx.globalAlpha = (ax.dendrito ? 0.16 : 0.34) * (0.5 + ax.brilho * 0.5)
          * (0.85 + Math.sin(t * 0.7 + ax.brilho * 8) * 0.15 + suave * 0.2);
        ctx.strokeStyle = cor.rede;
        ctx.lineWidth = ax.espessura;
        ctx.beginPath();
        ctx.moveTo(ax.a.x, ax.a.y);
        ctx.quadraticCurveTo(ax.cx, ax.cy, ax.b.x, ax.b.y);
        ctx.stroke();
      }
      for (const no of rede.nos) {
        ctx.globalAlpha = 0.4 * (0.4 + no.brilho * 0.6) + suave * 0.2;
        ctx.fillStyle = no.brilho > 0.84 ? cor.vivo : cor.rede;
        ctx.beginPath();
        ctx.arc(no.x, no.y, no.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // ---- exposição 2: circuito, deslocado para baixo e para a direita ----
      ctx.save();
      ctx.translate(9, 6);
      ctx.globalCompositeOperation = 'lighter';
      for (const tr of circuito) {
        ctx.globalAlpha = 0.42 * (0.45 + tr.brilho * 0.55)
          * (0.85 + Math.sin(t * 0.8 + tr.brilho * 9) * 0.15 + suave * 0.25);
        ctx.strokeStyle = tr.brilho > 0.8 ? cor.vivo : cor.circuito;
        ctx.lineWidth = tr.espessura;
        ctx.beginPath();
        ctx.moveTo(tr.pontos[0][0], tr.pontos[0][1]);
        for (let i = 1; i < tr.pontos.length; i++) ctx.lineTo(tr.pontos[i][0], tr.pontos[i][1]);
        ctx.stroke();

        const fim = tr.pontos[tr.pontos.length - 1];
        if (tr.pad) {
          ctx.fillStyle = tr.brilho > 0.8 ? cor.vivo : cor.circuito;
          ctx.beginPath();
          ctx.arc(fim[0], fim[1], tr.espessura * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
        if (tr.via) {
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(tr.pontos[0][0], tr.pontos[0][1], 5.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();

      // ---- sinais correndo nas duas camadas ----
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      for (const p of pulsos) {
        let a, b;
        if (p.tipo === 'c') {
          const tr = circuito[p.i];
          if (!tr) continue;
          a = andar(tr.pontos, Math.max(0, p.d - 56));
          b = andar(tr.pontos, p.d);
          ctx.lineWidth = tr.espessura + 1.4;
        } else {
          const ax = p.ax;
          const t1 = Math.min(1, p.d / ax.comprimento);
          const t0 = Math.max(0, (p.d - 46) / ax.comprimento);
          a = naCurva(ax.a.x, ax.a.y, ax.cx, ax.cy, ax.b.x, ax.b.y, t0);
          b = naCurva(ax.a.x, ax.a.y, ax.cx, ax.cy, ax.b.x, ax.b.y, t1);
          ctx.lineWidth = ax.espessura + 1.6;
        }
        const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        g.addColorStop(0, tinta(cor.pulso, 0));
        g.addColorStop(1, tinta(cor.pulso, 0.9));
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();   // fim do recorte

    // órbita e narina: vazios escavados por cima de tudo
    ctx.save();
    ctx.fillStyle = 'rgba(6, 12, 17, .92)';
    ctx.fill(olho);
    ctx.fill(nariz);
    if (detalhado) ctx.fill(ouvido);
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = cor.circuito;
    ctx.lineWidth = 1.6;
    ctx.stroke(olho);
    ctx.stroke(nariz);
    ctx.restore();

    // contorno, sutura, arco zigomático e dentes
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = cor.circuito;
    ctx.lineWidth = 2.2;
    ctx.stroke(silhueta);
    if (detalhado) {
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1.5;
      ctx.stroke(linhas);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2.4;
      ctx.stroke(dentadura);
    }

    // luz de contorno na abóbada: volume sem sombra falsa
    const rim = ctx.createLinearGradient(300, 160, 680, 420);
    rim.addColorStop(0, tinta(cor.vivo, 0.55));
    rim.addColorStop(1, tinta(cor.vivo, 0));
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3;
    ctx.stroke(silhueta);

    // a brasa na órbita: é o que faz o crânio olhar de volta
    const brasa = 0.5 + Math.sin(t * 1.5) * 0.16 + suave * 0.4;
    ctx.shadowColor = cor.vivo;
    ctx.shadowBlur = 30 * brasa;
    ctx.fillStyle = cor.vivo;
    ctx.beginPath();
    ctx.arc(756, 480, 8.5 + suave * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // O negativo acaba na mandíbula: um gradiente só, aplicado depois de tudo,
    // para o contorno dissolver junto com o preenchimento. Borda dura sobre
    // recheio translúcido lê como adesivo, não como exposição fotográfica.
    ctx.globalAlpha = 1;
    const desvanecer = ctx.createLinearGradient(0, 0, 0, 1200);
    desvanecer.addColorStop(0, 'rgba(255,255,255,1)');
    desvanecer.addColorStop(0.56, 'rgba(255,255,255,1)');
    desvanecer.addColorStop(0.66, 'rgba(255,255,255,0.60)');
    desvanecer.addColorStop(0.78, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = desvanecer;
    ctx.fillRect(-200, 0, 1400, 1200);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    // avança os sinais
    const alvo = modo === 'idle' ? 3 : modo === 'thinking' ? 11 : 6 + suave * 7;
    if (detalhado && pulsos.length < alvo && rnd() < 0.16) novoPulso();
    for (let i = pulsos.length - 1; i >= 0; i--) {
      const p = pulsos[i];
      p.d += p.vel * 0.016 * (modo === 'thinking' ? 1.7 : 1);
      const total = p.tipo === 'c' ? (circuito[p.i]?.comprimento ?? 0) : p.ax.comprimento;
      if (p.d > total + 60) pulsos.splice(i, 1);
    }

    raf = requestAnimationFrame(desenhar);
  }

  raf = requestAnimationFrame(desenhar);

  return {
    setMode(m) { modo = m in PALETA ? m : 'idle'; },
    setLevel(v) { nivel = Math.max(0, Math.min(1, v || 0)); },
    frame() { desenhar(); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

function tinta(hex, alfa) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
