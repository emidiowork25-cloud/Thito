// Edge Function "rede" — amigos e compartilhamentos do JARBAS.
//
// Tudo o que ESCREVE na rede passa por aqui, e a razão é a mesma do ADMIN: no
// navegador não existe autoridade. As três tabelas da rede não têm nenhuma
// política de escrita, então a chave que o navegador carrega não insere, não
// altera e não apaga nada. Só esta função, com a chave de serviço, e sempre
// depois de conferir no servidor de autenticação quem está pedindo.
//
// As regras que este arquivo faz valer, e por quê:
//
// 1. Ninguém lista os usuários do sistema. Para chamar alguém é preciso saber o
//    e-mail de cadastro dessa pessoa. Não existe ação que devolva "quem existe".
//
// 2. Convidar NUNCA revela se a conta existe. O pedido é gravado pelo e-mail
//    digitado, exista ou não a conta, e a resposta é sempre idêntica. Sem isso o
//    app viraria uma máquina de descobrir cadastros: bastaria testar endereços
//    até um ser aceito.
//
// 3. Só se compartilha com amigo aceito. E o que se entrega é uma CÓPIA — o
//    destinatário nunca alcança os registros de quem compartilhou.
//
// 4. Ninguém fala pelos outros. `dono` e `de_user` saem sempre do JWT conferido,
//    nunca do corpo do pedido. Revogar e cancelar exigem ser a ponta certa.
//
// 5. O super admin não tem privilégio nenhum aqui — e nem precisa. Nesta tela
//    ele é um usuário como os outros; o que ele tem de especial mora na função
//    `admin`, que é outra porta com outra tranca.
//
// Deploy:  supabase functions deploy rede

const URL_BASE = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
    const msg = corpo?.msg || corpo?.message || corpo?.error || `Erro ${res.status}`;
    throw new Error(String(msg));
  }
  return corpo;
}

/** Quem está pedindo, segundo o GoTrue — nunca segundo o corpo do pedido. */
async function quemPede(req: Request) {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) throw new Error('SEM_SESSAO');
  const res = await fetch(`${URL_BASE}/auth/v1/user`, {
    headers: { apikey: SERVICO, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) throw new Error('SEM_SESSAO');
  const u = await res.json();
  if (!u?.id) throw new Error('SEM_SESSAO');
  return { id: String(u.id), email: String(u.email ?? '').toLowerCase() };
}

const limpar = (e: unknown) => String(e ?? '').trim().toLowerCase();
const eh = (v: unknown) => encodeURIComponent(String(v ?? ''));

/**
 * O uuid de quem tem este e-mail — ou vazio.
 *
 * Note que o RESULTADO disto nunca sai daqui em forma de resposta diferente.
 * Ele decide o que acontece por dentro; o que volta para quem perguntou é
 * sempre a mesma frase.
 */
async function idPorEmail(email: string): Promise<string> {
  const achados = await comServico(`/rest/v1/contas?email=eq.${eh(email)}&select=user_id&limit=1`);
  return achados?.[0]?.user_id ?? '';
}

/** As duas pontas de uma amizade aceita, em ordem estável. */
const par = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

async function saoAmigos(a: string, b: string) {
  const [x, y] = par(a, b);
  const r = await comServico(
    `/rest/v1/amizades?a_user=eq.${eh(x)}&b_user=eq.${eh(y)}&select=id&limit=1`,
  );
  return !!r?.[0];
}

/* ---------------------------------------------------------------- ações */

/**
 * Chamar alguém pelo e-mail.
 *
 * A resposta é a mesma em todos os caminhos: conta que existe, conta que não
 * existe, pedido repetido. É de propósito — ver a regra 2 no topo.
 */
async function convidar(req: Request, corpo: any) {
  const eu = await quemPede(req);
  const email = limpar(corpo.email);
  if (!email || !email.includes('@')) throw new Error('EMAIL_INVALIDO');
  if (email === eu.email) throw new Error('VOCE_MESMO');

  const outro = await idPorEmail(email);

  // Já são amigos? Nada a fazer — e a resposta continua igual.
  if (outro && await saoAmigos(eu.id, outro)) return json({ ok: true, enviado: true });

  const jaTem = await comServico(
    `/rest/v1/pedidos_amizade?de_user=eq.${eh(eu.id)}&para_email=eq.${eh(email)}&estado=eq.pendente&select=id&limit=1`,
  );
  if (!jaTem?.[0]) {
    await comServico('/rest/v1/pedidos_amizade', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        de_user: eu.id,
        para_email: email,
        recado: String(corpo.recado ?? '').slice(0, 280),
      }),
    });
  }
  return json({ ok: true, enviado: true });
}

