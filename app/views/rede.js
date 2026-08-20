// REDE — os amigos e o que se troca com eles.
//
// A tela tem duas metades, e a divisão não é estética: PESSOAS é com quem você
// pode trocar, CAIXA é o que já foi trocado. Misturar as duas faria a lista de
// amigos crescer com histórico e o histórico virar agenda de contatos.
//
// Uma coisa que esta tela deliberadamente NÃO tem: um jeito de descobrir quem
// usa o JARBAS. Não existe busca, não existe sugestão, não existe "pessoas que
// você talvez conheça". Para chamar alguém é preciso saber o e-mail de cadastro
// dela — foi o pedido, e é também o que impede o hub de virar lista telefônica.

import * as store from '../core/store.js';
import * as rede from '../core/rede.js';
import { emit } from '../core/bus.js';
import { el, uid, fmtDate, truncate, today } from '../core/util.js';
import { sectionCard, emptyState, formModal, confirmDialog, toast } from '../ui/components.js';

let aba = 'pessoas';
let cache = null;      // { amigos, enviados, recebidos, eu }
let caixaCache = null; // { recebidos, enviados }
let carregando = false;

export function render(root, params = {}) {
  if (params.aba) aba = params.aba;

  root.append(el('div', { class: 'tabs' },
    ...[['pessoas', 'Pessoas'], ['caixa', 'Compartilhado comigo']].map(([id, rotulo]) =>
      el('button', {
        class: `tab ${aba === id ? 'on' : ''}`,
        onclick: () => { aba = id; emit('nav:refresh'); },
        text: rotulo + (id === 'caixa' && rede.pendentes() ? ` (${rede.pendentes()})` : ''),
      }))));

  if (!rede.disponivel()) {
    root.append(el('div', { class: 'card' },
      emptyState('A rede vive na nuvem. Configure a sincronização em Ajustes e entre na sua conta para usar.')));
    return;
  }

  root.append(el('div', { class: 'card' },
    el('p', { class: 'tiny dim', style: 'margin:0' },
      'Para chamar alguém você precisa saber o e-mail de cadastro dessa pessoa — o JARBAS não tem lista de '
      + 'usuários, de propósito. O que você compartilha vai como cópia: quem recebe lê o que você mandou e '
      + 'não alcança mais nada do seu hub.')));

  if (aba === 'pessoas') abaPessoas(root);
  else abaCaixa(root);

  if (!carregando) atualizar();
}

/** Busca o estado no servidor uma vez por visita e redesenha quando chega. */
async function atualizar() {
  carregando = true;
  try {
    const [r, c] = await Promise.all([rede.minhaRede(), rede.caixa()]);
    const mudou = JSON.stringify([cache, caixaCache]) !== JSON.stringify([r, c]);
    cache = r;
    caixaCache = c;
    rede.anotarPendentes((c.recebidos ?? []).length);
    if (mudou) emit('nav:refresh');
  } catch (err) {
    if (!cache) {
      cache = { amigos: [], enviados: [], recebidos: [], erro: rede.explicar(err) };
      emit('nav:refresh');
    }
  } finally {
    carregando = false;
  }
}

/* ============================ pessoas ============================ */

