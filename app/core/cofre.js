// Cofre — a camada de criptografia do módulo "Senhas e acessos".
//
// Regra única deste arquivo, e ela não tem exceção: nada sai daqui em texto
// claro. O que o IndexedDB grava e o que a sincronização manda para o Supabase
// é sempre ciphertext. Quem abrir o banco do navegador, o backup em JSON ou a
// tabela `records` no Supabase vê bytes embaralhados e mais nada.
//
// A senha-mestra não é gravada em lugar nenhum — nem em disco, nem na nuvem,
// nem no localStorage, nem em cookie. Ela é derivada em chave, a chave vive
// numa variável deste módulo, e some quando o cofre tranca. O preço disso é
// direto e você precisa saber dele: esquecer a senha-mestra é perder o cofre.
// Não existe "recuperar senha" — se existisse, existiria também para quem
// roubasse o seu banco de dados.

import * as store from './store.js';
import * as settings from './settings.js';
import { emit } from './bus.js';

/** PBKDF2-SHA256. 600 mil iterações é a recomendação atual da OWASP. */
const ITERACOES = 600_000;

/** Guardado no registro-cabeçalho para saber quando a senha está errada. */
const CANARIO = 'jarbas-cofre-v1';

/** Id fixo do registro que guarda sal, iterações e o canário. */
export const HEADER_ID = '__header__';

/* ---------- estado em memória (nunca persistido) ---------- */

let chave = null;        // CryptoKey não-exportável, ou null quando trancado
let ultimoUso = 0;
let vigia = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- base64 ---------- */

const paraB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const deB64 = (b64) => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
};

/* ---------- disponibilidade ---------- */

/**
 * WebCrypto só existe em contexto seguro. Em http:// simples (que não seja
 * localhost) `crypto.subtle` é undefined — e aí o cofre não abre, em vez de
 * abrir fingindo que protege alguma coisa.
 */
export const disponivel = () => typeof crypto !== 'undefined' && !!crypto.subtle;

export const header = () => store.get('cofre', HEADER_ID);

export const configurado = () => !!header();

export const destrancado = () => !!chave;

/* ---------- derivação ---------- */

async function derivar(senha, salt, iteracoes) {
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iteracoes, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // não-exportável: nem o próprio código consegue ler os bytes da chave
    ['encrypt', 'decrypt'],
  );
}

async function cifrarCom(k, valor) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(valor)));
  return { iv: paraB64(iv), ct: paraB64(ct) };
}

async function decifrarCom(k, pacote) {
  const claro = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: deB64(pacote.iv) }, k, deB64(pacote.ct),
  );
  return JSON.parse(dec.decode(claro));
}

/* ---------- ciclo de vida ---------- */

/** Cria o cofre pela primeira vez. Falha se já existir — trocar senha é outra operação. */
export async function criar(senha) {
  if (!disponivel()) throw new Error('Este navegador não oferece criptografia nesta conexão.');
  if (configurado()) throw new Error('O cofre já foi criado neste conjunto de dados.');

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derivar(senha, salt, ITERACOES);
  const verificador = await cifrarCom(k, CANARIO);

  await store.save('cofre', {
    id: HEADER_ID,
    tipo: 'header',
    salt: paraB64(salt),
    iters: ITERACOES,
    verificador,
  });

  chave = k;
  tocar();
  vigiar();
  emit('cofre:estado', { destrancado: true });
}

/**
 * Abre o cofre. Devolve true se a senha estava certa.
 *
 * A senha errada é detectada pelo canário: se o AES-GCM não valida a etiqueta
 * de autenticação, ele lança — e é assim que se distingue "senha errada" de
 * "dado corrompido" sem guardar nenhum hash da senha em lugar nenhum.
 */
export async function destrancar(senha) {
  if (!disponivel()) throw new Error('Este navegador não oferece criptografia nesta conexão.');
  const h = header();
  if (!h) throw new Error('Nenhum cofre criado ainda.');

  const k = await derivar(senha, deB64(h.salt), h.iters || ITERACOES);
  try {
    const canario = await decifrarCom(k, h.verificador);
    if (canario !== CANARIO) return false;
  } catch {
    return false;
  }

  chave = k;
  tocar();
  vigiar();
  emit('cofre:estado', { destrancado: true });
  return true;
}

export function trancar({ silencioso = false } = {}) {
  const estava = !!chave;
  chave = null;
  clearInterval(vigia);
  vigia = null;
  if (estava && !silencioso) emit('cofre:estado', { destrancado: false });
  return estava;
}

/** Marca atividade — adia o bloqueio automático. */
export function tocar() {
  ultimoUso = Date.now();
}

const minutosLimite = () => Number(settings.get('cofreMinutos') ?? 5) || 5;

/**
 * Bloqueio automático por inatividade. Roda enquanto o cofre está aberto e se
 * desliga sozinho ao trancar, para não deixar um intervalo vivo à toa.
 */
function vigiar() {
  clearInterval(vigia);
  vigia = setInterval(() => {
    if (!chave) return;
    if (Date.now() - ultimoUso > minutosLimite() * 60_000) {
      trancar();
      emit('cofre:autolock');
    }
  }, 10_000);
}

// Sair da aba conta como parar de usar. Voltar depois do limite encontra
// o cofre fechado, e não a tela cheia de senha esperando alguém passar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') return;
  if (chave && Date.now() - ultimoUso > minutosLimite() * 60_000) {
    trancar();
    emit('cofre:autolock');
  }
});

