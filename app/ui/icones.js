// Ícones de plataforma — desenhados aqui, em SVG, sem baixar nada de fora.
//
// O ponto é reconhecimento instantâneo na grade da Rotina: bater o olho numa
// célula e saber que aquilo é post de Instagram sem ler a linha. Por isso são
// silhuetas simples e não logos fiéis: numa caixa de 34px o que sobrevive é a
// forma, e forma é o que a memória guarda.

const NS = 'http://www.w3.org/2000/svg';

/**
 * Cada plataforma traz a cor da marca. Não é enfeite: numa grade de sete
 * colunas a cor é lida antes do desenho, e é ela que separa um dia de
 * Instagram de um dia de YouTube num relance.
 */
export const PLATAFORMAS = {
  instagram: { rotulo: 'Instagram', cor: '#e1306c' },
  stories: { rotulo: 'Stories', cor: '#c13584' },
  reels: { rotulo: 'Reels', cor: '#f56040' },
  youtube: { rotulo: 'YouTube', cor: '#ff0033' },
  shorts: { rotulo: 'YouTube Shorts', cor: '#ff4e45' },
  metaads: { rotulo: 'Meta Ads', cor: '#0866ff' },
  facebook: { rotulo: 'Facebook', cor: '#1877f2' },
  tiktok: { rotulo: 'TikTok', cor: '#25f4ee' },
  linkedin: { rotulo: 'LinkedIn', cor: '#0a66c2' },
  whatsapp: { rotulo: 'WhatsApp', cor: '#25d366' },
  trello: { rotulo: 'Trello', cor: '#579dff' },
  email: { rotulo: 'E-mail', cor: '#9db4bd' },
  site: { rotulo: 'Site / blog', cor: '#5eb3c4' },
  reuniao: { rotulo: 'Reunião', cor: '#8fd3e0' },
};

/* ---------- desenho ---------- */

const cria = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * Cada função recebe o <svg> e desenha dentro de uma caixa 0..24.
 * Traço de 1.8 e `currentColor` para o ícone herdar a cor de quem o coloca.
 */
