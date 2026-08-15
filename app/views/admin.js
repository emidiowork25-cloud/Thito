// ADMIN — quem entra no JARBAS, e com o quê.
//
// Esta tela é um painel de controle remoto: ela mostra o que o servidor
// responde e manda pedidos de volta. Nenhuma decisão acontece aqui. Se
// acontecesse, bastaria abrir o console do navegador para se autopromover — e
// é por isso que aprovar, bloquear e remover vivem na Edge Function `admin`,
// que confere no JWT quem está pedindo antes de mexer em qualquer coisa.
//
// A tranca de verdade não é nem a função: é o próprio Supabase. A conta do
// convidado nasce com o e-mail não confirmado, e usuário não confirmado não faz
// login. Aprovar é mandar o e-mail de confirmação. Enquanto isso não acontece,
// não existe sessão para ele em aparelho nenhum.

import * as contas from '../core/contas.js';
import * as settings from '../core/settings.js';
import * as sb from '../core/supabase.js';
// VIEWS vem do shell, que por sua vez importa esta tela. O ciclo é seguro
// porque nada aqui em cima toca em VIEWS: quando `render` roda, o shell já
// terminou de ser avaliado e a ligação está viva.
import { VIEWS } from '../ui/shell.js';
import { emit } from '../core/bus.js';
import { el, fmtDate, truncate } from '../core/util.js';
import { sectionCard, emptyState, confirmDialog, modal, toast } from '../ui/components.js';

let dados = null;        // { contas, convites, superAdmin }
let carregando = false;
let falha = '';

/** Os módulos que dá para conceder. Painel e Ajustes não entram: são de todos. */
const concedíveis = () => Object.entries(VIEWS)
  .filter(([id]) => !contas.SEMPRE.includes(id) && id !== 'admin')
  .map(([id, v]) => ({ id, title: v.title, icon: v.icon }));

/* ============================ tela ============================ */

export function render(root) {
  if (!settings.isCloudConfigured() || !sb.isSignedIn()) {
    return root.append(el('div', { class: 'card cofre-aviso' },
      el('h2', { text: 'O ADMIN precisa da nuvem' }),
      el('p', { class: 'muted', text: 'Convidar alguém significa criar uma conta no seu projeto Supabase. Configure a nuvem e entre na sua conta em Ajustes › Nuvem.' })));
  }

  if (!contas.souSuperAdmin()) {
    return root.append(el('div', { class: 'card cofre-aviso' },
      el('h2', { text: 'Esta área é do super admin' }),
      el('p', { class: 'muted', text: 'Só a primeira conta do sistema inclui e exclui pessoas. Se você acha que deveria ver isto, fale com quem te convidou.' })));
  }

  if (dados === null) {
    if (!carregando) {
      carregando = true;
      falha = '';
      contas.listar()
        .then((r) => { dados = r; })
        .catch((err) => { falha = contas.explicar(err); dados = { contas: [], convites: [] }; })
        .finally(() => { carregando = false; emit('nav:refresh'); });
    }
    return root.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: 'Consultando o servidor…' })));
  }

  root.append(el('div', { class: 'toolbar' },
    el('button', { class: 'btn primary sm', text: '+ Convidar alguém', onclick: () => novoConvite() }),
    el('button', { class: 'btn sm', text: 'Atualizar', onclick: () => { dados = null; emit('nav:refresh'); } }),
    el('div', { class: 'spacer' }),
    el('span', { class: 'pill ok', text: 'você é o super admin' }),
  ));

  if (falha) root.append(el('div', { class: 'aviso', style: 'margin-bottom:14px' }, falha, semServidor()));

  const pendentes = (dados.contas ?? []).filter((c) => c.estado === 'pendente');
  const ativos = (dados.contas ?? []).filter((c) => c.estado === 'aprovado');
  const bloqueados = (dados.contas ?? []).filter((c) => c.estado === 'bloqueado');

  root.append(el('div', { class: 'grid admin-grid' },
    el('div', { class: 'grid', style: 'align-content:start' },
      cartaoPendentes(pendentes),
      cartaoGente('Com acesso', ativos, 'Ninguém entrou ainda.'),
      bloqueados.length ? cartaoGente('Bloqueados', bloqueados, '') : null,
    ),
    el('div', { class: 'grid', style: 'align-content:start' },
      cartaoConvites(dados.convites ?? []),
      cartaoComoFunciona(),
    )));
}

