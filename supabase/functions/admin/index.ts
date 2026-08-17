// Edge Function "admin" — a autoridade do JARBAS.
//
// Tudo o que decide QUEM entra passa por aqui, e por um motivo só: no navegador
// não existe autoridade. Quem abre o app é dono do JavaScript que roda nele, e
// um `if (souAdmin)` do lado de lá é um texto na tela, não uma tranca. Aqui a
// chave de serviço fica num segredo do projeto, o JWT de quem pede é conferido
// com o servidor de autenticação, e só então alguma coisa acontece.
//
// O portão de verdade é o do próprio Supabase, não o meu: a conta nasce com o
// e-mail NÃO confirmado, e usuário não confirmado não faz login. Aprovar é
// mandar o e-mail de confirmação. Enquanto o admin não aprovar, não há sessão
// para ninguém — nem editando o navegador, porque a recusa vem do GoTrue.
//
// IMPORTANTE: o "Verify JWT" desta função tem de ficar DESLIGADO. Duas ações
// acontecem antes de existir conta (ver o convite e criar a conta), e com ele
// ligado o portal recusa a chamada antes de a função rodar. A conferência de
// quem pede é feita aqui dentro, ação por ação.
//
// E o nome que vale é o SLUG, não o rótulo. Criando pelo painel, o Supabase
// sorteia um slug (do tipo "rapid-responder") e o campo que você digita é só o
// nome de exibição — a URL continua sendo a do slug. O app chama
// /functions/v1/admin, então o slug precisa ser exatamente `admin`.
//
// Segredos necessários:
//   supabase secrets set SUPER_ADMIN_ID=<uuid do primeiro usuário>   (opcional)
//   supabase secrets set SITE_URL=https://…                          (opcional)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente da função.
//
// Deploy:  supabase functions deploy admin --no-verify-jwt

const URL_BASE = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPER_ADMIN_FIXO = (Deno.env.get('SUPER_ADMIN_ID') ?? '').trim();
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Chamada à API do próprio projeto com a chave de serviço. */
async function comServico(caminho: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_BASE}${caminho}`, {
    ...init,
    headers: {
      apikey: SERVICO,
      Authorization: `Bearer ${SERVICO}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const texto = await res.text();
  let corpo: any = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  if (!res.ok) {
    const msg = corpo?.msg || corpo?.message || corpo?.error_description || corpo?.error || `Erro ${res.status}`;
    throw new Error(String(msg));
  }
  return corpo;
}

/**
 * Quem está pedindo, segundo o servidor de autenticação — e não segundo o que
 * o navegador afirma. É a diferença entre conferir um documento e acreditar em
 * quem diz o próprio nome.
 */
