// Senhas e acessos — o cofre, com a mesma cabeça de mapa mental por dentro.
//
// A árvore é a organização: Casa → Bancos → Nubank → o acesso. O que aparece
// desenhado no mapa é só o nome do nó. Senha, usuário e código de recuperação
// nunca entram no SVG, então mostrar a tela para alguém, exportar o mapa ou
// compartilhar a janela não vaza credencial nenhuma.
//
// Tudo aqui é intermediado por core/cofre.js: esta view nunca fala com o store
// diretamente para os dados do cofre, e por isso nunca consegue gravar texto
// claro por engano.

import * as cofre from '../core/cofre.js';
import * as settings from '../core/settings.js';
import { on, emit } from '../core/bus.js';
import { el, uid, truncate } from '../core/util.js';
import { layout, ramoInteiro } from '../ui/arvore.js';
import { sectionCard, emptyState, formModal, confirmDialog, modal, toast } from '../ui/components.js';

const PALETA = ['#5eb3c4', '#4bb391', '#d9a04a', '#e0656b', '#7f9fd0', '#8fd3e0'];

/** Campos que nunca são desenhados no mapa nem ficam visíveis sem um clique. */
const SEGREDOS = ['senha', 'recuperacao'];

let abertos = null;      // cofres decifrados em memória; null = ainda não carregados
let carregando = false;
let ativo = null;
let selecionado = null;
let revelado = new Set(); // "nodeId:campo" visíveis agora
let zoom = 1;
let pan = { x: 0, y: 0 };

/* ============================ render ============================ */

export function render(root) {
  cofre.tocar();

  if (!cofre.disponivel()) return root.append(cardIndisponivel());
  if (!cofre.configurado()) return root.append(cardCriar());
  if (!cofre.destrancado()) return root.append(cardDestrancar());

  if (abertos === null) {
    if (!carregando) {
      carregando = true;
      cofre.abrirTudo()
        .then((lista) => { abertos = lista; })
        .catch((err) => { toast(err.message, 'bad'); abertos = []; })
        .finally(() => { carregando = false; emit('nav:refresh'); });
    }
    return root.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: 'Abrindo o cofre…' })));
  }

  if (!abertos.some((c) => c.id === ativo)) ativo = abertos[0]?.id ?? null;

  root.append(barra());

  if (!ativo) {
    return root.append(el('div', { class: 'card' },
      emptyState('Cofre aberto e vazio. Crie o primeiro mapa de acessos — por exemplo "Casa" e "Trabalho".',
        'Criar mapa de acessos', () => novoCofre())));
  }

  const c = abertos.find((x) => x.id === ativo);
  if (c.erro) {
    return root.append(el('div', { class: 'card' },
      el('p', { class: 'muted', text: 'Este registro não abriu com a senha atual. Provavelmente veio de outro aparelho com uma senha-mestra diferente — não apague, verifique a senha antes.' })));
  }

  // No celular a árvore só cabe encolhida a ponto de não dar para ler os nomes,
  // e procurar uma senha com dois dedos num mapa minúsculo é pior que rolar uma
  // lista. Mesma estrutura, mesma hierarquia — desenhada de outro jeito.
  root.append(el('div', { class: 'grid mm-grid' },
    window.innerWidth <= 780 ? lista(c) : mapa(c),
    painel(c)));
}

/* ---------- barra superior ---------- */

function barra() {
  return el('div', { class: 'toolbar' },
    ...abertos.map((c) => el('button', {
      class: `chip ${c.id === ativo ? 'on' : ''}`,
      onclick: () => { ativo = c.id; selecionado = null; revelado.clear(); resetView(); emit('nav:refresh'); },
      text: truncate(c.nome || 'sem nome', 24),
    })),
    el('button', { class: 'btn sm', text: '+ mapa', onclick: () => novoCofre() }),
    el('div', { class: 'spacer' }),
    el('span', { class: 'cofre-selo', text: '🔓 aberto' }),
    el('button', {
      class: 'btn sm', text: 'Trancar agora',
      onclick: () => { cofre.trancar(); toast('Cofre trancado.', 'ok'); },
    }),
    el('button', { class: 'btn sm', text: '⚙', title: 'Segurança do cofre', onclick: () => painelSeguranca() }),
  );
}