/** O recado que separa "está quebrado" de "ainda não foi instalado". */
function semServidor() {
  if (!/admin.*não foi publicada|404/i.test(falha)) return null;
  return el('div', { class: 'tiny', style: 'margin-top:8px' },
    'Falta publicar a função no seu projeto. O passo a passo está no README, em "ADMIN".');
}

/* ---------- pendentes: o coração da regra de ouro ---------- */

function cartaoPendentes(lista) {
  const body = el('div');

  if (!lista.length) {
    body.append(el('p', { class: 'tiny dim', style: 'margin:0', text: 'Ninguém esperando. Quando alguém criar a conta pelo seu link, aparece aqui para você aprovar.' }));
    return sectionCard('Esperando aprovação', null, body);
  }

  for (const c of lista) {
    const escolhidos = new Set(c.modulos ?? []);
    const caixa = el('div', { class: 'admin-pessoa' },
      el('div', { class: 'admin-pessoa-topo' },
        el('div', {},
          el('div', { class: 'admin-nome', text: c.nome || '(sem nome)' }),
          el('div', { class: 'tiny dim', text: c.email })),
        el('span', { class: 'pill warn', text: 'pendente' })),
      el('div', { class: 'tiny dim', style: 'margin:6px 0 8px', text: `criou a conta em ${fmtDate(String(c.criado_em).slice(0, 10))}${c.convite ? ` · convite ${c.convite}` : ''}` }),
      seletorDeModulos(escolhidos),
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('button', {
          class: 'btn primary sm', text: '✓ Aprovar e enviar o e-mail',
          onclick: async (e) => {
            e.target.disabled = true;
            try {
              const r = await contas.aprovar(c.user_id, [...escolhidos]);
              toast(r.email_enviado
                ? `${c.nome || c.email} aprovado. O e-mail de confirmação saiu.`
                : 'Aprovado, mas o e-mail NÃO saiu. Veja o cartão “Como funciona”.', r.email_enviado ? 'ok' : 'warn', 7000);
              if (!r.email_enviado && r.email_erro) console.warn('[admin] e-mail:', r.email_erro);
              dados = null;
              emit('nav:refresh');
            } catch (err) {
              e.target.disabled = false;
              toast(contas.explicar(err), 'bad');
            }
          },
        }),
        el('button', {
          class: 'btn sm danger', text: 'Recusar',
          onclick: () => removerPessoa(c, 'Recusar o cadastro de'),
        })),
    );
    body.append(caixa);
  }

  return sectionCard(`Esperando aprovação (${lista.length})`, null, body,
    el('div', { class: 'tiny dim', style: 'margin-top:10px', text: 'Até você aprovar, essa pessoa não consegue entrar — o e-mail dela não está confirmado, e o Supabase recusa o login. Não é uma tela escondida: é a porta fechada.' }));
}

/* ---------- quem já está dentro ---------- */

function cartaoGente(titulo, lista, vazio) {
  const body = el('div');
  if (!lista.length) {
    if (!vazio) return null;
    body.append(el('p', { class: 'tiny dim', style: 'margin:0', text: vazio }));
    return sectionCard(titulo, null, body);
  }

  for (const c of lista) {
    const quantos = (c.modulos ?? []).length;
    body.append(el('div', { class: 'admin-pessoa' },
      el('div', { class: 'admin-pessoa-topo' },
        el('div', {},
          el('div', { class: 'admin-nome', text: c.nome || c.email }),
          el('div', { class: 'tiny dim', text: c.email })),
        el('span', { class: `pill ${c.estado === 'bloqueado' ? 'bad' : 'ok'}`, text: c.estado })),
      el('div', { class: 'tiny dim', style: 'margin:6px 0 8px', text: `${quantos} módulo${quantos === 1 ? '' : 's'}: ${(c.modulos ?? []).map((m) => VIEWS[m]?.title ?? m).join(', ') || 'nenhum'}` }),
      el('div', { class: 'row' },
        el('button', { class: 'btn sm', text: 'Módulos', onclick: () => editarModulos(c) }),
        el('button', { class: 'btn sm', text: 'Reenviar e-mail', onclick: () => reenviar(c) }),
        c.estado === 'bloqueado'
          ? el('button', { class: 'btn sm', text: 'Desbloquear', onclick: () => acao(() => contas.desbloquear(c.user_id), 'Desbloqueado.') })
          : el('button', { class: 'btn sm', text: 'Bloquear', onclick: () => acao(() => contas.bloquear(c.user_id), 'Bloqueado. A sessão dele cai.') }),
        el('button', { class: 'btn sm danger', text: 'Remover', onclick: () => removerPessoa(c, 'Remover') }),
      )));
  }
  return sectionCard(`${titulo} (${lista.length})`, null, body);
}