async function quemPede(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) throw new Error('SEM_SESSAO');

  const res = await fetch(`${URL_BASE}/auth/v1/user`, {
    headers: { apikey: SERVICO, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('SEM_SESSAO');
  return await res.json();
}

/**
 * O super admin, em três degraus — do dito ao deduzido.
 *
 * 1. O segredo SUPER_ADMIN_ID, se estiver posto: é ele e ponto.
 * 2. A coluna contas.super_admin: escrita só pela chave de serviço, com índice
 *    único que garante um dono por vez.
 * 3. Só então a dedução, para o projeto recém-nascido que ainda não tem nem
 *    linha na tabela.
 *
 * A ordem tem uma cicatriz. Antes só existia o degrau 3, e ele dizia "o usuário
 * mais antigo" — que parece a mesma coisa que "o primeiro usuário" e não é.
 * Neste projeto havia um cadastro abandonado, criado onze minutos antes do bom e
 * nunca confirmado: ele era o mais antigo e virou o dono. O ADMIN sumiu do menu
 * de quem construiu a casa, e o poder ficou com uma conta que não consegue nem
 * fazer login. Dedução serve para começar; para mandar, é preciso estar escrito.
 *
 * O degrau 3 ficou mais cuidadoso pelo mesmo motivo: prefere quem REALMENTE
 * ENTROU. Um super admin que não consegue entrar não é super admin, é um cadeado
 * com a chave dentro. Se ninguém entrou ainda, vale o mais antigo mesmo — um
 * projeto novo precisa de dono desde o primeiro minuto.
 */
type Usuario = {
  id: string;
  created_at: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

let superAdminCache = '';
async function superAdminId(): Promise<string> {
  if (SUPER_ADMIN_FIXO) return SUPER_ADMIN_FIXO;
  if (superAdminCache) return superAdminCache;

  // O que está escrito na tabela vale mais do que qualquer conclusão minha.
  try {
    const marcados = await comServico('/rest/v1/contas?super_admin=is.true&select=user_id&limit=1');
    if (marcados?.[0]?.user_id) {
      superAdminCache = String(marcados[0].user_id);
      return superAdminCache;
    }
  } catch { /* tabela ainda sem a coluna: cai na dedução */ }

  const lista = await comServico('/auth/v1/admin/users?page=1&per_page=1000');
  const usuarios = (lista?.users ?? []) as Usuario[];
  if (!usuarios.length) return '';

  const entrou = (u: Usuario) => !!(u.email_confirmed_at || u.confirmed_at || u.last_sign_in_at);
  const candidatos = usuarios.filter(entrou);
  const fila = candidatos.length ? candidatos : usuarios;

  fila.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  superAdminCache = fila[0].id;
  return superAdminCache;
}

const exigirAdmin = async (req: Request) => {
  const usuario = await quemPede(req);
  const chefe = await superAdminId();
  if (!chefe || usuario.id !== chefe) throw new Error('NAO_E_ADMIN');
  return usuario;
};

/* ---------------------------------------------------------------- ações */

const CODIGO_ALFA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function novoCodigo(tamanho = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  return [...bytes].map((b) => CODIGO_ALFA[b % CODIGO_ALFA.length]).join('');
}

/** Só o admin: cria um convite com a lista de módulos já decidida. */
async function criarConvite(req: Request, corpo: any) {
  const admin = await exigirAdmin(req);
  const codigo = novoCodigo();
  const modulos: string[] = Array.isArray(corpo.modulos) ? corpo.modulos.map(String) : [];
  const dias = Number(corpo.dias) > 0 ? Number(corpo.dias) : 14;

  await comServico('/rest/v1/convites', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      codigo,
      modulos,
      criado_por: admin.id,
      anotacao: String(corpo.anotacao ?? ''),
      max_usos: Number(corpo.max_usos) > 0 ? Number(corpo.max_usos) : 1,
      expira_em: new Date(Date.now() + dias * 86400_000).toISOString(),
    }),
  });

  return json({ codigo });
}

/**
 * Só o admin: a lista de contas e a de convites em aberto.
 *
 * O próprio dono fica de fora da lista. Ele não é um convidado à espera de
 * aprovação, e a única coisa que ganharia aparecendo ali seriam botões de
 * bloquear e remover apontados para si mesmo.
 */
async function listar(req: Request) {
  await exigirAdmin(req);
  const chefe = await superAdminId();
  const todas = await comServico('/rest/v1/contas?select=*&order=criado_em.desc');
  const contas = (todas ?? []).filter((c: any) => c.user_id !== chefe);
  const convites = await comServico('/rest/v1/convites?select=*&order=criado_em.desc&limit=50');
  return json({ contas, convites, superAdmin: chefe });
}

/**
 * Aberto a quem tem o código: cria a conta, PENDENTE e sem e-mail confirmado.
 *
 * `email_confirm: false` é a aprovação inteira. Sem confirmação, o GoTrue
 * recusa o login — então a conta existe, aparece para o admin e não abre porta
 * nenhuma até ele aprovar.
 */
