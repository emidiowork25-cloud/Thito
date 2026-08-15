// A porta de entrada de quem foi convidado.
//
// Duas telas, e as duas acontecem antes de o hub existir: "Crie sua conta",
// para quem chegou pelo link, e as boas-vindas de quem já criou e ainda espera
// o aval. Nenhuma delas monta o app — quem não foi aprovado não passa daqui,
// e não passa porque o Supabase recusa o login de um e-mail não confirmado,
// não porque esta tela esconde o botão.

import * as contas from '../core/contas.js';
import * as settings from '../core/settings.js';
import * as sb from '../core/supabase.js';
import { el } from '../core/util.js';

/** O código que veio no link, se veio. */
export function conviteNaUrl() {
  const q = new URLSearchParams(location.search);
  const c = (q.get('convite') || '').trim().toUpperCase();
  return /^[A-Z0-9]{4,32}$/.test(c) ? c : '';
}

/** Tira o convite da barra de endereço depois de usado, sem recarregar a página. */
export function limparUrl() {
  const u = new URL(location.href);
  u.searchParams.delete('convite');
  history.replaceState(null, '', u.toString());
}

/* ============================ a tela ============================ */

/**
 * Desenha a porta e devolve uma promessa que só resolve quando houver sessão —
 * ou quando a pessoa desistir e pedir para ver o app local.
 */
export function abrirPorta(raiz, codigo) {
  return new Promise((pronto) => {
    const palco = el('div', { class: 'porta' });
    raiz.innerHTML = '';
    raiz.append(palco);
    desenhar(palco, codigo, pronto);
  });
}

async function desenhar(palco, codigo, pronto) {
  palco.innerHTML = '';
  palco.append(marca());

  const caixa = el('div', { class: 'porta-caixa' });
  palco.append(caixa);

  caixa.append(el('div', { class: 'tiny dim', text: 'conferindo o convite…' }));

  let convite = null;
  try {
    convite = await contas.verConvite(codigo);
  } catch (err) {
    caixa.innerHTML = '';
    caixa.append(
      el('h1', { class: 'porta-titulo', text: 'Convite não vale' }),
      el('p', { class: 'muted', text: contas.explicar(err) }),
      el('button', { class: 'btn', style: 'width:100%', text: 'Continuar sem convite', onclick: () => { limparUrl(); pronto(false); } }),
    );
    return;
  }

  formularioDeCadastro(caixa, codigo, convite, pronto);
}

function marca() {
  return el('div', { class: 'porta-marca' },
    el('img', { class: 'porta-cerebro', src: './assets/jarbas-cerebro.png', width: 256, height: 256, alt: '' }),
    el('div', {},
      el('div', { class: 'porta-nome', text: 'JARBAS' }),
      el('div', { class: 'porta-sub', text: 'ao seu dispor' })));
}

function formularioDeCadastro(caixa, codigo, convite, pronto) {
  const nome = el('input', { type: 'text', placeholder: 'Como você quer ser chamado', autocomplete: 'name' });
  const email = el('input', { type: 'email', placeholder: 'seu@email.com', autocomplete: 'email' });
  const senha = el('input', { type: 'password', placeholder: 'pelo menos 8 caracteres', autocomplete: 'new-password' });
  const aviso = el('div', { class: 'aviso', hidden: true });

  const enviar = el('button', { class: 'btn primary', style: 'width:100%', text: 'Crie sua conta' });

  const tentar = async () => {
    aviso.hidden = true;
    if (!nome.value.trim()) return erro('Diga como você quer ser chamado.');
    if (!/.+@.+\..+/.test(email.value)) return erro('Confira o e-mail.');
    if (senha.value.length < 8) return erro('A senha precisa de pelo menos 8 caracteres.');

    enviar.disabled = true;
    enviar.textContent = 'criando…';
    try {
      await contas.criarConta({
        codigo,
        nome: nome.value.trim(),
        email: email.value.trim(),
        senha: senha.value,
      });
      limparUrl();
      esperandoAval(caixa.parentElement, email.value.trim(), pronto);
    } catch (err) {
      enviar.disabled = false;
      enviar.textContent = 'Crie sua conta';
      erro(contas.explicar(err));
    }
  };

  const erro = (t) => { aviso.textContent = t; aviso.hidden = false; };
  for (const campo of [nome, email, senha]) {
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') tentar(); });
  }
  enviar.addEventListener('click', tentar);

  caixa.innerHTML = '';
  caixa.append(
    el('h1', { class: 'porta-titulo', text: 'Você foi convidado' }),
    el('p', { class: 'muted', style: 'margin-top:0', text: convite.anotacao || 'Crie sua conta para começar a usar o JARBAS.' }),
    listaDeModulos(convite.modulos ?? []),
    el('div', { class: 'field' }, el('label', { text: 'Nome' }), nome),
    el('div', { class: 'field' }, el('label', { text: 'E-mail' }), email),
    el('div', { class: 'field' }, el('label', { text: 'Senha' }), senha),
    aviso,
    enviar,
    el('p', { class: 'tiny dim', style: 'margin-bottom:0' },
      'Criar a conta não abre o acesso na hora: quem te convidou precisa aprovar. '
      + 'Quando aprovar, chega um e-mail de confirmação e a partir daí você entra.'),
  );
  setTimeout(() => nome.focus(), 60);
}