/* ---------- convites ---------- */

function cartaoConvites(lista) {
  const abertos = lista.filter((c) => c.usos < c.max_usos && (!c.expira_em || new Date(c.expira_em) > new Date()));
  const body = el('div');

  if (!abertos.length) {
    body.append(emptyState('Nenhum convite em aberto.', '+ Convidar alguém', () => novoConvite()));
    return sectionCard('Convites', null, body);
  }

  for (const c of abertos) {
    const url = linkDoConvite(c.codigo);
    body.append(el('div', { class: 'admin-convite' },
      el('div', { class: 'admin-pessoa-topo' },
        el('code', { class: 'admin-codigo', text: c.codigo }),
        el('span', { class: 'tiny dim', text: c.expira_em ? `vence em ${fmtDate(String(c.expira_em).slice(0, 10))}` : 'sem prazo' })),
      c.anotacao ? el('div', { class: 'tiny dim', style: 'margin-top:4px', text: truncate(c.anotacao, 60) }) : null,
      el('div', { class: 'tiny dim', style: 'margin:4px 0 8px', text: `${(c.modulos ?? []).length} módulo(s) · ${c.usos}/${c.max_usos} usado(s)` }),
      el('div', { class: 'row' },
        el('button', {
          class: 'btn sm', text: 'Copiar link',
          onclick: async () => {
            try { await navigator.clipboard.writeText(url); toast('Link copiado.', 'ok'); }
            catch { mostrarLink(url); }
          },
        }),
        el('button', { class: 'btn sm', text: 'Ver link', onclick: () => mostrarLink(url) }))));
  }

  return sectionCard(`Convites (${abertos.length})`, [
    el('button', { class: 'btn sm', text: '+ novo', onclick: () => novoConvite() }),
  ], body);
}

const linkDoConvite = (codigo) =>
  `${location.origin}${location.pathname.replace(/[^/]*$/, '')}?convite=${encodeURIComponent(codigo)}`;

function mostrarLink(url) {
  const campo = el('input', { type: 'text', value: url, readonly: true, class: 'mono tiny' });
  campo.addEventListener('focus', () => campo.select());
  modal({
    title: 'Link do convite',
    render: () => el('div', {},
      el('p', { class: 'tiny dim', text: 'Mande este link para a pessoa. Ela vai encontrar a tela “Crie sua conta”. Depois disso, o cadastro fica esperando o seu aval.' }),
      el('div', { class: 'field' }, campo)),
  });
  setTimeout(() => campo.select(), 60);
}

/* ---------- criar convite ---------- */

function novoConvite() {
  const escolhidos = new Set();
  const anotacao = el('input', { type: 'text', placeholder: 'Para quem é este convite? (só você vê)' });
  const dias = el('input', { type: 'number', min: 1, max: 90, value: 14 });

  const corpo = el('div', {},
    el('p', { class: 'tiny dim', style: 'margin-top:0', text: 'Escolha agora o que essa pessoa vai poder abrir. A lista fica guardada no servidor, junto do código — o link não carrega os módulos, então não adianta editar a URL.' }),
    el('div', { class: 'field' }, el('label', { text: 'Anotação' }), anotacao),
    el('div', { class: 'field' }, el('label', { text: 'Vence em (dias)' }), dias),
    el('label', { class: 'tiny dim', style: 'display:block;margin-bottom:6px', text: 'Módulos liberados' }),
    seletorDeModulos(escolhidos),
  );

  modal({
    title: 'Convidar alguém',
    wide: true,
    render: () => corpo,
    footer: (fechar) => [
      el('button', { class: 'btn', text: 'Cancelar', onclick: () => fechar() }),
      el('button', {
        class: 'btn primary', text: 'Gerar o link',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await contas.criarConvite({
              modulos: [...escolhidos],
              anotacao: anotacao.value.trim(),
              dias: Number(dias.value) || 14,
            });
            fechar();
            dados = null;
            emit('nav:refresh');
            mostrarLink(linkDoConvite(r.codigo));
          } catch (err) {
            e.target.disabled = false;
            toast(contas.explicar(err), 'bad');
          }
        },
      }),
    ],
  });
}