const resetView = () => { zoom = 1; pan = { x: 0, y: 0 }; };

/* ---------- estados fechados ---------- */

function cardIndisponivel() {
  return el('div', { class: 'card cofre-aviso' },
    el('h2', { text: 'O cofre não abre nesta conexão' }),
    el('p', { class: 'muted', text: 'A criptografia do navegador (WebCrypto) só funciona em https:// ou em localhost. Nesta página o endereço é inseguro, e sem ela o cofre só conseguiria guardar suas senhas em texto puro — o que ele não vai fazer.' }),
    el('p', { class: 'tiny dim', text: `Endereço atual: ${location.origin}` }));
}

function cardCriar() {
  const senha = campoSenha('Senha-mestra', { autofocus: true });
  const conf = campoSenha('Repita a senha-mestra');

  const body = el('div', {},
    el('p', { class: 'muted', text: 'A senha-mestra é a única chave deste cofre. Ela não é gravada em lugar nenhum: não fica no seu computador, não sobe para o Supabase, não vai no backup. O que sobe é o conteúdo já embaralhado por ela.' }),
    el('div', { class: 'cofre-alerta' },
      el('strong', { text: 'Leia isto antes de continuar: ' }),
      'se você esquecer a senha-mestra, este cofre está perdido. Não existe recuperação — se existisse para você, existiria para quem roubasse o banco de dados. Anote a senha em um lugar físico e seguro.'),
    senha.node,
    conf.node,
    el('div', { class: 'tiny dim', style: 'margin:4px 0 14px', text: 'Sugestão: use uma frase longa que só você diria, com número e pontuação. Comprimento vale mais que símbolo esquisito.' }),
    el('button', {
      class: 'btn primary', style: 'width:100%',
      text: 'Criar cofre',
      onclick: async () => {
        const v = senha.valor();
        if (cofre.forca(v).bits < 60) {
          if (!await confirmDialog('Essa senha-mestra é curta para o que ela protege. Criar assim mesmo?', { danger: true, okLabel: 'Criar assim mesmo' })) return;
        }
        if (v !== conf.valor()) return toast('As duas senhas não são iguais.', 'bad');
        try {
          await cofre.criar(v);
          abertos = [];
          toast('Cofre criado e aberto.', 'ok');
          emit('nav:refresh');
        } catch (err) {
          toast(err.message, 'bad');
        }
      },
    }));

  return portao(sectionCard('Criar o cofre', null, body));
}

/** Telas de porta fechada não têm o que preencher a largura toda — ficam estreitas. */
function portao(card) {
  card.classList.add('cofre-portao');
  return card;
}

function cardDestrancar() {
  const senha = campoSenha('Senha-mestra', { autofocus: true, semForca: true });

  const abrir = async () => {
    try {
      const ok = await cofre.destrancar(senha.valor());
      if (!ok) return toast('Senha-mestra incorreta.', 'bad');
      abertos = null;
      emit('nav:refresh');
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  senha.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });

  const body = el('div', {},
    el('p', { class: 'muted', text: `Trancado. ${cofre.registros().length} mapa(s) de acesso guardados.` }),
    senha.node,
    el('button', { class: 'btn primary', style: 'width:100%', text: 'Abrir cofre', onclick: abrir }),
    el('p', { class: 'tiny dim', style: 'margin-top:12px', text: `Tranca sozinho depois de ${settings.get('cofreMinutos') ?? 5} minuto(s) sem uso.` }));

  return portao(sectionCard('🔒 Cofre trancado', null, body));
}

/* ---------- mapa ---------- */

