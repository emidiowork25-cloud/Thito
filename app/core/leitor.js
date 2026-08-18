// Ler um link — o lado de cá da Edge Function `ler`.
//
// Por que existe uma função de servidor só para isto: o navegador não busca
// página de outro domínio (a política de origem impede), e a ferramenta de
// leitura do modelo não executa JavaScript. Um servidor nosso resolve os dois:
// busca de verdade, com cabeçalho de navegador, e devolve texto limpo.
//
// O que ele consegue, medido e não suposto:
//
//   notícia, blog, site, documentação → abre inteiro
//   vídeo do YouTube                  → título e canal sempre; a transcrição
//                                       depende do YouTube deixar (ver abaixo)
//   Instagram, TikTok, Facebook, X    → não abre, e diz que não abre
//
// A transcrição sai das legendas que o próprio vídeo publica — sem chave, sem
// serviço de terceiro. O YouTube barra endereços de datacenter com um "confirme
// que você não é um robô", e um servidor é sempre um datacenter. Quando isso
// acontece, a resposta traz `motivoSemTranscricao: 'bloqueado'` e quem chamou
// decide o que fazer, em vez de receber vazio e achar que o vídeo era mudo.

import * as sb from './supabase.js';
import * as settings from './settings.js';

/**
 * Lê um endereço. Nunca lança: quem chama precisa de um resultado para decidir,
 * não de uma exceção para tratar — e "não deu para ler" é resposta legítima.
 *
 * @returns {Promise<{ok, tipo, titulo, texto, motivo, temTranscricao?, autor?}>}
 */
export async function ler(url, { limite = 40000 } = {}) {
  if (!settings.isCloudConfigured() || !sb.isSignedIn()) {
    return { ok: false, motivo: 'sem-nuvem', texto: '' };
  }
  try {
    const r = await sb.invokeFunction('ler', { url, limite });
    return { texto: '', ...r };
  } catch (err) {
    if (err?.status === 404) return { ok: false, motivo: 'sem-funcao', texto: '' };
    return { ok: false, motivo: 'falhou', detalhe: String(err?.message ?? err), texto: '' };
  }
}

/** Endereços que sabidamente não abrem — para avisar antes de tentar. */
export const REDES_FECHADAS = /(^|\.)(instagram\.com|tiktok\.com|facebook\.com|threads\.net|x\.com|twitter\.com|linkedin\.com)$/i;

export function fechado(endereco) {
  try { return REDES_FECHADAS.test(new URL(endereco).hostname); } catch { return false; }
}

export const ehVideo = (endereco) => {
  try {
    const h = new URL(endereco).hostname;
    return /youtu\.be$/i.test(h) || /(^|\.)youtube\.com$/i.test(h);
  } catch { return false; }
};

/** O que aconteceu, em português, para a tela mostrar sem traduzir código. */
export function explicar(r) {
  const m = r?.motivo ?? '';
  if (m === 'exige-login') return 'Esse endereço só abre para quem está logado — Instagram, TikTok, Facebook, X e LinkedIn são assim. Copie o texto e cole aqui.';
  if (m === 'sem-funcao') return 'A função "ler" ainda não foi publicada no seu projeto Supabase.';
  if (m === 'sem-nuvem') return 'Entre na sua conta para eu poder buscar a página.';
  if (m === 'url-invalida') return 'Esse endereço não parece um link.';
  if (m === 'endereco-interno') return 'Esse endereço é da rede interna e eu não busco lá.';
  if (m === 'nao-abriu') return `A página respondeu ${r.status ?? 'erro'} e não abriu.`;
  if (m === 'nao-e-texto') return 'Esse link não é uma página de texto.';
  if (m === 'pouco-texto') return 'Abri a página, mas quase não havia texto nela — provavelmente é montada por JavaScript.';
  if (m === 'falhou') return 'Não consegui buscar esse endereço agora.';
  return '';
}

/** O que dizer sobre um vídeo cuja transcrição não veio. */
export function explicarVideo(r) {
  if (r?.temTranscricao) return '';
  if (r?.motivoSemTranscricao === 'bloqueado') {
    return 'O YouTube recusou a leitura da transcrição para o servidor (ele barra endereços de datacenter). '
      + 'Peguei título e canal; para o conteúdo, abra o vídeo, clique em "Mostrar transcrição" e cole aqui.';
  }
  if (r?.motivoSemTranscricao === 'sem-legenda') {
    return 'Esse vídeo não tem legenda publicada, então não há transcrição para ler. Título e canal eu peguei.';
  }
  return '';
}