/** A grade de caixinhas de módulo, usada no convite e na edição. */
function seletorDeModulos(escolhidos) {
  const grade = el('div', { class: 'admin-modulos' });
  for (const mod of concedíveis()) {
    const caixa = el('input', { type: 'checkbox' });
    caixa.checked = escolhidos.has(mod.id);
    caixa.addEventListener('change', () => {
      if (caixa.checked) escolhidos.add(mod.id);
      else escolhidos.delete(mod.id);
    });
    grade.append(el('label', { class: 'admin-modulo' }, caixa,
      el('span', { class: 'admin-modulo-ico', text: mod.icon }),
      el('span', { text: mod.title })));
  }
  return grade;
}

/* ---------- ações ---------- */

function editarModulos(c) {
  const escolhidos = new Set(c.modulos ?? []);
  modal({
    title: `Módulos de ${c.nome || c.email}`,
    wide: true,
    render: () => el('div', {},
      el('p', { class: 'tiny dim', style: 'margin-top:0', text: 'Vale na próxima vez que o app dela abrir ou sincronizar. Painel e Ajustes são de todo mundo e não aparecem aqui.' }),
      seletorDeModulos(escolhidos)),
    footer: (fechar) => [
      el('button', { class: 'btn', text: 'Cancelar', onclick: () => fechar() }),
      el('button', {
        class: 'btn primary', text: 'Salvar',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            await contas.trocarModulos(c.user_id, [...escolhidos]);
            fechar();
            toast('Módulos atualizados.', 'ok');
            dados = null;
            emit('nav:refresh');
          } catch (err) { e.target.disabled = false; toast(contas.explicar(err), 'bad'); }
        },
      }),
    ],
  });
}

async function reenviar(c) {
  try {
    await contas.reenviar(c.email);
    toast('E-mail de confirmação reenviado.', 'ok');
  } catch (err) { toast(contas.explicar(err), 'bad'); }
}

async function removerPessoa(c, verbo) {
  const ok = await confirmDialog(
    `${verbo} ${c.nome || c.email}? A conta e TUDO o que ela guardou no JARBAS são apagados, e isso não volta.`,
    { danger: true, okLabel: verbo },
  );
  if (!ok) return;
  await acao(() => contas.remover(c.user_id), 'Removido.');
}

async function acao(fn, sucesso) {
  try {
    await fn();
    toast(sucesso, 'ok');
    dados = null;
    emit('nav:refresh');
  } catch (err) { toast(contas.explicar(err), 'bad'); }
}

/* ---------- o que o dono precisa saber ---------- */

function cartaoComoFunciona() {
  const linha = (n, texto) => el('div', { class: 'admin-passo' },
    el('span', { class: 'admin-passo-n', text: String(n) }), el('span', { text: texto }));

  return sectionCard('Como funciona', null,
    linha(1, 'Você gera um link e escolhe, aqui, os módulos daquela pessoa.'),
    linha(2, 'Ela abre o link e encontra “Crie sua conta”.'),
    linha(3, 'A conta nasce pendente. Ela ainda NÃO entra: o e-mail não está confirmado e o Supabase recusa o login.'),
    linha(4, 'Você aprova nesta tela. Aí o e-mail de confirmação sai.'),
    linha(5, 'Ela clica no e-mail, entra, e o JARBAS abre vazio — pedindo o “Sobre mim” e as notícias.'),
    el('div', { class: 'aviso', style: 'margin-top:12px' },
      el('strong', { text: 'Sobre o e-mail: ' }),
      'quem envia é o seu projeto Supabase. O remetente embutido dele só manda umas poucas mensagens por hora e, em projetos novos, só para o seu próprio endereço. '
      + 'Para convidar gente de verdade, configure um SMTP em Authentication › Emails no painel do Supabase. Sem isso a aprovação funciona, mas a pessoa não recebe o aviso — e você pode usar “Reenviar e-mail” depois de configurar.'),
    el('div', { class: 'tiny dim', style: 'margin-top:10px' },
      'Os dados de cada pessoa ficam separados por conta no banco, então ninguém enxerga o que é seu. '
      + 'A lista de módulos decide o que ela vê no menu; o que a protege de verdade é a separação por conta, que é do banco e não desta tela.'));
}

/* ---------- ciclo ---------- */

export function invalidar() { dados = null; }
