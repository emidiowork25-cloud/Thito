// A ponte entre os Ajustes e a sincronização.
//
// Os ajustes nasceram guardados como um bloco solto no IndexedDB, fora das
// coleções. A sincronização só move coleções — então tudo viajava entre os
// aparelhos, menos as preferências. Entrar com a mesma conta no celular trazia
// agenda, finanças, roteiros e senhas, e deixava o "Sobre você" em branco.
//
// A correção é fazer a parte pessoal dos ajustes virar um registro comum, numa
// coleção de um item só, e deixá-la pegar carona em tudo o que já existe:
// envio, recebimento, resolução por último-a-escrever e exclusão lógica.
//
// O que decide se uma preferência entra aqui é uma pergunta só: ela descreve
// VOCÊ ou descreve ESTE APARELHO?

import * as store from './store.js';
import * as settings from './settings.js';
import { on } from './bus.js';

/** Registro único: a mesma pessoa tem um só conjunto de preferências. */
export const ID = 'perfil';

/** Descrevem a pessoa. Viajam. */
export const PESSOAIS = [
  'name', 'perfil', 'theme', 'startView', 'currency',
  'speakReplies', 'greetOnOpen', 'autoListen', 'effort',
  'voiceRate', 'voicePitch', 'voiceVolume', 'allowBargeIn', 'voiceTimbre',
  'cofreMinutos',
  'noticiasTemas', 'noticiasHora', 'noticiasAuto',
];

/*
 * Descrevem o aparelho, e por isso ficam:
 *
 * supabaseUrl, supabaseKey — é a configuração da própria conexão. Mandá-la
 *   pela conexão que ela configura é circular, e um valor errado trancaria
 *   todos os aparelhos de uma vez, sem sobrar nenhum para consertar.
 *
 * voiceURI — o identificador de uma voz instalada NESTE sistema. A voz do
 *   Windows não existe no iPhone: copiá-la para lá emudeceria o assistente.
 *
 * autoSync — se este aparelho sincroniza sozinho é decisão dele.
 */

const recorte = (fonte) => Object.fromEntries(
  PESSOAIS.filter((k) => fonte[k] !== undefined).map((k) => [k, fonte[k]]),
);

const iguais = (a, b) => PESSOAIS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

// Trava contra o eco: aplicar o que veio de fora mexe nos ajustes, mexer nos
// ajustes dispara a gravação, e a gravação voltaria pela rede como novidade.
// Dois aparelhos ligados ficariam se reescrevendo um ao outro sem parar.
let aplicando = false;

/** Grava a parte pessoal dos ajustes como registro — é o que a sync leva. */
async function guardar(todas) {
  const meu = recorte(todas);
  const atual = store.get('prefs', ID);
  if (atual && iguais(atual, meu)) return;
  await store.save('prefs', { id: ID, ...meu });
}

/** Traz o registro para os ajustes deste aparelho. */
export async function aplicar() {
  const registro = store.get('prefs', ID);
  if (!registro) return false;

  const meu = recorte(registro);
  if (!Object.keys(meu).length) return false;
  if (iguais(settings.all(), meu)) return false;

  aplicando = true;
  try {
    await settings.set(meu);
  } finally {
    aplicando = false;
  }
  return true;
}

/**
 * Primeira adoção: leva para o registro os ajustes que já existem neste
 * aparelho — mas só se algum deles tiver sido realmente mexido.
 *
 * A condição não é capricho. Um celular recém-instalado tem exatamente os
 * valores padrão; se ele criasse o registro assim mesmo, o envio (que acontece
 * antes do recebimento) mandaria esse registro em branco com carimbo novo e
 * apagaria o perfil do computador. O aparelho que não tem nada a dizer fica
 * calado e recebe.
 */
async function adotar() {
  if (store.get('prefs', ID)) return;
  const todas = settings.all();
  const padrao = settings.DEFAULTS;
  const mexeu = PESSOAIS.some((k) => JSON.stringify(todas[k]) !== JSON.stringify(padrao[k]));
  if (!mexeu) return;
  await guardar(todas);
}

export async function iniciar() {
  await aplicar();
  await adotar();

  on('settings:changed', (todas) => { if (!aplicando) guardar(todas); });

  // Quando o registro chega pela rede, os ajustes desta tela acompanham.
  on('data:changed', ({ collection, action }) => {
    if (collection === 'prefs' && action === 'remote') aplicar();
  });
}
