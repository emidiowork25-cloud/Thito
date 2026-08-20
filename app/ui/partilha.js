// O botão de compartilhar — um só, para todos os módulos.
//
// Cada módulo tem a sua forma de listar e editar, mas "entregar isto a um
// amigo" é o mesmo gesto em todos. Escrever o diálogo sete vezes garantiria que
// daqui a três meses o da Agenda mandasse um campo a mais que o do Copywriter,
// e ninguém descobriria até alguém receber metade de um compromisso.
//
// O que o módulo informa é só o que nele é diferente: a coleção, o item e como
// ele se chama. O resto — quem pode receber, o que vai junto, o que a pessoa vê
// — mora aqui.

import * as rede from '../core/rede.js';
import { el, truncate } from '../core/util.js';
import { modal, toast } from './components.js';

/**
 * Abre o diálogo de entrega.
 *
 * @param {string} colecao  onde o item mora no store (events, copies, scripts…)
 * @param {object} item     o item inteiro — vai como cópia
 * @param {string} titulo   o nome que a pessoa vê na caixa dela
 */
export async function abrirPartilha(colecao, item, titulo) {
  if (!rede.disponivel()) {
    toast('Para compartilhar, configure a nuvem em Ajustes e entre na sua conta.', 'err', 5000);
    return;
  }

  const corpo = el('div', {}, el('p', { class: 'tiny dim', text: 'Carregando sua rede…' }));
  const janela = modal({
    title: `Compartilhar ${rede.rotuloDaColecao(colecao).toLowerCase()}`,
    render: () => corpo,
  });

  let minha;
  try {
    minha = await rede.minhaRede();
  } catch (err) {
    corpo.replaceChildren(el('p', { class: 'aviso tiny', text: rede.explicar(err) }));
    return;
  }

  const amigos = minha.amigos ?? [];
  if (!amigos.length) {
    // Sem amigos não há para quem entregar — e o caminho é chamar alguém, não
    // procurar numa lista que de propósito não existe.
    corpo.replaceChildren(
      el('p', { style: 'margin-top:0', text: 'Você ainda não tem ninguém na sua rede.' }),
      el('p', { class: 'tiny dim' },
        'Para compartilhar é preciso já ser amigo da pessoa aqui dentro, e para chamá-la é preciso '
        + 'saber o e-mail de cadastro dela no JARBAS.'),
      el('button', {
        class: 'btn primary', style: 'margin-top:10px',
        text: 'Ir para a Rede',
        onclick: async () => {
          janela.close();
          (await import('./shell.js')).go('rede');
        },
      }));
    return;
  }

  const escolhidos = new Set();
  const lista = el('div', { class: 'list-plain' });
  for (const a of amigos) {
    const caixa = el('input', { type: 'checkbox' });
    caixa.addEventListener('change', () => (caixa.checked ? escolhidos.add(a.user_id) : escolhidos.delete(a.user_id)));
    lista.append(el('label', { class: 'lp-row clickable', style: 'cursor:pointer' },
      caixa,
      el('div', { class: 'lp-main', style: 'margin-left:10px' },
        el('div', { text: a.nome || a.email }),
        el('div', { class: 'tiny dim', text: a.email }))));
  }

  const recado = el('input', { type: 'text', placeholder: 'Recado (opcional) — ex.: "confere o horário pra mim"' });

  corpo.replaceChildren(
    el('div', { class: 'field' },
      el('label', { text: `O que vai: ${truncate(titulo || '(sem título)', 60)}` }),
      el('div', { class: 'tiny dim' },
        'Vai uma CÓPIA. A pessoa pode importar para o hub dela; o que ela fizer com a cópia não mexe no seu, '
        + 'e o que você editar aqui não muda a cópia dela — para atualizar, compartilhe de novo.')),
    el('div', { class: 'field' }, el('label', { text: 'Para quem' }), lista),
    el('div', { class: 'field' }, el('label', { text: 'Recado' }), recado),
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px' },
      el('button', { class: 'btn', text: 'Cancelar', onclick: () => janela.close() }),
      el('button', {
        class: 'btn primary', text: 'Compartilhar',
        onclick: async (e) => {
          if (!escolhidos.size) { toast('Escolha ao menos uma pessoa.', 'err'); return; }
          e.target.disabled = true;
          let feitos = 0;
          const falhas = [];
          for (const para_user of escolhidos) {
            try {
              await rede.compartilhar({
                para_user, colecao, item_id: String(item.id ?? ''),
                titulo: titulo ?? '', dados: item, recado: recado.value.trim(),
              });
              feitos += 1;
            } catch (err) { falhas.push(rede.explicar(err)); }
          }
          janela.close();
          if (feitos) toast(`Compartilhado com ${feitos} pessoa(s).`, 'ok');
          if (falhas.length) toast(falhas[0], 'err', 6000);
        },
      })));
}

/** O botão pronto, para os módulos só pendurarem na barra de ações. */
export const botaoPartilhar = (colecao, item, titulo, { classe = 'btn sm' } = {}) =>
  el('button', {
    class: classe, text: 'Compartilhar', title: 'Entregar uma cópia a alguém da sua rede',
    onclick: () => abrirPartilha(colecao, item, titulo),
  });