function mapa(c) {
  const nodes = c.nodes ?? [];
  const pos = layout(nodes);
  const cores = coresDosRamos(nodes);

  // A moldura acompanha o desenho, mas fica centrada nele: quando a árvore é
  // rasa a altura mínima entra em ação, e sem recentralizar a sobra toda cairia
  // embaixo, deixando os nós encostados no topo do quadro.
  const xs = Object.values(pos).map((p) => p.x);
  const ys = Object.values(pos).map((p) => p.y);
  const margem = 170;
  const W = Math.max(700, Math.max(...xs, 0) - Math.min(...xs, 0) + margem * 2);
  const H = Math.max(360, Math.max(...ys, 0) - Math.min(...ys, 0) + margem);
  const cx = (Math.max(...xs, 0) + Math.min(...xs, 0)) / 2;
  const cy = (Math.max(...ys, 0) + Math.min(...ys, 0)) / 2;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `${cx - W / 2} ${cy - H / 2} ${W} ${H}`);
  svg.setAttribute('class', 'mm-svg');

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  svg.append(g);

  for (const n of nodes) {
    if (!n.parent) continue;
    const a = pos[n.parent];
    const b = pos[n.id];
    if (!a || !b) continue;
    const path = document.createElementNS(ns, 'path');
    const mx = (a.x + b.x) / 2;
    path.setAttribute('d', `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`);
    path.setAttribute('class', 'mm-edge');
    path.setAttribute('stroke', n.color ?? cores[n.id] ?? PALETA[0]);
    g.append(path);
  }

  for (const n of nodes) {
    const p = pos[n.id];
    if (!p) continue;
    const cor = n.color ?? cores[n.id] ?? PALETA[0];
    // O cadeado marca quem guarda credencial. O texto é só o nome do nó —
    // nada de senha, usuário ou código entra no desenho.
    const temAcesso = !!(n.login || n.senha);
    const rotulo = (temAcesso ? '🔑 ' : '') + truncate(n.text, 28);
    const largura = Math.min(240, Math.max(84, rotulo.length * 7.6 + 26));
    const altura = n.depth === 0 ? 46 : 34;

    const grupo = document.createElementNS(ns, 'g');
    grupo.setAttribute('class', `mm-node ${selecionado === n.id ? 'sel' : ''} depth-${Math.min(3, n.depth)}`);
    grupo.setAttribute('transform', `translate(${p.x - largura / 2} ${p.y - altura / 2})`);
    grupo.addEventListener('click', (e) => {
      e.stopPropagation();
      selecionado = n.id;
      revelado.clear();
      emit('nav:refresh');
    });

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('width', largura);
    rect.setAttribute('height', altura);
    rect.setAttribute('rx', altura / 2);
    rect.setAttribute('fill', `${cor}22`);
    rect.setAttribute('stroke', cor);
    rect.setAttribute('stroke-width', selecionado === n.id ? 2.4 : 1.2);
    grupo.append(rect);

    const texto = document.createElementNS(ns, 'text');
    texto.setAttribute('x', largura / 2);
    texto.setAttribute('y', altura / 2 + 4.5);
    texto.setAttribute('text-anchor', 'middle');
    texto.setAttribute('class', 'mm-text');
    texto.setAttribute('font-size', n.depth === 0 ? 15 : 12.5);
    texto.textContent = rotulo;
    grupo.append(texto);

    g.append(grupo);
  }

  svg.addEventListener('click', () => { selecionado = null; revelado.clear(); emit('nav:refresh'); });

  // Pointer events e não mouse events: o mesmo código serve para o mouse no PC
  // e para o dedo no iPhone, e a captura garante que soltar fora do quadro
  // termina o arrasto em vez de deixar o mapa grudado no cursor.
  let arrastando = null;
  svg.addEventListener('pointerdown', (e) => {
    arrastando = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!arrastando) return;
    pan = { x: e.clientX - arrastando.x, y: e.clientY - arrastando.y };
    g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  });
  const soltar = (e) => {
    arrastando = null;
    if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.min(2.5, Math.max(0.35, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    g.setAttribute('transform', `translate(${pan.x} ${pan.y}) scale(${zoom})`);
  }, { passive: false });

  const acoes = [
    el('button', { class: 'btn sm', text: '−', title: 'Afastar', onclick: () => { zoom = Math.max(0.35, zoom * 0.85); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: '+', title: 'Aproximar', onclick: () => { zoom = Math.min(2.5, zoom * 1.18); emit('nav:refresh'); } }),
    el('button', { class: 'btn sm', text: 'Centralizar', onclick: () => { resetView(); emit('nav:refresh'); } }),
  ];

  const quadro = el('div', { class: 'mm-canvas', style: `aspect-ratio:${W.toFixed(0)}/${H.toFixed(0)}` }, svg);

  return sectionCard(c.nome || 'Acessos', acoes, quadro,
    el('div', { class: 'tiny dim', style: 'margin-top:8px', text: '🔑 marca os nós que guardam um acesso. O desenho mostra só os nomes — senha nenhuma aparece aqui.' }));
}

/* ---------- lista (celular) ---------- */

function lista(c) {
  const nodes = c.nodes ?? [];
  const cores = coresDosRamos(nodes);
  const filhosDe = {};
  for (const n of nodes) (filhosDe[n.parent ?? '__root'] ||= []).push(n);

  const body = el('div', { class: 'cofre-lista' });

  const desenhar = (n, nivel) => {
    const cor = n.color ?? cores[n.id] ?? PALETA[0];
    const temAcesso = !!(n.login || n.senha);
    body.append(el('button', {
      class: `cofre-item ${selecionado === n.id ? 'sel' : ''}`,
      style: `padding-left:${10 + nivel * 16}px;border-left-color:${cor}`,
      onclick: () => { selecionado = n.id; revelado.clear(); emit('nav:refresh'); },
    },
    el('span', { class: 'cofre-item-nome', text: n.text }),
    temAcesso ? el('span', { class: 'cofre-item-marca', text: '🔑' }) : null));
    for (const f of filhosDe[n.id] ?? []) desenhar(f, nivel + 1);
  };

  for (const raiz of filhosDe.__root ?? []) desenhar(raiz, 0);

  return sectionCard(c.nome || 'Acessos', null, body,
    el('div', { class: 'tiny dim', style: 'margin-top:8px', text: '🔑 marca os itens que guardam um acesso. Toque para abrir.' }));
}

function coresDosRamos(nodes) {
  const filhosDe = {};
  for (const n of nodes) (filhosDe[n.parent ?? '__root'] ||= []).push(n);
  const raiz = (filhosDe.__root ?? [])[0];
  const cores = {};
  if (!raiz) return cores;
  cores[raiz.id] = PALETA[0];
  (filhosDe[raiz.id] ?? []).forEach((ramo, i) => {
    const cor = PALETA[i % PALETA.length];
    const pintar = (n) => { cores[n.id] = cor; (filhosDe[n.id] ?? []).forEach(pintar); };
    pintar(ramo);
  });
  return cores;
}

/* ---------- painel do nó ---------- */

function painel(c) {
  const node = (c.nodes ?? []).find((n) => n.id === selecionado);
  const body = el('div');

  if (!node) {
    // "item" e não "nó no mapa": no celular não existe mapa nenhum na tela.
    body.append(el('p', { class: 'tiny dim', text: 'Selecione um item para ver e editar o acesso.' }));
    body.append(el('button', {
      class: 'btn', style: 'width:100%;margin-bottom:8px', text: 'Renomear este mapa',
      onclick: async () => {
        const v = await formModal({ title: 'Renomear', values: { nome: c.nome }, fields: [{ name: 'nome', label: 'Nome do mapa' }] });
        if (!v?.nome?.trim()) return;
        c.nome = v.nome.trim();
        await salvar(c);
      },
    }));
    body.append(el('button', {
      class: 'btn danger', style: 'width:100%', text: 'Excluir este mapa',
      onclick: async () => {
        if (!await confirmDialog(`Excluir o mapa "${c.nome}" e todos os acessos dentro dele?`, { danger: true, okLabel: 'Excluir' })) return;
        await cofre.apagar(c.id);
        abertos = abertos.filter((x) => x.id !== c.id);
        ativo = null;
        emit('nav:refresh');
      },
    }));
    return sectionCard('Mapa', null, body);
  }

  body.append(campo('Nome', node.text, (v) => atualizar(c, node.id, { text: v })));
  body.append(campo('Usuário / e-mail', node.login ?? '', (v) => atualizar(c, node.id, { login: v }), { copiavel: true, nodeId: node.id }));
  body.append(campoSegredo(c, node, 'senha', 'Senha'));
  body.append(campo('Endereço (URL)', node.url ?? '', (v) => atualizar(c, node.id, { url: v }), { copiavel: true, nodeId: node.id }));
  body.append(campoSegredo(c, node, 'recuperacao', 'Códigos de recuperação / 2FA'));

  const nota = el('textarea', {
    rows: 4, placeholder: 'Pergunta secreta, qual cartão está cadastrado, quem mais tem acesso…',
    onchange: (e) => atualizar(c, node.id, { note: e.target.value }),
  });
  nota.value = node.note ?? '';
  body.append(el('div', { class: 'field' }, el('label', { text: 'Anotações' }), nota));

  body.append(el('div', { class: 'field' },
    el('label', { text: 'Cor' }),
    el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      ...PALETA.map((cor) => el('button', {
        class: 'color-dot', style: `background:${cor};outline:${node.color === cor ? '2px solid var(--txt)' : 'none'}`,
        onclick: () => atualizar(c, node.id, { color: cor }),
      })),
      el('button', {
        class: 'color-dot', style: 'background:transparent;border:1px dashed var(--line-2)', title: 'Cor do ramo',
        onclick: () => atualizar(c, node.id, { color: null }),
      }))));

  body.append(el('button', {
    class: 'btn primary', style: 'width:100%;margin-bottom:8px', text: '+ Sub-item',
    onclick: () => adicionarFilho(c, node),
  }));
  if (node.parent) {
    body.append(el('button', {
      class: 'btn danger', style: 'width:100%', text: 'Excluir este nó e o que está abaixo',
      onclick: () => excluirNo(c, node),
    }));
  }

  return sectionCard('Acesso selecionado', null, body);
}

