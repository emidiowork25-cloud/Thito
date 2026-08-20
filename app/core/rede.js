// A rede — o lado de cá da Edge Function `rede`.
//
// Este arquivo NÃO decide nada. Pergunta e obedece, do mesmo jeito que
// contas.js: se a decisão morasse aqui, bastaria abrir o console do navegador
// para virar amigo de quem não te chamou.
//
// As três regras que a função faz valer, repetidas aqui para quem lê só este
// arquivo saber com o que está lidando:
//
//   · não existe lista de usuários. Para chamar alguém, é preciso o e-mail
//     de cadastro dessa pessoa;
//   · convidar nunca revela se a conta existe — a resposta é sempre a mesma;
//   · só se compartilha com amigo aceito, e o que vai é uma CÓPIA.

import * as sb from './supabase.js';
import * as settings from './settings.js';
import { emit } from './bus.js';

const chamar = (acao, dados = {}) => sb.invokeFunction('rede', { acao, ...dados });

export const disponivel = () => settings.isCloudConfigured() && sb.isSignedIn();

/* ---------- leitura ---------- */

export const minhaRede = () => chamar('minha-rede');
export const caixa = () => chamar('caixa');

/* ---------- amizade ---------- */

export const convidar = (email, recado = '') => chamar('convidar', { email, recado });
export const responder = (id, aceitar) => chamar('responder', { id, aceitar });
export const cancelar = (id) => chamar('cancelar', { id });
export const desfazer = (user_id) => chamar('desfazer', { user_id });

/* ---------- compartilhar ---------- */

/**
 * Entrega uma cópia do item a um amigo.
 *
 * `dados` é o item inteiro, como ele vive no seu hub. Vai como cópia de
 * propósito: assim quem recebe lê uma linha que é dele, e nunca alcança nada
 * dos seus registros. O preço é que a cópia não acompanha suas edições — para
 * atualizar, compartilhe de novo, que a função substitui a anterior.
 */
export const compartilhar = ({ para_user, colecao, item_id, titulo, dados, recado = '' }) =>
  chamar('compartilhar', { para_user, colecao, item_id, titulo, dados, recado });

export const revogar = (id) => chamar('revogar', { id });

/* ---------- o que cada módulo pode entregar ---------- */

/**
 * De qual coleção sai cada tipo de item, e como ele se chama na tela.
 *
 * Fica numa tabela só para que "compartilhar" e "importar" nunca discordem
 * sobre onde a coisa mora — foi para não repetir esse tipo de par que o mapa e
 * o cofre acabaram no mesmo arquivo.
 */
export const COLECOES = {
  events: { rotulo: 'Compromisso', modulo: 'agenda' },
  tasks: { rotulo: 'Tarefa', modulo: 'agenda' },
  copies: { rotulo: 'Peça', modulo: 'copywriter' },
  scripts: { rotulo: 'Roteiro', modulo: 'teleprompter' },
  mindmaps: { rotulo: 'Mapa mental', modulo: 'mindmap' },
  meetings: { rotulo: 'Reunião', modulo: 'reunioes' },
  decks: { rotulo: 'Apresentação', modulo: 'apresentacoes' },
};

export const rotuloDaColecao = (c) => COLECOES[c]?.rotulo ?? c;
export const moduloDaColecao = (c) => COLECOES[c]?.modulo ?? 'dashboard';

/** Traduz as recusas da função para o que a pessoa precisa entender. */
export function explicar(err) {
  const msg = String(err?.message || err);
  if (err?.status === 404) return 'A função "rede" ainda não foi publicada no seu projeto Supabase.';
  if (/EMAIL_INVALIDO/.test(msg)) return 'Esse endereço não parece um e-mail.';
  if (/VOCE_MESMO/.test(msg)) return 'Esse é você.';
  if (/NAO_SAO_AMIGOS/.test(msg)) return 'Vocês ainda não são amigos no JARBAS. Chame a pessoa primeiro.';
  if (/NAO_E_SEU/.test(msg)) return 'Isso não é seu.';
  if (/JA_RESPONDIDO/.test(msg)) return 'Esse convite já foi respondido.';
  if (/PEDIDO_NAO_ENCONTRADO|NAO_ENCONTRADO/.test(msg)) return 'Não encontrei esse registro.';
  if (/ITEM_GRANDE_DEMAIS/.test(msg)) return 'Esse item é grande demais para compartilhar.';
  if (/SEM_SESSAO/.test(msg)) return 'Entre na sua conta primeiro.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem conexão com a nuvem agora.';
  return msg;
}

/** Guarda quantos itens chegaram sem serem vistos, para o menu marcar. */
let naCaixa = 0;
export const pendentes = () => naCaixa;
export function anotarPendentes(n) {
  if (n === naCaixa) return;
  naCaixa = n;
  emit('rede:mudou', n);
}