async function criarConta(corpo: any) {
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const senha = String(corpo.senha ?? '');
  const codigo = String(corpo.codigo ?? '').trim().toUpperCase();
  const nome = String(corpo.nome ?? '').trim();

  if (!email || !senha) throw new Error('Informe e-mail e senha.');
  if (senha.length < 8) throw new Error('A senha precisa de pelo menos 8 caracteres.');
  if (!codigo) throw new Error('CONVITE_INVALIDO');

  const achados = await comServico(`/rest/v1/convites?codigo=eq.${encodeURIComponent(codigo)}&select=*`);
  const convite = achados?.[0];
  if (!convite) throw new Error('CONVITE_INVALIDO');
  if (convite.expira_em && new Date(convite.expira_em) < new Date()) throw new Error('CONVITE_EXPIRADO');
  if (convite.usos >= convite.max_usos) throw new Error('CONVITE_USADO');

  const criado = await comServico('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: false,          // é isto que segura a porta até a aprovação
      user_metadata: { nome, convite: codigo },
    }),
  });

  await comServico('/rest/v1/contas', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: criado.id,
      email,
      nome,
      estado: 'pendente',
      modulos: convite.modulos ?? [],
      convite: codigo,
    }),
  });

  await comServico(`/rest/v1/convites?codigo=eq.${encodeURIComponent(codigo)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ usos: (convite.usos ?? 0) + 1 }),
  });

  return json({ ok: true, estado: 'pendente' });
}

/**
 * Manda a mensagem de "você foi liberado" — com um plano B que não depende de
 * e-mail nenhum.
 *
 * O caminho bonito é `/auth/v1/invite`: ele confirma o endereço quando a pessoa
 * clica e manda a mensagem pelo SMTP do projeto. Só que ele foi feito para
 * convidar quem AINDA NÃO EXISTE, e aqui a conta já existe — ela foi criada no
 * cadastro, de propósito, para nascer pendente. Dependendo da versão do GoTrue
 * isso volta como "email_exists", e aí a aprovação ficaria gravada com a pessoa
 * sem receber nada e sem ninguém saber.
 *
 * Então: tenta o convite; se ele recusar, confirma o endereço na marra e gera
 * um link de entrada para o admin mandar pelo canal que quiser. A aprovação
 * nunca fica pela metade, e o que aconteceu volta dito, não suposto.
 */
async function avisarLiberado(id: string, email: string) {
  try {
    await comServico('/auth/v1/invite', {
      method: 'POST',
      body: JSON.stringify({ email, ...(SITE ? { redirect_to: SITE } : {}) }),
    });
    return { email_enviado: true, email_erro: '', link: '' };
  } catch (err) {
    const motivo = String((err as Error).message ?? err);

    // Plano B: libera de verdade e devolve um link. Confirmar aqui não afrouxa
    // a regra de ouro — quem está confirmando é o admin, no ato de aprovar.
    let link = '';
    try {
      await comServico(`/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ email_confirm: true }),
      });
      const gerado = await comServico('/auth/v1/admin/generate_link', {
        method: 'POST',
        body: JSON.stringify({ type: 'magiclink', email, ...(SITE ? { redirect_to: SITE } : {}) }),
      });
      link = gerado?.action_link ?? gerado?.properties?.action_link ?? '';
    } catch { /* sem link: a conta já está liberada, ela entra com a senha */ }

    return { email_enviado: false, email_erro: motivo, link };
  }
}

/** Só o admin: aprova, e a pessoa é avisada. */
async function aprovar(req: Request, corpo: any) {
  await exigirAdmin(req);
  const id = String(corpo.user_id ?? '');
  const conta = (await comServico(`/rest/v1/contas?user_id=eq.${id}&select=*`))?.[0];
  if (!conta) throw new Error('Conta não encontrada.');

  if (Array.isArray(corpo.modulos)) {
    await comServico(`/rest/v1/contas?user_id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ modulos: corpo.modulos.map(String) }),
    });
  }

  await comServico(`/rest/v1/contas?user_id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ estado: 'aprovado', aprovado_em: new Date().toISOString() }),
  });

  return json({ ok: true, ...(await avisarLiberado(id, conta.email)) });
}

/** Só o admin: tenta de novo avisar quem já foi aprovado. */
async function reenviar(req: Request, corpo: any) {
  await exigirAdmin(req);
  const email = String(corpo.email ?? '').trim().toLowerCase();
  if (!email) throw new Error('Informe o e-mail.');
  const conta = (await comServico(`/rest/v1/contas?email=eq.${encodeURIComponent(email)}&select=user_id`))?.[0];
  return json({ ok: true, ...(await avisarLiberado(conta?.user_id ?? '', email)) });
}

/**
 * Só o admin: bloqueia sem apagar nada.
 *
 * Menos a si mesmo. Banir o dono no GoTrue não tem desfazer pela tela — a tela
 * de desbloquear só existe para quem consegue entrar, e ele não conseguiria
 * mais. Seria preciso mexer no banco por fora para voltar atrás, e um clique
 * não pode custar isso.
 */