/* ---------- leitura e escrita dos cofres ---------- */

const exigirChave = () => {
  if (!chave) throw new Error('Cofre trancado.');
  return chave;
};

/** Registros de cofre gravados (ainda cifrados) — não inclui o cabeçalho. */
export const registros = () => store.list('cofre', (r) => r.id !== HEADER_ID);

/**
 * Abre todos os cofres em memória. Um cofre que não decifra não derruba os
 * outros: ele volta na lista marcado com `erro`, para aparecer na tela como
 * problema em vez de sumir em silêncio.
 */
export async function abrirTudo() {
  const k = exigirChave();
  const out = [];
  for (const r of registros()) {
    try {
      const dados = await decifrarCom(k, r);
      out.push({ id: r.id, ...dados, updatedAt: r.updatedAt });
    } catch {
      out.push({ id: r.id, nome: '(registro ilegível)', nodes: [], erro: true, updatedAt: r.updatedAt });
    }
  }
  return out;
}

/** Grava um cofre inteiro cifrado. `dados` = { nome, nodes }. */
export async function gravar(id, dados) {
  const k = exigirChave();
  tocar();
  const pacote = await cifrarCom(k, dados);
  return store.save('cofre', { id, tipo: 'cofre', ...pacote });
}

export async function apagar(id) {
  exigirChave();
  tocar();
  return store.remove('cofre', id);
}

/**
 * Troca a senha-mestra: deriva a chave nova, recifra todo mundo e só então
 * grava o cabeçalho novo. Se algo falhar no meio, o cabeçalho antigo continua
 * valendo — melhor abortar do que ficar com metade dos cofres em cada chave.
 */
export async function trocarSenha(atual, nova) {
  const h = header();
  if (!h) throw new Error('Nenhum cofre criado ainda.');

  const antiga = await derivar(atual, deB64(h.salt), h.iters || ITERACOES);
  try {
    if (await decifrarCom(antiga, h.verificador) !== CANARIO) return false;
  } catch {
    return false;
  }

  const abertos = [];
  for (const r of registros()) abertos.push({ id: r.id, dados: await decifrarCom(antiga, r) });

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const k = await derivar(nova, salt, ITERACOES);
  const recifrados = [];
  for (const a of abertos) recifrados.push({ id: a.id, ...(await cifrarCom(k, a.dados)) });

  for (const r of recifrados) await store.save('cofre', { id: r.id, tipo: 'cofre', iv: r.iv, ct: r.ct });
  await store.save('cofre', {
    id: HEADER_ID,
    tipo: 'header',
    salt: paraB64(salt),
    iters: ITERACOES,
    verificador: await cifrarCom(k, CANARIO),
  });

  chave = k;
  tocar();
  vigiar();
  return true;
}

/* ---------- utilidades de senha ---------- */

const ALFA = 'abcdefghijkmnopqrstuvwxyz';
const MAI = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const NUM = '23456789';
const SIM = '!@#$%&*?-_=+.';

/**
 * Gerador. Usa crypto.getRandomValues — Math.random é previsível e não tem
 * nenhum lugar perto de uma senha.
 */
export function gerarSenha({ tamanho = 20, simbolos = true, numeros = true, maiusculas = true } = {}) {
  let pool = ALFA;
  if (maiusculas) pool += MAI;
  if (numeros) pool += NUM;
  if (simbolos) pool += SIM;
  const bytes = crypto.getRandomValues(new Uint32Array(tamanho));
  let out = '';
  for (let i = 0; i < tamanho; i += 1) out += pool[bytes[i] % pool.length];
  return out;
}

/**
 * Força estimada em bits de entropia, pelo tamanho do alfabeto usado.
 * É uma estimativa de senha aleatória: uma frase que você inventou vale menos
 * do que a conta diz, porque o alfabeto real dela é o dicionário.
 */
export function forca(senha) {
  if (!senha) return { bits: 0, nivel: 'vazia', rotulo: 'sem senha' };
  let alfabeto = 0;
  if (/[a-z]/.test(senha)) alfabeto += 26;
  if (/[A-Z]/.test(senha)) alfabeto += 26;
  if (/[0-9]/.test(senha)) alfabeto += 10;
  if (/[^a-zA-Z0-9]/.test(senha)) alfabeto += 32;
  const bits = Math.round(senha.length * Math.log2(alfabeto || 1));
  const nivel = bits < 45 ? 'bad' : bits < 70 ? 'warn' : 'ok';
  const rotulo = bits < 45 ? 'fraca' : bits < 70 ? 'razoável' : bits < 100 ? 'forte' : 'excelente';
  return { bits, nivel, rotulo };
}

/**
 * Copia para a área de transferência e limpa depois de um tempo. A limpeza é
 * melhor-esforço: se você copiar outra coisa antes, a gente não sobrescreve —
 * apagar o que você acabou de copiar seria pior que o problema.
 */
export async function copiarTemporario(texto, segundos = 30) {
  await navigator.clipboard.writeText(texto);
  setTimeout(async () => {
    try {
      if (await navigator.clipboard.readText() === texto) await navigator.clipboard.writeText('');
    } catch {
      // sem permissão de leitura: a área de transferência fica como está
    }
  }, segundos * 1000);
}