function abaPessoas(root) {
  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '+ Chamar alguém', onclick: chamarAlguem })));

  if (!cache) { root.append(el('div', { class: 'card' }, el('p', { class: 'tiny dim', text: 'Carregando…' }))); return; }
  if (cache.erro) { root.append(el('div', { class: 'card' }, el('p', { class: 'aviso tiny', text: cache.erro }))); return; }

  /* quem me chamou — primeiro, porque exige decisão */
  if ((cache.recebidos ?? []).length) {
    const lista = el('div', { class: 'list-plain' });
    for (const p of cache.recebidos) {
      lista.append(el('div', { class: 'lp-row' },
        el('div', { class: 'lp-main' },
          el('div', { text: p.de_nome || p.de_email }),
          el('div', { class: 'tiny dim', text: [p.de_email, p.recado].filter(Boolean).join(' · ') })),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { class: 'btn sm primary', text: 'Aceitar', onclick: () => decidir(p.id, true) }),
          el('button', { class: 'btn sm', text: 'Recusar', onclick: () => decidir(p.id, false) }))));
    }
    root.append(sectionCard(`Querem falar com você · ${cache.recebidos.length}`, null, lista));
  }

  /* amigos */
  const amigos = cache.amigos ?? [];
  const corpo = el('div', { class: 'list-plain' });
  if (!amigos.length) {
    corpo.append(emptyState('Ninguém ainda. Chame alguém pelo e-mail de cadastro dela no JARBAS.',
      '+ Chamar alguém', chamarAlguem));
  } else {
    for (const a of amigos) {
      corpo.append(el('div', { class: 'lp-row' },
        el('div', { class: 'lp-main' },
          el('div', { text: a.nome || a.email }),
          el('div', { class: 'tiny dim', text: `${a.email} · desde ${fmtDate(a.desde)}` })),
        el('button', {
          class: 'btn sm danger', text: 'Desfazer',
          onclick: async () => {
            const nome = a.nome || a.email;
            if (!await confirmDialog(
              `Desfazer a amizade com ${nome}? Tudo o que vocês compartilharam um com o outro some dos dois lados.`,
              { title: 'Desfazer amizade', danger: true, okLabel: 'Desfazer' },
            )) return;
            try { await rede.desfazer(a.user_id); toast('Amizade desfeita.', 'ok'); cache = null; emit('nav:refresh'); }
            catch (err) { toast(rede.explicar(err), 'err'); }
          },
        })));
    }
  }
  root.append(sectionCard(`Amigos · ${amigos.length}`, null, corpo));

  /* convites que eu mandei */
  const enviados = cache.enviados ?? [];
  if (enviados.length) {
    const lista = el('div', { class: 'list-plain' });
    for (const p of enviados) {
      lista.append(el('div', { class: 'lp-row' },
        el('div', { class: 'lp-main' },
          el('div', { text: p.para_email }),
          el('div', { class: 'tiny dim', text: `chamado em ${fmtDate(p.criado_em)}` })),
        el('button', {
          class: 'btn sm', text: 'Cancelar',
          onclick: async () => {
            try { await rede.cancelar(p.id); cache = null; emit('nav:refresh'); }
            catch (err) { toast(rede.explicar(err), 'err'); }
          },
        })));
    }
    root.append(sectionCard(`Convites esperando · ${enviados.length}`, null,
      lista,
      // Esta frase existe para não parecer defeito. Ver o comentário da regra 2
      // na Edge Function: dizer "essa conta não existe" transformaria o convite
      // numa forma de descobrir quem tem cadastro.
      el('p', { class: 'tiny dim', style: 'margin:10px 0 0' },
        'Um convite fica esperando até a pessoa responder. O JARBAS não diz se o endereço tem conta — '
        + 'se dissesse, daria para descobrir quem usa o sistema testando e-mails.')));
  }
}

async function chamarAlguem() {
  const v = await formModal({
    title: 'Chamar alguém para a sua rede',
    values: { email: '', recado: '' },
    fields: [
      { name: 'email', label: 'E-mail de cadastro dela no JARBAS', required: true, placeholder: 'nome@exemplo.com' },
      { name: 'recado', label: 'Recado (opcional)', placeholder: 'Sou o Thiago, da equipe do Kadu.' },
    ],
  });
  if (!v?.email?.trim()) return;
  try {
    await rede.convidar(v.email.trim(), v.recado ?? '');
    toast('Convite enviado. Ele aparece no JARBAS dela quando ela entrar.', 'ok', 5000);
    cache = null;
    emit('nav:refresh');
  } catch (err) { toast(rede.explicar(err), 'err'); }
}