async function bloquear(req: Request, corpo: any) {
  const admin = await exigirAdmin(req);
  const id = String(corpo.user_id ?? '');
  if (id === admin.id) throw new Error('O super admin não pode bloquear a si mesmo.');
  // Banir de verdade no GoTrue: sem isto a sessão que já está aberta no
  // aparelho dela continuaria valendo até o token vencer.
  await comServico(`/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ban_duration: '876000h' }),
  });
  await comServico(`/rest/v1/contas?user_id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ estado: 'bloqueado' }),
  });
  return json({ ok: true });
}

async function desbloquear(req: Request, corpo: any) {
  await exigirAdmin(req);
  const id = String(corpo.user_id ?? '');
  await comServico(`/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ban_duration: 'none' }),
  });
  await comServico(`/rest/v1/contas?user_id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ estado: 'aprovado' }),
  });
  return json({ ok: true });
}

/** Só o admin: troca os módulos de quem já está dentro. */
async function modulos(req: Request, corpo: any) {
  await exigirAdmin(req);
  const id = String(corpo.user_id ?? '');
  await comServico(`/rest/v1/contas?user_id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ modulos: (corpo.modulos ?? []).map(String) }),
  });
  return json({ ok: true });
}

/** Só o admin: apaga a conta e, com ela, todos os registros da pessoa. */
async function remover(req: Request, corpo: any) {
  const admin = await exigirAdmin(req);
  const id = String(corpo.user_id ?? '');
  if (id === admin.id) throw new Error('O super admin não pode remover a si mesmo.');
  // A tabela contas cai por cascata; os records também, pela chave estrangeira.
  await comServico(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  return json({ ok: true });
}

/** Aberto: o que este código de convite libera, para a tela de cadastro mostrar. */
async function verConvite(corpo: any) {
  const codigo = String(corpo.codigo ?? '').trim().toUpperCase();
  const achados = await comServico(`/rest/v1/convites?codigo=eq.${encodeURIComponent(codigo)}&select=modulos,expira_em,usos,max_usos,anotacao`);
  const c = achados?.[0];
  if (!c) throw new Error('CONVITE_INVALIDO');
  if (c.expira_em && new Date(c.expira_em) < new Date()) throw new Error('CONVITE_EXPIRADO');
  if (c.usos >= c.max_usos) throw new Error('CONVITE_USADO');
  return json({ modulos: c.modulos ?? [], anotacao: c.anotacao ?? '' });
}

/** Para qualquer um que esteja logado: a própria conta. */
async function minhaConta(req: Request) {
  const usuario = await quemPede(req);
  const chefe = await superAdminId();
  const achados = await comServico(`/rest/v1/contas?user_id=eq.${usuario.id}&select=*`);
  return json({
    conta: achados?.[0] ?? null,
    souSuperAdmin: usuario.id === chefe,
  });
}

/* ---------------------------------------------------------------- porta */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!SERVICO) return json({ error: 'A função admin está sem a chave de serviço.' }, 500);

  let corpo: any = {};
  try { corpo = await req.json(); } catch { corpo = {}; }
  const acao = String(corpo.acao ?? '');

  try {
    switch (acao) {
      // abertos, porque acontecem antes de existir sessão
      case 'ver-convite':   return await verConvite(corpo);
      case 'criar-conta':   return await criarConta(corpo);
      // exige sessão
      case 'minha-conta':   return await minhaConta(req);
      // exigem ser o super admin
      case 'listar':        return await listar(req);
      case 'criar-convite': return await criarConvite(req, corpo);
      case 'aprovar':       return await aprovar(req, corpo);
      case 'reenviar':      return await reenviar(req, corpo);
      case 'bloquear':      return await bloquear(req, corpo);
      case 'desbloquear':   return await desbloquear(req, corpo);
      case 'modulos':       return await modulos(req, corpo);
      case 'remover':       return await remover(req, corpo);
      default:              return json({ error: `Ação desconhecida: ${acao}` }, 400);
    }
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    const status = msg === 'SEM_SESSAO' ? 401 : msg === 'NAO_E_ADMIN' ? 403 : 400;
    return json({ error: msg }, status);
  }
});
