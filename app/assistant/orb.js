// Orbe do JARBAS: anéis reativos em canvas que mostram o estado do assistente
// e a energia do microfone. Puramente visual — some sozinho se o canvas sair da tela.

const PALETTE = {
  idle: ['#bcceda', '#3c4d5e'],
  listening: ['#e2eef7', '#e2eef7'],
  thinking: ['#d3a35f', '#6b5a3a'],
  speaking: ['#9fc4dd', '#3f5c72'],
  error: ['#d3736b', '#5e332f'],
};

export function createOrb(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let raf = null;
  let mode = 'idle';
  let level = 0;      // energia alvo do microfone (0..1)
  let smooth = 0;     // energia suavizada, o que realmente desenhamos
  let t = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || 44);
    const h = Math.max(1, rect.height || 44);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  let size = resize();
  const ro = new ResizeObserver(() => { size = resize(); });
  ro.observe(canvas);

  function draw() {
    const { w, h } = size;
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) / 2 - 2;
    const [bright, dim] = PALETTE[mode] ?? PALETTE.idle;

    smooth += (level - smooth) * 0.22;
    t += 0.016;

    ctx.clearRect(0, 0, w, h);

    // halo
    const pulse = mode === 'idle' ? 0.5 + Math.sin(t * 1.4) * 0.12 : 0.75 + smooth * 0.25;
    const halo = ctx.createRadialGradient(cx, cy, base * 0.15, cx, cy, base * (0.9 + smooth * 0.35));
    halo.addColorStop(0, hex(bright, 0.35 * pulse));
    halo.addColorStop(1, hex(bright, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, base * (1 + smooth * 0.3), 0, Math.PI * 2);
    ctx.fill();

    // anéis girando em sentidos opostos
    const rings = [
      { r: base * 0.86, speed: 0.6, arc: 1.5, width: 1.4, color: bright },
      { r: base * 0.66, speed: -0.95, arc: 2.4, width: 1.1, color: dim },
      { r: base * 0.46, speed: 1.5, arc: 1.0, width: 1.1, color: bright },
    ];
    for (const ring of rings) {
      ctx.beginPath();
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.width;
      ctx.lineCap = 'round';
      const start = t * ring.speed;
      ctx.arc(cx, cy, ring.r * (1 + smooth * 0.08), start, start + ring.arc);
      ctx.stroke();
    }

    // barras de nível ao redor (só quando ouvindo)
    if (mode === 'listening' && smooth > 0.02) {
      const bars = 28;
      ctx.strokeStyle = hex(bright, 0.75);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < bars; i++) {
        const a = (i / bars) * Math.PI * 2;
        const wobble = 0.5 + 0.5 * Math.sin(t * 6 + i * 0.7);
        const len = base * 0.1 + base * 0.32 * smooth * wobble;
        const r0 = base * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
        ctx.stroke();
      }
    }

    // núcleo
    const coreR = base * (0.2 + smooth * 0.16) * (mode === 'thinking' ? 0.85 + Math.sin(t * 7) * 0.15 : 1);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.5, bright);
    core.addColorStop(1, hex(bright, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    raf = requestAnimationFrame(draw);
  }

  draw();

  return {
    setMode(next) { mode = next; },
    setLevel(value) { level = Math.min(1, Math.max(0, value)); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

/** '#rrggbb' + alpha → 'rgba(...)' */
function hex(color, alpha) {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