/*
 * Os nomes bonitos dos módulos.
 *
 * Sim, é uma segunda cópia dos títulos que o shell também tem — e é de
 * propósito. Esta tela roda ANTES do app existir; importar o shell para ler os
 * títulos arrastaria junto todas as views, e uma delas quebrando deixaria a
 * porta de entrada em branco. Um convidado que não consegue nem se cadastrar
 * porque o módulo de Finanças tem um erro é o pior negócio possível.
 *
 * O que o servidor guarda continua sendo o identificador; um nome que falte
 * aqui aparece como veio, e não some.
 */
const TITULOS = {
  agenda: 'Agenda',
  apresentacoes: 'Apresentações',
  compras: 'Compras',
  copywriter: 'Copywriter',
  eventos: 'Eventos',
  financas: 'Finanças',
  freela: 'Freela',
  mindmap: 'Mind maps',
  reunioes: 'Reuniões',
  rotina: 'Rotina',
  senhas: 'Senhas e acessos',
  teleprompter: 'Teleprompter',
};

function listaDeModulos(ids) {
  if (!ids.length) return null;
  return el('div', { class: 'porta-modulos' },
    el('div', { class: 'tiny dim', text: 'O que foi liberado para você:' }),
    el('div', { class: 'porta-chips' },
      ...ids.map((m) => el('span', { class: 'chip', text: TITULOS[m] ?? m }))));
}

/* ---------- a tranca de entrada ---------- */

/**
 * A porta de todo dia: sem sessão, nada do hub aparece.
 *
 * Antes o app abria inteiro para quem chegasse, e a nuvem era um acessório —
 * fazia sentido enquanto ele tinha um dono só. Com convidados, não faz mais:
 * quem abre a página não é necessariamente quem tem direito a ela, e módulo
 * visível antes de saber quem está do outro lado é módulo mostrado por engano.
 *
 * O que se perde, e é justo saber: num aparelho que nunca entrou, sem internet,
 * não há como abrir o JARBAS — nem para ver o que já está gravado ali. A sessão
 * fica guardada no aparelho, então isso só atinge o primeiro acesso e quem
 * escolheu sair. Aparelho que já entrou continua abrindo offline.
 */
