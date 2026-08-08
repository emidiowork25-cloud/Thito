// Gerador de QR Code — modo byte, versões 1 a 10, correção de erro L.
//
// Escrito à mão para manter o projeto sem dependências. Cobre com folga uma URL
// de até ~100 caracteres, que é o nosso caso (o link do exibidor).
//
// Uso:  const m = encode('https://…');  // matriz booleana [linha][coluna]
//       toSvg(m)  /  toCanvas(m, canvas)

/* ============================ GF(256) ============================ */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polinômio primitivo do QR
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Polinômio gerador de Reed-Solomon de grau `n`. */
function generator(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];                    // multiplica por x
      next[j + 1] ^= mul(poly[j], EXP[i]);   // multiplica por α^i
    }
    poly = next;
  }
  return poly;
}

/** Códigos de correção de erro para um bloco de dados. */
function ecc(data, ecLen) {
  const gen = generator(ecLen);
  const buf = new Uint8Array(data.length + ecLen);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = buf[i];
    if (!factor) continue;
    for (let j = 0; j < gen.length; j++) buf[i + j] ^= mul(gen[j], factor);
  }
  return buf.slice(data.length);
}

/* ============================ tabelas ============================ */

// Total de codewords por versão (1..10).
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

// Nível L: [codewords de EC por bloco, blocos g1, dados g1, blocos g2, dados g2]
const BLOCKS_L = [
  null,
  [7, 1, 19, 0, 0],
  [10, 1, 34, 0, 0],
  [15, 1, 55, 0, 0],
  [20, 1, 80, 0, 0],
  [26, 1, 108, 0, 0],
  [18, 2, 68, 0, 0],
  [20, 2, 78, 0, 0],
  [24, 2, 97, 0, 0],
  [30, 2, 116, 0, 0],
  [18, 2, 68, 2, 69],
];

const MAX_VERSION = 10;

/* ============================ codificação ============================ */

class Bits {
  constructor() { this.arr = []; }
  push(value, len) {
    for (let i = len - 1; i >= 0; i--) this.arr.push((value >>> i) & 1);
  }
  get length() { return this.arr.length; }
}

/** Menor versão que comporta os bytes informados. */
function pickVersion(byteLen) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const [ecLen, b1, d1, b2, d2] = BLOCKS_L[v];
    const dataCodewords = b1 * d1 + b2 * d2;
    // 4 bits de modo + 8 bits de contagem (versões 1..9) ou 16 (versão 10+)
    const overhead = 4 + (v < 10 ? 8 : 16);
    if (byteLen * 8 + overhead <= dataCodewords * 8) return v;
  }
  return null;
}

function buildCodewords(bytes, version) {
  const [ecLen, b1, d1, b2, d2] = BLOCKS_L[version];
  const dataCodewords = b1 * d1 + b2 * d2;

  const bits = new Bits();
  bits.push(0b0100, 4);                       // modo byte
  bits.push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) bits.push(b, 8);

  // terminador + alinhamento em byte
  const capacity = dataCodewords * 8;
  bits.push(0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0, 1);

  // preenchimento padrão do formato
  const padding = [0xec, 0x11];
  for (let i = 0; bits.length < capacity; i++) bits.push(padding[i % 2], 8);

  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits.arr[i * 8 + j];
    data[i] = byte;
  }

  // divide em blocos e calcula a correção de cada um
  const blocos = [];
  let cursor = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const tamanho = i < b1 ? d1 : d2;
    const bloco = data.slice(cursor, cursor + tamanho);
    cursor += tamanho;
    blocos.push({ data: bloco, ecc: ecc(bloco, ecLen) });
  }

  // intercala: primeiro os dados, depois os códigos de correção
  const out = [];
  const maiorBloco = Math.max(d1, d2);
  for (let i = 0; i < maiorBloco; i++) {
    for (const b of blocos) if (i < b.data.length) out.push(b.data[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of blocos) out.push(b.ecc[i]);
  }
  return Uint8Array.from(out);
}

/* ============================ matriz ============================ */

function alignmentPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const quantos = Math.floor(version / 7) + 2;
  const passo = Math.ceil((version * 4 + 4) / (quantos * 2 - 2)) * 2;
  const pos = [6];
  for (let p = size - 7; pos.length < quantos; p -= passo) pos.splice(1, 0, p);
  return pos;
}

