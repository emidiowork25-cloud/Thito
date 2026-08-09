// Notícias do dia — manchetes por assunto, sem custo nenhum.
//
// O caminho: função `noticias` no seu Supabase lê os feeds RSS e devolve as
// manchetes limpas. Nenhuma chamada à Anthropic, nenhum crédito consumido.
// Uma busca por dia, por aparelho — o resultado fica guardado e as aberturas
// seguintes leem do cache.
//
// O cache mora no kv, que não sincroniza. É de propósito: manchete não é dado
// seu, é a mesma coisa que qualquer um lê, e não vale ocupar a sua tabela na
// nuvem com o que expira em 24 horas.

import * as db from './db.js';
import * as settings from './settings.js';
import * as sb from './supabase.js';
import { today } from './util.js';

const CHAVE = 'noticias:dia';

/**
 * Temas padrão. Ficam em settings como texto para você trocar time, banda ou
 * assunto sem mexer no código — a sintaxe do Google Notícias vale aqui:
 * aspas prendem a expressão, OR soma, when:3d limita aos últimos dias.
 */
export const TEMAS_PADRAO = [
  'Mundo |',
  'Sport | "Sport Club do Recife"',
  'Música | "novo álbum" OR "nova música" OR turnê when:3d',
  'Seahawks | "Seattle Seahawks"',
].join('\n');

/** Converte o texto dos ajustes em temas. Linha vazia e lixo são ignorados. */
export function temas() {
  const bruto = settings.get('noticiasTemas') ?? TEMAS_PADRAO;
  return bruto.split('\n')
    .map((linha) => {
      const [label, ...resto] = linha.split('|');
      const rotulo = (label ?? '').trim();
      if (!rotulo) return null;
      return { id: rotulo.toLowerCase().replace(/\s+/g, '-'), label: rotulo, q: resto.join('|').trim() };
    })
    .filter(Boolean);
}

/** O que está guardado, se for de hoje. Fora disso, null. */
export async function cache() {
  const guardado = await db.kvGet(CHAVE, null);
  return guardado?.dia === today() ? guardado : null;
}

/**
 * Busca e guarda. Devolve o mesmo formato do cache.
 * Nunca lança: quem chama mostra o erro na tela em vez de quebrar o painel.
 */
export async function buscar() {
  try {
    if (!sb.isSignedIn()) return { erro: 'Entre na sua conta para receber as notícias.' };
    const resposta = await sb.invokeFunction('noticias', { temas: temas() });
    const pacote = { dia: today(), geradoEm: resposta.geradoEm, temas: resposta.temas ?? [] };
    await db.kvSet(CHAVE, pacote);
    return pacote;
  } catch (err) {
    return { erro: err.message };
  }
}

/**
 * Passou da hora combinada e ainda não buscou hoje? Então é hora.
 * Antes das 8 da manhã ninguém quer o resumo do dia empurrado na cara — e o
 * de ontem já não serve, então o cartão fica quieto até a hora chegar.
 */
export function estaNaHora() {
  const alvo = settings.get('noticiasHora') || '08:00';
  return new Date().toTimeString().slice(0, 5) >= alvo;
}

/** Texto das manchetes, para quando você pedir a leitura do JARBAS. */
export function comoTexto(pacote) {
  return (pacote?.temas ?? [])
    .filter((t) => t.itens?.length)
    .map((t) => `## ${t.label}\n${t.itens.map((i) => `- ${i.titulo}${i.fonte ? ` (${i.fonte})` : ''}`).join('\n')}`)
    .join('\n\n');
}