export function telaDeLogin(raiz) {
  return new Promise((pronto) => {
    const palco = el('div', { class: 'porta' });
    raiz.append(palco);

    const email = el('input', { type: 'email', placeholder: 'seu@email.com', autocomplete: 'email' });
    const senha = el('input', { type: 'password', placeholder: 'sua senha', autocomplete: 'current-password' });
    const aviso = el('div', { class: 'aviso', hidden: true });
    const entrar = el('button', { class: 'btn primary', style: 'width:100%', text: 'Entrar' });

    const erro = (t) => { aviso.textContent = t; aviso.hidden = false; };

    const tentar = async () => {
      aviso.hidden = true;
      if (!/.+@.+\..+/.test(email.value)) return erro('Confira o e-mail.');
      if (!senha.value) return erro('Digite a senha.');

      entrar.disabled = true;
      entrar.textContent = 'entrando…';
      try {
        await sb.signIn(email.value.trim(), senha.value);
        palco.remove();
        pronto(true);
      } catch (err) {
        entrar.disabled = false;
        entrar.textContent = 'Entrar';
        const msg = String(err?.message || err);
        // Cada recusa tem um motivo diferente, e mandar todas como "não deu"
        // faz a pessoa tentar a mesma senha cinco vezes.
        if (/not confirmed|Email not confirmed/i.test(msg)) {
          erro('Sua conta ainda não foi aprovada, ou o e-mail de confirmação ainda não foi aberto. Fale com quem te convidou.');
        } else if (/banned|user is banned/i.test(msg)) {
          erro('Este acesso está bloqueado. Fale com quem administra o JARBAS.');
        } else if (/Invalid login|invalid_credentials|invalid_grant/i.test(msg)) {
          erro('E-mail ou senha não conferem.');
        } else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
          erro('Sem conexão para entrar agora. O login precisa de internet uma vez; depois disso o app abre offline neste aparelho.');
        } else {
          erro(msg);
        }
      }
    };

    for (const campo of [email, senha]) {
      campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') tentar(); });
    }
    entrar.addEventListener('click', tentar);

    palco.append(marca(), el('div', { class: 'porta-caixa' },
      el('h1', { class: 'porta-titulo', text: 'Entrar' }),
      el('p', { class: 'muted', style: 'margin-top:0', text: 'O JARBAS abre depois que ele souber quem é você.' }),
      el('div', { class: 'field' }, el('label', { text: 'E-mail' }), email),
      el('div', { class: 'field' }, el('label', { text: 'Senha' }), senha),
      aviso,
      entrar,
      el('p', { class: 'tiny dim', style: 'margin-bottom:0', text: 'Recebeu um convite? Abra o link que te mandaram — a conta se cria por lá.' })));

    setTimeout(() => email.focus(), 60);
  });
}

/* ---------- já criou, agora espera ---------- */

export function esperandoAval(palco, email, pronto) {
  palco.innerHTML = '';
  palco.append(marca());

  const senha = el('input', { type: 'password', placeholder: 'sua senha', autocomplete: 'current-password' });
  const aviso = el('div', { class: 'aviso', hidden: true });
  const entrar = el('button', { class: 'btn primary', style: 'width:100%', text: 'Já confirmei — entrar' });

  entrar.addEventListener('click', async () => {
    aviso.hidden = true;
    entrar.disabled = true;
    entrar.textContent = 'entrando…';
    try {
      await sb.signIn(email, senha.value);
      pronto(true);
    } catch (err) {
      entrar.disabled = false;
      entrar.textContent = 'Já confirmei — entrar';
      const msg = String(err.message || err);
      aviso.textContent = /not confirmed|Email not confirmed/i.test(msg)
        ? 'O e-mail ainda não foi confirmado. Ou quem te convidou não aprovou, ou a mensagem ainda não chegou — confira também a caixa de spam.'
        : msg;
      aviso.hidden = false;
    }
  });
  senha.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar.click(); });

  palco.append(el('div', { class: 'porta-caixa' },
    el('h1', { class: 'porta-titulo', text: 'Conta criada' }),
    el('p', { class: 'muted', style: 'margin-top:0' },
      'Agora falta o aval de quem te convidou. Quando ele aprovar, chega um e-mail de confirmação em ',
      el('strong', { text: email }),
      ' — clique no link de lá e volte aqui.'),
    el('div', { class: 'field' }, el('label', { text: 'Senha' }), senha),
    aviso,
    entrar,
    el('p', { class: 'tiny dim', style: 'margin-bottom:0', text: 'Pode fechar esta página. O endereço continua o mesmo quando você voltar.' })));
}

/* ---------- a primeira conversa: sobre você, e as notícias ---------- */

