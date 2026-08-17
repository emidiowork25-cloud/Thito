// Quem é você aqui dentro: super admin, convidado aprovado, ou ninguém ainda.
//
// Este arquivo é o lado de cá da Edge Function `admin`. Ele NÃO decide nada —
// pergunta e obedece. A diferença importa: se a decisão morasse aqui, bastaria
// abrir o console do navegador para virar administrador do sistema.
//
// O que ele guarda em casa é o retrato da última resposta, para a tela não
// piscar a cada navegação e para o app abrir offline com os mesmos módulos de
// ontem. Retrato não é autoridade: aprovar, bloquear e remover continuam
// acontecendo no servidor, e a porta de entrada continua sendo o Supabase, que
// recusa login de quem não teve o e-mail confirmado.

import * as db from './db.js';
import * as sb from './supabase.js';
import * as settings from './settings.js';
import { emit } from './bus.js';

const CHAVE = 'conta:retrato';

/** Módulos que todo mundo tem, sempre: a casa e a configuração dela. */
export const SEMPRE = ['dashboard', 'ajustes'];

let retrato = null;   // { conta, souSuperAdmin, respondeu, visitadoEm }
let carregando = null;

/* ---------- leitura em memória ---------- */

export const carregado = () => !!retrato;

/**
 * O dono da casa.
 *
 * Sem nuvem configurada não existe convidado nenhum: o app é de quem está no
 * aparelho, e esconder módulos dele seria inventar uma tranca sem porta.
 *
 * E há uma diferença que custa caro confundir: "o servidor disse que você não é
 * o admin" não é a mesma coisa que "o servidor não disse nada". Sem essa
 * distinção, um projeto onde a função ainda não foi publicada escondia o ADMIN
 * do próprio dono — e o ADMIN é justamente a tela que explicaria o que falta.
 * Rede caindo teria o mesmo efeito.
 *
 * Então, sem resposta, o app trata quem está no aparelho como dono. Isso não
 * abre porta nenhuma: TODA ação do ADMIN vai ao servidor, e lá quem não for o
 * super admin leva um NAO_E_ADMIN. O que se ganha aqui é uma tela visível; o
 * que se perderia é a única explicação disponível.
 */
export function souSuperAdmin() {
  if (!settings.isCloudConfigured() || !sb.isSignedIn()) return true;
  if (!retrato?.respondeu) return true;
  return !!retrato.souSuperAdmin;
}

/** O estado da conta: 'pendente', 'aprovado', 'bloqueado' — ou null. */
export const estado = () => retrato?.conta?.estado ?? null;

export const minhaConta = () => retrato?.conta ?? null;

/**
 * Os módulos que esta pessoa vê.
 *
 * `null` significa "todos" — é o caso do dono e o caso de quem ainda não tem
 * conta de convidado. Devolver a lista vazia por engano esvaziaria o menu de
 * quem tem direito a tudo, então a ausência de resposta nunca vira restrição.
 */
export function modulosPermitidos() {
  if (souSuperAdmin()) return null;
  const lista = retrato?.conta?.modulos;
  if (!Array.isArray(lista)) return null;
  return [...new Set([...SEMPRE, ...lista])];
}

export const podeVer = (view) => {
  const permitidos = modulosPermitidos();
  return !permitidos || permitidos.includes(view);
};

/* ---------- conversa com o servidor ---------- */

const chamar = (acao, dados = {}) => sb.invokeFunction('admin', { acao, ...dados });
const chamarAberto = (acao, dados = {}) => sb.invokeFunctionSemSessao('admin', { acao, ...dados });

/**
 * Busca o retrato. Nunca lança: um erro aqui não pode impedir o app de abrir.
 *
 * Falhar em silêncio é aceitável porque falhar para o lado seguro seria pior —
 * um convidado com a rede ruim ficaria sem módulo nenhum, e o dono da casa
 * ficaria trancado fora do próprio hub por causa de um timeout.
 */
export async function carregar({ forcar = false } = {}) {
  if (!settings.isCloudConfigured() || !sb.isSignedIn()) return null;
  if (retrato && !forcar) return retrato;
  carregando ??= (async () => {
    try {
      const r = await chamar('minha-conta');
      retrato = { ...r, respondeu: true, visitadoEm: new Date().toISOString() };
      await db.kvSet(CHAVE, retrato);
    } catch {
      // sem resposta: vale o retrato guardado, se houver
      retrato ??= await db.kvGet(CHAVE, null);
    } finally {
      carregando = null;
    }
    emit('conta:mudou', retrato);
    return retrato;
  })();
  return carregando;
}