function buildMatrix(version, codewords) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const set = (row, col, dark) => {
    if (row < 0 || col < 0 || row >= size || col >= size) return;
    modules[row][col] = dark;
    reserved[row][col] = true;
  };

  // localizadores + separadores
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        set(r0 + dr, c0 + dc, dist !== 2 && dist <= 3);
      }
    }
  }

  // padrões de tempo
  for (let i = 0; i < size; i++) {
    if (!reserved[6][i]) set(6, i, i % 2 === 0);
    if (!reserved[i][6]) set(i, 6, i % 2 === 0);
  }

  // padrões de alinhamento
  const pos = alignmentPositions(version);
  for (const r of pos) {
    for (const c of pos) {
      // pulam os cantos ocupados pelos localizadores
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // reserva as áreas de formato e versão
  for (let i = 0; i < 9; i++) { reserved[8][i] = true; reserved[i][8] = true; }
  for (let i = 0; i < 8; i++) { reserved[8][size - 1 - i] = true; reserved[size - 1 - i][8] = true; }
  set(size - 8, 8, true); // módulo sempre escuro
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      reserved[b][a] = true;
      reserved[a][b] = true;
    }
  }

  // dados em ziguezague, de baixo para cima, da direita para a esquerda
  let bit = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // pula a coluna do padrão de tempo
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const subindo = ((right + 1) & 2) === 0;
        const row = subindo ? size - 1 - vert : vert;
        if (reserved[row][col] || bit >= totalBits) continue;
        modules[row][col] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
        bit++;
      }
    }
  }

  return { modules, reserved, size };
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(modules, reserved, size, mask) {
  const fn = MASKS[mask];
  const out = modules.map((linha) => linha.slice());
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && fn(r, c)) out[r][c] = !out[r][c];
    }
  }
  return out;
}

function drawFormat(modules, size, mask) {
  const dados = (0b01 << 3) | mask; // 01 = nível L
  let rem = dados;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((dados << 10) | rem) ^ 0x5412;
  const get = (i) => ((bits >>> i) & 1) === 1;

  for (let i = 0; i <= 5; i++) modules[i][8] = get(i);
  modules[7][8] = get(6);
  modules[8][8] = get(7);
  modules[8][7] = get(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = get(i);

  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = get(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = get(i);
  modules[size - 8][8] = true;
}

function drawVersion(modules, size, version) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >>> i) & 1) === 1;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    modules[b][a] = bit;
    modules[a][b] = bit;
  }
}

/** Pontuação de penalidade — quanto menor, melhor o leitor enxerga. */
function penalty(m, size) {
  let score = 0;

  // regra 1: sequências de 5+ módulos iguais
  for (let i = 0; i < size; i++) {
    for (const linha of [m[i], m.map((l) => l[i])]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (linha[j] === linha[j - 1]) { run++; } else { if (run >= 5) score += run - 2; run = 1; }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // regra 2: blocos 2×2 da mesma cor
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  // regra 3: padrão parecido com o localizador
  const alvo = [true, false, true, true, true, false, true, false, false, false, false];
  const alvoRev = [...alvo].reverse();
  const combina = (linha, i, padrao) => padrao.every((v, k) => linha[i + k] === v);
  for (let i = 0; i < size; i++) {
    const linhas = [m[i], m.map((l) => l[i])];
    for (const linha of linhas) {
      for (let j = 0; j + 11 <= size; j++) {
        if (combina(linha, j, alvo) || combina(linha, j, alvoRev)) score += 40;
      }
    }
  }

  // regra 4: desequilíbrio entre claros e escuros
  let escuros = 0;
  for (const linha of m) for (const v of linha) if (v) escuros++;
  const pct = (escuros * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;

  return score;
}

/* ============================ API ============================ */

/**
 * Codifica um texto e devolve a matriz booleana do QR.
 * @returns {boolean[][]} matriz[linha][coluna] — true = módulo escuro
 * @throws se o texto for grande demais para a versão 10
 */
export function encode(text) {
  const bytes = new TextEncoder().encode(String(text));
  const version = pickVersion(bytes.length);
  if (!version) throw new Error('Texto longo demais para o QR (limite ~230 caracteres).');

  const codewords = buildCodewords(bytes, version);
  const { modules, reserved, size } = buildMatrix(version, codewords);

  let melhor = null;
  let melhorNota = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidato = applyMask(modules, reserved, size, mask);
    drawFormat(candidato, size, mask);
    drawVersion(candidato, size, version);
    const nota = penalty(candidato, size);
    if (nota < melhorNota) { melhorNota = nota; melhor = candidato; }
  }
  return melhor;
}

/** Desenha o QR num elemento SVG pronto para inserir na página. */
export function toSvg(matrix, { escala = 4, margem = 4, claro = '#ffffff', escuro = '#000000' } = {}) {
  const size = matrix.length;
  const total = (size + margem * 2) * escala;
  let caminho = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        caminho += `M${(c + margem) * escala} ${(r + margem) * escala}h${escala}v${escala}h-${escala}z`;
      }
    }
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${total} ${total}`);
  svg.setAttribute('width', total);
  svg.setAttribute('height', total);
  svg.setAttribute('shape-rendering', 'crispEdges');

  const fundo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fundo.setAttribute('width', total);
  fundo.setAttribute('height', total);
  fundo.setAttribute('fill', claro);
  svg.append(fundo);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', caminho);
  path.setAttribute('fill', escuro);
  svg.append(path);

  return svg;
}