async function decidir(id, aceitar) {
  try {
    await rede.responder(id, aceitar);
    toast(aceitar ? 'Agora vocês podem compartilhar.' : 'Convite recusado.', 'ok');
    cache = null;
    emit('nav:refresh');
  } catch (err) { toast(rede.explicar(err), 'err'); }
}

/* ============================ caixa ============================ */

function abaCaixa(root) {
  if (!caixaCache) { root.append(el('div', { class: 'card' }, el('p', { class: 'tiny dim', text: 'Carregando…' }))); return; }

  const recebidos = caixaCache.recebidos ?? [];
  const corpo = el('div', { class: 'list-plain' });
  if (!recebidos.length) {
    corpo.append(emptyState('Nada compartilhado com você ainda.'));
  } else {
    for (const c of recebidos) {
      corpo.append(el('div', { class: 'lp-row' },
        el('div', { class: 'lp-main' },
          el('div', { text: truncate(c.titulo || '(sem título)', 46) }),
          el('div', { class: 'tiny dim', text: `${rede.rotuloDaColecao(c.colecao)} · de ${c.de_nome || c.de_email} · ${fmtDate(c.atualizado_em)}` }),
          c.recado ? el('div', { class: 'tiny', text: `"${truncate(c.recado, 120)}"` }) : null),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { class: 'btn sm primary', text: 'Importar', onclick: () => importar(c) }),
          el('button', {
            class: 'btn sm', text: 'Descartar',
            onclick: async () => {
              try { await rede.revogar(c.id); caixaCache = null; emit('nav:refresh'); }
              catch (err) { toast(rede.explicar(err), 'err'); }
            },
          }))));
    }
  }
  root.append(sectionCard(`Compartilhado comigo · ${recebidos.length}`, null, corpo));

  const enviados = caixaCache.enviados ?? [];
  if (enviados.length) {
    const lista = el('div', { class: 'list-plain' });
    for (const c of enviados) {
      lista.append(el('div', { class: 'lp-row' },
        el('div', { class: 'lp-main' },
          el('div', { text: truncate(c.titulo || '(sem título)', 46) }),
          el('div', { class: 'tiny dim', text: `${rede.rotuloDaColecao(c.colecao)} · para ${c.para_nome || c.para_email} · ${fmtDate(c.atualizado_em)}` })),
        el('button', {
          class: 'btn sm danger', text: 'Tirar',
          onclick: async () => {
            try { await rede.revogar(c.id); toast('Tirado de circulação.', 'ok'); caixaCache = null; emit('nav:refresh'); }
            catch (err) { toast(rede.explicar(err), 'err'); }
          },
        })));
    }
    root.append(sectionCard(`Eu compartilhei · ${enviados.length}`, null, lista));
  }
}

/**
 * Traz a cópia para o meu hub.
 *
 * O item entra com id NOVO, de propósito. Se entrasse com o id do dono, um
 * compartilhamento poderia sobrescrever um item meu que por acaso tivesse o
 * mesmo id — e um "importar" que apaga o que era seu é a última coisa que
 * alguém espera de um botão chamado importar.
 */
async function importar(c) {
  const dados = { ...(c.dados ?? {}) };
  delete dados.id;
  delete dados.updatedAt;
  delete dados.createdAt;
  delete dados.deleted;

  const titulo = dados.title ?? dados.titulo ?? c.titulo;
  const marca = `Compartilhado por ${c.de_nome || c.de_email}`;
  const novo = {
    ...dados,
    id: uid(),
    title: titulo,
    // De onde veio fica gravado no item. Daqui a um mês, olhando um
    // compromisso que você não lembra de ter criado, é a resposta.
    origem: marca,
  };

  try {
    await store.save(c.colecao, novo);
    toast(`${rede.rotuloDaColecao(c.colecao)} importado para o seu ${rede.moduloDaColecao(c.colecao)}.`, 'ok', 5000);
    emit('nav:go', { view: rede.moduloDaColecao(c.colecao), id: novo.id });
  } catch (err) {
    toast(`Não consegui importar: ${String(err?.message ?? err)}`, 'err');
  }
}