/** Campo de texto comum, com botão de copiar opcional. */
function campo(rotulo, valor, aoMudar, { copiavel = false } = {}) {
  const input = el('input', { type: 'text', value: valor, onchange: (e) => aoMudar(e.target.value) });
  const linha = el('div', { class: 'cofre-linha' }, input);
  if (copiavel) {
    linha.append(el('button', {
      class: 'btn sm', text: '⧉', title: 'Copiar',
      onclick: async () => {
        if (!input.value) return;
        await navigator.clipboard.writeText(input.value);
        toast('Copiado.', 'ok');
      },
    }));
  }
  return el('div', { class: 'field' }, el('label', { text: rotulo }), linha);
}

/**
 * Campo secreto: fica mascarado por padrão, aparece só enquanto você pediu, e
 * volta a se esconder ao trocar de nó. A cópia limpa a área de transferência
 * depois de 30 segundos, para a senha não ficar viajando no Ctrl+V do dia.
 */
function campoSegredo(c, node, chave, rotulo) {
  const marca = `${node.id}:${chave}`;
  const visivel = revelado.has(marca);
  const valor = node[chave] ?? '';

  const input = el('input', {
    type: visivel ? 'text' : 'password',
    value: valor,
    autocomplete: 'off',
    spellcheck: 'false',
    onchange: (e) => atualizar(c, node.id, { [chave]: e.target.value }),
  });

  const linha = el('div', { class: 'cofre-linha' },
    input,
    el('button', {
      class: 'btn sm', text: visivel ? '⊘' : '👁', title: visivel ? 'Esconder' : 'Mostrar',
      onclick: () => {
        if (visivel) revelado.delete(marca); else revelado.add(marca);
        emit('nav:refresh');
      },
    }),
    el('button', {
      class: 'btn sm', text: '⧉', title: 'Copiar (limpa em 30s)',
      onclick: async () => {
        if (!input.value) return;
        try {
          await cofre.copiarTemporario(input.value);
          toast('Copiado. A área de transferência se limpa em 30 segundos.', 'ok');
        } catch {
          toast('Não consegui acessar a área de transferência.', 'bad');
        }
      },
    }),
  );

  if (chave === 'senha') {
    linha.append(el('button', {
      class: 'btn sm', text: '⟳', title: 'Gerar senha forte',
      onclick: async () => {
        const nova = cofre.gerarSenha({ tamanho: 20 });
        input.value = nova;
        revelado.add(marca);
        await atualizar(c, node.id, { senha: nova });
      },
    }));
  }

  const f = cofre.forca(valor);
  return el('div', { class: 'field' },
    el('label', { text: rotulo }),
    linha,
    valor && chave === 'senha'
      ? el('div', { class: `cofre-forca ${f.nivel}`, text: `${f.rotulo} · ~${f.bits} bits` })
      : null);
}