/** O que eu tenho: amigos, pedidos que mandei e pedidos que chegaram para mim. */
async function minhaRede(req: Request) {
  const eu = await quemPede(req);

  const amizades = await comServico(
    `/rest/v1/amizades?or=(a_user.eq.${eh(eu.id)},b_user.eq.${eh(eu.id)})&select=*`,
  );
  const outros = (amizades ?? []).map((a: any) => (a.a_user === eu.id ? a.b_user : a.a_user));

  // Só o nome e o e-mail de quem já é meu amigo. Nada de varrer a tabela.
  let pessoas: any[] = [];
  if (outros.length) {
    pessoas = await comServico(
      `/rest/v1/contas?user_id=in.(${outros.map((o: string) => eh(o)).join(',')})&select=user_id,email,nome`,
    ) ?? [];
  }
  const porId = Object.fromEntries(pessoas.map((p: any) => [p.user_id, p]));

  const amigos = (amizades ?? []).map((a: any) => {
    const id = a.a_user === eu.id ? a.b_user : a.a_user;
    return { amizadeId: a.id, user_id: id, email: porId[id]?.email ?? '', nome: porId[id]?.nome ?? '', desde: a.criado_em };
  });

  const enviados = await comServico(
    `/rest/v1/pedidos_amizade?de_user=eq.${eh(eu.id)}&estado=eq.pendente&select=id,para_email,recado,criado_em&order=criado_em.desc`,
  );
  const recebidosCru = await comServico(
    `/rest/v1/pedidos_amizade?para_email=eq.${eh(eu.email)}&estado=eq.pendente&select=id,de_user,recado,criado_em&order=criado_em.desc`,
  );

  // Quem me chamou aparece com nome e e-mail: eu preciso saber quem é para
  // decidir. É mútuo — ele já sabia o meu para poder me chamar.
  let remetentes: any[] = [];
  const ids = [...new Set((recebidosCru ?? []).map((p: any) => p.de_user))];
  if (ids.length) {
    remetentes = await comServico(
      `/rest/v1/contas?user_id=in.(${ids.map((i) => eh(i)).join(',')})&select=user_id,email,nome`,
    ) ?? [];
  }
  const remPorId = Object.fromEntries(remetentes.map((p: any) => [p.user_id, p]));
  const recebidos = (recebidosCru ?? []).map((p: any) => ({
    id: p.id, recado: p.recado, criado_em: p.criado_em,
    de_email: remPorId[p.de_user]?.email ?? '', de_nome: remPorId[p.de_user]?.nome ?? '',
  }));

  return json({ amigos, enviados, recebidos, eu: { id: eu.id, email: eu.email } });
}

/** Aceitar ou recusar um pedido — só se ele foi endereçado a MIM. */
async function responder(req: Request, corpo: any) {
  const eu = await quemPede(req);
  const id = String(corpo.id ?? '');
  const aceitar = !!corpo.aceitar;

  const achados = await comServico(`/rest/v1/pedidos_amizade?id=eq.${eh(id)}&select=*`);
  const pedido = achados?.[0];
  if (!pedido) throw new Error('PEDIDO_NAO_ENCONTRADO');
  // A tranca: o pedido tem de ser para o MEU e-mail. Sem isto, qualquer um
  // aceitaria o convite alheio e viraria amigo de quem nunca o chamou.
  if (limpar(pedido.para_email) !== eu.email) throw new Error('NAO_E_SEU');
  if (pedido.estado !== 'pendente') throw new Error('JA_RESPONDIDO');

  await comServico(`/rest/v1/pedidos_amizade?id=eq.${eh(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ estado: aceitar ? 'aceito' : 'recusado', respondido_em: new Date().toISOString() }),
  });

  if (aceitar) {
    const [x, y] = par(pedido.de_user, eu.id);
    if (!(await saoAmigos(x, y))) {
      await comServico('/rest/v1/amizades', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ a_user: x, b_user: y }),
      });
    }
  }
  return json({ ok: true });
}

/** Cancelar um pedido que EU mandei. */
async function cancelar(req: Request, corpo: any) {
  const eu = await quemPede(req);
  const id = String(corpo.id ?? '');
  const p = (await comServico(`/rest/v1/pedidos_amizade?id=eq.${eh(id)}&select=de_user,estado`))?.[0];
  if (!p) throw new Error('PEDIDO_NAO_ENCONTRADO');
  if (p.de_user !== eu.id) throw new Error('NAO_E_SEU');
  await comServico(`/rest/v1/pedidos_amizade?id=eq.${eh(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ estado: 'cancelado', respondido_em: new Date().toISOString() }),
  });
  return json({ ok: true });
}

/**
 * Desfazer amizade.
 *
 * Leva junto tudo o que foi compartilhado entre os dois, nas duas direções.
 * Deixar as cópias de pé seria uma amizade desfeita pela metade: a pessoa
 * continuaria com o material de quem não a quer mais por perto.
 */