/**
 * O que o JARBAS pergunta antes de qualquer outra coisa.
 *
 * Ele existe para saber de quem está do outro lado — sem isso as respostas
 * saem genéricas, que é o mesmo que não ter assistente nenhum. Duas telas só,
 * e as duas puláveis: obrigar alguém a escrever sobre si para poder abrir o
 * app é o tipo de portaria que faz a pessoa inventar qualquer coisa.
 */
export function primeirasPerguntas(quandoTerminar) {
  const palco = el('div', { class: 'porta' });
  document.body.append(palco);

  const fim = async (dados) => {
    if (dados) await settings.set(dados);
    await settings.set({ boasVindas: false });
    palco.remove();
    quandoTerminar?.();
  };

  passoSobreMim(palco, fim);
  return palco;
}

function passoSobreMim(palco, fim) {
  const texto = el('textarea', {
    rows: 9,
    placeholder: 'Ex.: Tenho 37 anos, moro no Recife, sou músico e trabalho com produção de eventos. '
      + 'Sou casado e tenho uma filha. Gravo vídeos de manhã e reservo as noites para estudar.',
  });
  const nome = el('input', { type: 'text', placeholder: 'Como você quer ser chamado' });
  nome.value = settings.get('name') || '';

  const seguir = el('button', { class: 'btn primary', style: 'width:100%', text: 'Continuar' });
  seguir.addEventListener('click', () => {
    passoNoticias(palco, fim, { name: nome.value.trim(), perfil: texto.value.trim() });
  });

  palco.innerHTML = '';
  palco.append(marca(), el('div', { class: 'porta-caixa' },
    el('div', { class: 'porta-passo', text: 'primeiro de dois' }),
    el('h1', { class: 'porta-titulo', text: 'Sobre você' }),
    el('p', { class: 'muted', style: 'margin-top:0', text: 'Escreva como se estivesse contando a um assistente novo quem você é. Não precisa caprichar: é isto que faz a diferença entre uma resposta genérica e uma resposta sua, e dá para mudar depois em Ajustes.' }),
    el('div', { class: 'field' }, el('label', { text: 'Nome' }), nome),
    el('div', { class: 'field' }, el('label', { text: 'Quem é você' }), texto),
    seguir,
    el('button', { class: 'btn', style: 'width:100%;margin-top:8px', text: 'Depois', onclick: () => passoNoticias(palco, fim, { name: nome.value.trim() }) })));
  setTimeout(() => nome.focus(), 60);
}

function passoNoticias(palco, fim, acumulado) {
  const temas = el('textarea', {
    rows: 7, spellcheck: 'false',
    placeholder: 'Um assunto por linha: Rótulo | busca',
  });
  temas.value = settings.get('noticiasTemas')?.trim() || TEMAS_SUGERIDOS;

  const hora = el('input', { type: 'time' });
  hora.value = settings.get('noticiasHora') || '08:00';

  const concluir = el('button', { class: 'btn primary', style: 'width:100%', text: 'Terminar' });
  concluir.addEventListener('click', () => fim({
    ...acumulado,
    noticiasTemas: temas.value.trim(),
    noticiasHora: hora.value || '08:00',
  }));

  palco.innerHTML = '';
  palco.append(marca(), el('div', { class: 'porta-caixa' },
    el('div', { class: 'porta-passo', text: 'segundo de dois' }),
    el('h1', { class: 'porta-titulo', text: 'Suas notícias' }),
    el('p', { class: 'muted', style: 'margin-top:0', text: 'O JARBAS busca as manchetes uma vez por dia e traz no Painel. Cada linha é um assunto: o rótulo antes da barra, a busca depois. Aspas prendem a expressão e OR soma.' }),
    el('div', { class: 'field' }, el('label', { text: 'Assuntos' }), temas),
    el('div', { class: 'field' }, el('label', { text: 'A partir de que horas' }), hora),
    concluir,
    el('button', { class: 'btn', style: 'width:100%;margin-top:8px', text: 'Depois', onclick: () => fim(acumulado) })));
}

const TEMAS_SUGERIDOS = [
  'Mundo |',
  'Brasil | Brasil política OR economia when:2d',
  'Tecnologia | inteligência artificial when:3d',
].join('\n');