/** Campo de senha-mestra usado nas telas de criar/abrir. */
function campoSenha(rotulo, { autofocus = false, semForca = false } = {}) {
  const input = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false' });
  const medidor = el('div', { class: 'cofre-forca' });
  const atualizarMedidor = () => {
    if (semForca) return;
    const f = cofre.forca(input.value);
    medidor.className = `cofre-forca ${f.nivel}`;
    medidor.textContent = input.value ? `${f.rotulo} · ~${f.bits} bits` : '';
  };
  input.addEventListener('input', atualizarMedidor);

  const node = el('div', { class: 'field' },
    el('label', { text: rotulo }),
    el('div', { class: 'cofre-linha' },
      input,
      el('button', {
        class: 'btn sm', text: '👁', title: 'Mostrar',
        onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; },
      })),
    semForca ? null : medidor);

  if (autofocus) setTimeout(() => input.focus(), 30);
  return { node, input, valor: () => input.value };
}

/* ---------- segurança ---------- */

function painelSeguranca() {
  const atual = campoSenha('Senha-mestra atual', { semForca: true });
  const nova = campoSenha('Nova senha-mestra');
  const conf = campoSenha('Repita a nova senha', { semForca: true });

  const minutos = el('input', {
    type: 'number', min: '1', max: '120',
    value: String(settings.get('cofreMinutos') ?? 5),
    onchange: (e) => settings.set({ cofreMinutos: Math.max(1, Number(e.target.value) || 5) }),
  });

  // Modal montado à mão: o formModal declarativo não serve aqui porque os
  // campos de senha precisam do olho de revelar e do medidor de força.
  return modal({
    title: 'Segurança do cofre',
    render: () => el('div', {},
      el('div', { class: 'field' },
        el('label', { text: 'Trancar sozinho após (minutos sem uso)' }),
        minutos),
      el('div', { class: 'tiny dim', style: 'margin:14px 0 8px;letter-spacing:.1em;text-transform:uppercase', text: 'Trocar a senha-mestra' }),
      el('p', { class: 'tiny dim', text: 'Todos os acessos são decifrados e recifrados com a chave nova. Faça isso com o aparelho já sincronizado, para os outros aparelhos receberem a versão nova.' }),
      atual.node, nova.node, conf.node,
      el('button', {
        class: 'btn primary', style: 'width:100%',
        text: 'Trocar senha-mestra',
        onclick: async () => {
          if (nova.valor() !== conf.valor()) return toast('As duas senhas novas não são iguais.', 'bad');
          if (cofre.forca(nova.valor()).bits < 60
            && !await confirmDialog('Senha nova curta para o que ela protege. Continuar?', { danger: true, okLabel: 'Continuar' })) return;
          try {
            const ok = await cofre.trocarSenha(atual.valor(), nova.valor());
            toast(ok ? 'Senha-mestra trocada.' : 'A senha atual está incorreta.', ok ? 'ok' : 'bad');
            if (ok) { abertos = null; emit('nav:refresh'); }
          } catch (err) {
            toast(err.message, 'bad');
          }
        },
      })),
  });
}