/**
 * Lê o retrato do disco antes de qualquer rede — é o que faz o app abrir
 * offline — e MANDA reperguntar, sem aceitar não como resposta.
 *
 * O `forcar` não é zelo: sem ele, esta função se anulava. Ela preenche
 * `retrato` na linha de cima, e `carregar()` começa justamente com
 * `if (retrato && !forcar) return retrato`. O pedido saía e voltava sem tocar
 * na rede, então o app perguntava ao servidor UMA vez na vida — na primeira
 * abertura, quando o disco ainda estava vazio — e guardava aquela resposta para
 * sempre.
 *
 * Isso transformou um erro de servidor, já corrigido, num erro permanente: o
 * dono da casa tinha "você não é o admin" gravado no navegador e nada podia
 * desmentir. Reinstalar o app seria a única saída, e ninguém adivinha isso.
 *
 * O retrato do disco continua valendo enquanto a resposta não chega, e volta a
 * valer se ela não chegar (ver o catch do carregar). O que muda é que ele deixa
 * de ser a palavra final.
 */
export async function iniciar() {
  retrato = await db.kvGet(CHAVE, null);
  carregar({ forcar: true }).catch(() => {});
  return retrato;
}

export async function esquecer() {
  retrato = null;
  await db.kvDel(CHAVE);
  emit('conta:mudou', null);
}

/* ---------- cadastro pelo convite (ainda sem sessão) ---------- */

export const verConvite = (codigo) => chamarAberto('ver-convite', { codigo });

export const criarConta = ({ codigo, nome, email, senha }) =>
  chamarAberto('criar-conta', { codigo, nome, email, senha });

/* ---------- ações do super admin ---------- */

export const listar = () => chamar('listar');
export const criarConvite = (dados) => chamar('criar-convite', dados);
export const aprovar = (user_id, modulos) => chamar('aprovar', { user_id, modulos });
export const reenviar = (email) => chamar('reenviar', { email });
export const bloquear = (user_id) => chamar('bloquear', { user_id });
export const desbloquear = (user_id) => chamar('desbloquear', { user_id });
export const trocarModulos = (user_id, modulos) => chamar('modulos', { user_id, modulos });
export const remover = (user_id) => chamar('remover', { user_id });

/**
 * A função ainda não foi publicada?
 *
 * Pelo código HTTP, e não pelo texto: o Supabase responde 404 com uma mensagem
 * em inglês, e um detector escrito em português erraria em silêncio — que é
 * exatamente o modo de falhar que faz alguém achar que o produto está quebrado
 * quando falta cinco minutos de instalação.
 */
export const funcaoAusente = (err) => err?.status === 404;

/** O fetch nem chegou a ter resposta. "Load failed" é como o Safari diz isso. */
const falhaDeRede = (err) => /Failed to fetch|NetworkError|Load failed/i.test(String(err?.message || err));

/**
 * Por que a chamada falhou, perguntando ao próprio navegador de quem está lá.
 *
 * Devolve 'sem-funcao', 'sem-rede' ou 'outra'. A pergunta existe porque função
 * ausente e internet caída chegam com a mesma cara — ver projetoAlcancavel.
 */
export async function diagnosticar(err) {
  if (funcaoAusente(err)) return 'sem-funcao';
  if (!falhaDeRede(err)) return 'outra';
  return (await sb.projetoAlcancavel()) ? 'sem-funcao' : 'sem-rede';
}

/** Traduz as falhas da função para o que a pessoa precisa entender. */
export function explicar(err) {
  if (funcaoAusente(err)) {
    return 'A função "admin" ainda não foi publicada no seu projeto Supabase — sem ela não há como convidar nem aprovar ninguém.';
  }
  const msg = String(err?.message || err);
  if (/CONVITE_INVALIDO/.test(msg)) return 'Este convite não existe. Confira o link com quem te chamou.';
  if (/CONVITE_EXPIRADO/.test(msg)) return 'Este convite venceu. Peça um link novo.';
  if (/CONVITE_USADO/.test(msg)) return 'Este convite já foi usado.';
  if (/NAO_E_ADMIN/.test(msg)) return 'Só o super admin pode fazer isso.';
  if (/SEM_SESSAO/.test(msg)) return 'Entre na sua conta primeiro.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem conexão com a nuvem agora.';
  if (/already registered|already been registered/i.test(msg)) return 'Já existe uma conta com este e-mail.';
  return msg;
}