async function desfazer(req: Request, corpo: any) {
  const eu = await quemPede(req);
  const outro = String(corpo.user_id ?? '');
  if (!outro || outro === eu.id) throw new Error('PEDIDO_INVALIDO');

  const [x, y] = par(eu.id, outro);
  await comServico(`/rest/v1/amizades?a_user=eq.${eh(x)}&b_user=eq.${eh(y)}`, { method: 'DELETE' });
  await comServico(`/rest/v1/compartilhamentos?dono=eq.${eh(eu.id)}&para_user=eq.${eh(outro)}`, { method: 'DELETE' });
  await comServico(`/rest/v1/compartilhamentos?dono=eq.${eh(outro)}&para_user=eq.${eh(eu.id)}`, { method: 'DELETE' });
  return json({ ok: true });
}

/** Compartilhar um item com um amigo. Só amigo, e só o que é meu. */
async function compartilhar(req: Request, corpo: any) {
  const eu = await quemPede(req);
  const para = String(corpo.para_user ?? '');
  const colecao = String(corpo.colecao ?? '').slice(0, 40);
  const item_id = String(corpo.item_id ?? '').slice(0, 80);

  if (!para || !colecao || !item_id) throw new Error('PEDIDO_INVALIDO');
  if (para === eu.id) throw new Error('VOCE_MESMO');
  if (!(await saoAmigos(eu.id, para))) throw new Error('NAO_SAO_AMIGOS');

  const dados = corpo.dados ?? {};
  // Um teto: sem ele, um item enorme viraria uma forma de encher o banco de
  // quem recebe — e ninguém pede para receber.
  const tamanho = JSON.stringify(dados).length;
  if (tamanho > 400_000) throw new Error('ITEM_GRANDE_DEMAIS');

  await comServico('/rest/v1/compartilhamentos', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      dono: eu.id,                     // do JWT, nunca do corpo
      para_user: para,
      colecao,
      item_id,
      titulo: String(corpo.titulo ?? '').slice(0, 200),
      recado: String(corpo.recado ?? '').slice(0, 280),
      dados,
      atualizado_em: new Date().toISOString(),
    }),
  });
  return json({ ok: true });
}

/** O que me deram e o que eu dei. */
async function caixa(req: Request) {
  const eu = await quemPede(req);
  const recebidos = await comServico(
    `/rest/v1/compartilhamentos?para_user=eq.${eh(eu.id)}&select=*&order=atualizado_em.desc&limit=200`,
  );
  const enviados = await comServico(
    `/rest/v1/compartilhamentos?dono=eq.${eh(eu.id)}&select=id,para_user,colecao,item_id,titulo,atualizado_em&order=atualizado_em.desc&limit=200`,
  );

  const ids = [...new Set([
    ...(recebidos ?? []).map((c: any) => c.dono),
    ...(enviados ?? []).map((c: any) => c.para_user),
  ])];
  let pessoas: any[] = [];
  if (ids.length) {
    pessoas = await comServico(
      `/rest/v1/contas?user_id=in.(${ids.map((i) => eh(i)).join(',')})&select=user_id,email,nome`,
    ) ?? [];
  }
  const porId = Object.fromEntries(pessoas.map((p: any) => [p.user_id, p]));

  return json({
    recebidos: (recebidos ?? []).map((c: any) => ({
      ...c, de_email: porId[c.dono]?.email ?? '', de_nome: porId[c.dono]?.nome ?? '',
    })),
    enviados: (enviados ?? []).map((c: any) => ({
      ...c, para_email: porId[c.para_user]?.email ?? '', para_nome: porId[c.para_user]?.nome ?? '',
    })),
  });
}

/** Tirar de circulação. Vale para as duas pontas: quem deu e quem recebeu. */
async function revogar(req: Request, corpo: any) {
  const eu = await quemPede(req);
  const id = String(corpo.id ?? '');
  const c = (await comServico(`/rest/v1/compartilhamentos?id=eq.${eh(id)}&select=dono,para_user`))?.[0];
  if (!c) throw new Error('NAO_ENCONTRADO');
  if (c.dono !== eu.id && c.para_user !== eu.id) throw new Error('NAO_E_SEU');
  await comServico(`/rest/v1/compartilhamentos?id=eq.${eh(id)}`, { method: 'DELETE' });
  return json({ ok: true });
}

/* ---------------------------------------------------------------- porta */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!SERVICO) return json({ error: 'A função rede está sem a chave de serviço.' }, 500);

  let corpo: any = {};
  try { corpo = await req.json(); } catch { corpo = {}; }

  try {
    switch (String(corpo.acao ?? '')) {
      case 'minha-rede':    return await minhaRede(req);
      case 'convidar':      return await convidar(req, corpo);
      case 'responder':     return await responder(req, corpo);
      case 'cancelar':      return await cancelar(req, corpo);
      case 'desfazer':      return await desfazer(req, corpo);
      case 'compartilhar':  return await compartilhar(req, corpo);
      case 'caixa':         return await caixa(req);
      case 'revogar':       return await revogar(req, corpo);
      default:              return json({ error: `Ação desconhecida: ${corpo.acao}` }, 400);
    }
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    const status = msg === 'SEM_SESSAO' ? 401 : /NAO_E_SEU|NAO_SAO_AMIGOS/.test(msg) ? 403 : 400;
    return json({ error: msg }, status);
  }
});