/* ---------- operações ---------- */

async function salvar(c) {
  await cofre.gravar(c.id, { nome: c.nome, nodes: c.nodes ?? [] });
  emit('nav:refresh');
}

async function atualizar(c, id, patch) {
  c.nodes = (c.nodes ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n));
  await salvar(c);
}

async function adicionarFilho(c, pai) {
  const v = await formModal({
    title: 'Novo item',
    values: { texto: '' },
    fields: [{ name: 'texto', label: 'Nome', required: true, placeholder: 'Nubank, Gmail do trabalho, Wi-Fi de casa…' }],
  });
  if (!v?.texto?.trim()) return;
  const novo = { id: uid(), text: v.texto.trim(), parent: pai.id, depth: (pai.depth ?? 0) + 1 };
  c.nodes = [...(c.nodes ?? []), novo];
  selecionado = novo.id;
  await salvar(c);
}

async function excluirNo(c, node) {
  if (!await confirmDialog(`Excluir "${node.text}" e tudo abaixo dele? O acesso guardado aqui some junto.`, { danger: true, okLabel: 'Excluir' })) return;
  const remover = ramoInteiro(c.nodes, node.id);
  c.nodes = (c.nodes ?? []).filter((n) => !remover.has(n.id));
  selecionado = null;
  await salvar(c);
}