const DESENHO = {
  instagram(g) {
    g.append(cria('rect', { x: 3, y: 3, width: 18, height: 18, rx: 5.4 }));
    g.append(cria('circle', { cx: 12, cy: 12, r: 4.2 }));
    g.append(cria('circle', { cx: 17.2, cy: 6.8, r: 1.05, fill: 'currentColor', stroke: 'none' }));
  },
  // Stories é o anel segmentado que o Instagram usa para marcar "não visto".
  stories(g) {
    g.append(cria('circle', { cx: 12, cy: 12, r: 8.6, 'stroke-dasharray': '7 3.4', 'stroke-linecap': 'round' }));
    g.append(cria('circle', { cx: 12, cy: 12, r: 3.6 }));
  },
  // Reels: a moldura de filme, com a diagonal que a marca usa.
  reels(g) {
    g.append(cria('rect', { x: 3, y: 3, width: 18, height: 18, rx: 5.4 }));
    g.append(cria('path', { d: 'M3.6 8.6h16.8M9.4 3.3l3.4 5.3M15.2 3.3l3.4 5.3' }));
    g.append(cria('path', { d: 'M10.4 12.4l4.6 2.6-4.6 2.6z', fill: 'currentColor', stroke: 'none' }));
  },
  youtube(g) {
    g.append(cria('rect', { x: 2.2, y: 5.4, width: 19.6, height: 13.2, rx: 4.2 }));
    g.append(cria('path', { d: 'M10.2 9.3l5.4 2.7-5.4 2.7z', fill: 'currentColor', stroke: 'none' }));
  },
  // Shorts: o retângulo alto do vertical, com o play dentro.
  shorts(g) {
    g.append(cria('rect', { x: 6.6, y: 2.4, width: 10.8, height: 19.2, rx: 4.4 }));
    g.append(cria('path', { d: 'M10.6 8.6l4.4 3.4-4.4 3.4z', fill: 'currentColor', stroke: 'none' }));
  },
  // Meta: o laço duplo, reduzido ao essencial.
  metaads(g) {
    g.append(cria('path', {
      d: 'M3.2 15.4c0-4.6 2.2-8 5-8 1.9 0 3 1.4 3.8 3.1.8-1.7 1.9-3.1 3.8-3.1 2.8 0 5 3.4 5 8 0 2-1 3.2-2.5 3.2-2.8 0-3.9-4.2-6.3-8.1',
      'stroke-linecap': 'round',
    }));
  },
  facebook(g) {
    g.append(cria('circle', { cx: 12, cy: 12, r: 9 }));
    g.append(cria('path', { d: 'M14.4 8.2h-1.5c-1 0-1.5.5-1.5 1.5v1.6h2.9l-.5 3h-2.4v6.4', 'stroke-linecap': 'round' }));
  },
  tiktok(g) {
    g.append(cria('path', {
      d: 'M14.4 3.2v10.9a3.9 3.9 0 1 1-3.9-3.9c.35 0 .7.05 1 .14',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
    g.append(cria('path', { d: 'M14.4 3.2c.4 2.6 2.2 4.3 4.8 4.5', 'stroke-linecap': 'round' }));
  },
  linkedin(g) {
    g.append(cria('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3.2 }));
    g.append(cria('path', { d: 'M7.5 10.6v6.2M7.5 7.5v.1M11.6 16.8v-6.2M11.6 13.2c0-1.5.9-2.6 2.4-2.6s2.4 1 2.4 2.6v3.6', 'stroke-linecap': 'round' }));
  },
  whatsapp(g) {
    g.append(cria('path', { d: 'M3.6 20.4l1.3-4.2A8.3 8.3 0 1 1 8.2 19.3z', 'stroke-linejoin': 'round' }));
    g.append(cria('path', { d: 'M9.2 9c.5 1.6 2.1 3.6 3.9 4.4l1.1-1.2 1.9.9', 'stroke-linecap': 'round' }));
  },
  trello(g) {
    g.append(cria('rect', { x: 3, y: 3, width: 18, height: 18, rx: 3.2 }));
    g.append(cria('rect', { x: 6.6, y: 6.6, width: 4.2, height: 10, rx: 1.1, fill: 'currentColor', stroke: 'none' }));
    g.append(cria('rect', { x: 13.2, y: 6.6, width: 4.2, height: 6, rx: 1.1, fill: 'currentColor', stroke: 'none' }));
  },
  email(g) {
    g.append(cria('rect', { x: 2.6, y: 5, width: 18.8, height: 14, rx: 2.6 }));
    g.append(cria('path', { d: 'M3.4 7l8.6 6 8.6-6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  },
  site(g) {
    g.append(cria('circle', { cx: 12, cy: 12, r: 9 }));
    g.append(cria('path', { d: 'M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18' }));
  },
  reuniao(g) {
    g.append(cria('circle', { cx: 9, cy: 9.4, r: 3.1 }));
    g.append(cria('path', { d: 'M3.4 19.2c0-3.1 2.5-5 5.6-5s5.6 1.9 5.6 5', 'stroke-linecap': 'round' }));
    g.append(cria('path', { d: 'M16.2 7.6a2.9 2.9 0 0 1 0 5.6M17.4 14.9c2 .5 3.2 2.1 3.2 4.3', 'stroke-linecap': 'round' }));
  },
};

/** Devolve o SVG da plataforma, ou null quando não há ícone para ela. */
export function iconePlataforma(nome, { tamanho = 16, cor = null } = {}) {
  const desenho = DESENHO[nome];
  if (!desenho) return null;

  const svg = cria('svg', {
    viewBox: '0 0 24 24', width: tamanho, height: tamanho,
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8,
    class: 'ico-plat', 'aria-hidden': 'true',
  });
  if (cor !== false) svg.style.color = cor ?? PLATAFORMAS[nome]?.cor ?? 'currentColor';
  desenho(svg);
  // O <title> vira a dica ao passar o mouse e o nome lido por leitor de tela.
  // (append() devolve undefined, então o texto entra antes de anexar.)
  const rotulo = PLATAFORMAS[nome]?.rotulo;
  if (rotulo) {
    const t = cria('title', {});
    t.textContent = rotulo;
    svg.append(t);
  }
  return svg;
}

/* ---------- reconhecimento ---------- */

// A ordem importa: "reels" e "stories" têm que ganhar de "instagram", e
// "shorts" de "youtube", senão um post de Reels vira ícone de feed.
const PISTAS = [
  ['reels', /\breels?\b/i],
  ['stories', /\bstor(y|ies|ies?)\b|\bstories\b/i],
  ['shorts', /\bshorts?\b/i],
  ['metaads', /\bmeta\s*ads?\b|\bads?\s*manager\b|\bgerenciador de an[úu]ncios\b|\bimpulsion/i],
  ['instagram', /\binsta(gram)?\b|\big\b/i],
  ['youtube', /\byou\s*tube\b|\byt\b/i],
  ['tiktok', /\btik\s*tok\b/i],
  ['linkedin', /\blinked\s*in\b/i],
  ['whatsapp', /\bwhats\s*app\b|\bzap\b/i],
  ['facebook', /\bface(book)?\b|\bfb\b/i],
  ['trello', /\btrello\b/i],
  ['email', /\be-?mails?\b|\bcaixa de entrada\b|\bnewsletter\b/i],
  ['reuniao', /\breuni[ãa]o\b|\bcall\b|\bmeet\b|\balinhamento\b/i],
  ['site', /\bsite\b|\bblog\b|\bportal\b|\bwordpress\b/i],
];

/**
 * Adivinha a plataforma pelo texto da tarefa. Serve de sugestão na hora de
 * criar — o campo continua editável, porque adivinhação erra e quem manda no
 * ícone é quem escreveu a tarefa.
 */
export function detectarPlataforma(...textos) {
  const alvo = textos.filter(Boolean).join(' ');
  for (const [nome, teste] of PISTAS) if (teste.test(alvo)) return nome;
  return null;
}

/** Opções para o seletor do formulário. */
export const OPCOES_PLATAFORMA = [
  ['', 'nenhuma'],
  ...Object.entries(PLATAFORMAS).map(([k, v]) => [k, v.rotulo]),
];