async function novoCofre() {
  const v = await formModal({
    title: 'Novo mapa de acessos',
    values: { nome: '', raiz: '' },
    fields: [
      { name: 'nome', label: 'Nome do mapa', required: true, placeholder: 'Casa, Trabalho, Financeiro…' },
      { name: 'raiz', label: 'Nó central', placeholder: 'deixe vazio para usar o nome' },
    ],
  });
  if (!v?.nome?.trim()) return;
  const raiz = { id: uid(), text: (v.raiz || v.nome).trim(), parent: null, depth: 0 };
  const id = uid();
  const dados = { nome: v.nome.trim(), nodes: [raiz] };
  await cofre.gravar(id, dados);
  abertos.push({ id, ...dados });
  ativo = id;
  selecionado = raiz.id;
  resetView();
  emit('nav:refresh');
}

/* ---------- reações ---------- */

/** Trancar apaga tudo que estava decifrado em memória. Sem meio-termo. */
function esquecer() {
  abertos = null;
  selecionado = null;
  revelado.clear();
}

on('cofre:estado', ({ destrancado }) => {
  if (!destrancado) esquecer();
  if (location.hash.includes('senhas')) emit('nav:refresh');
});

on('cofre:autolock', () => {
  toast('Cofre trancado por inatividade.', '');
});

// Registro vindo de outro aparelho: descarta o que está aberto para reabrir
// com o conteúdo novo. Só reage à sincronização — nossas próprias gravações
// já atualizaram a memória antes de escrever.
on('data:changed', ({ collection, action }) => {
  if (collection === 'cofre' && action === 'remote') {
    abertos = null;
    if (location.hash.includes('senhas')) emit('nav:refresh');
  }
});

// Qualquer interação na tela do cofre conta como uso, senão ler uma anotação
// longa terminaria com a tela trancando na sua cara.
for (const evento of ['pointerdown', 'keydown']) {
  window.addEventListener(evento, () => {
    if (cofre.destrancado() && location.hash.includes('senhas')) cofre.tocar();
  }, { passive: true });
}
