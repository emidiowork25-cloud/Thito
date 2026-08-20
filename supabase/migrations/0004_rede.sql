-- A rede do JARBAS: amigos e compartilhamentos.
--
-- Duas regras mandam neste arquivo.
--
-- A PRIMEIRA é a mesma do ADMIN: nenhuma política abaixo concede escrita. Com a
-- chave publicável — a única que o navegador tem — dá para LER o que é seu e
-- mais nada. Convidar, aceitar, compartilhar e revogar só existem através da
-- Edge Function `rede`, que roda com a chave de serviço e confere no JWT quem
-- está pedindo antes de tocar em qualquer linha.
--
-- A SEGUNDA é sobre não virar uma lista telefônica. Ninguém pode abrir o app e
-- ver todo mundo que usa o JARBAS: para chamar alguém é preciso saber o e-mail
-- de cadastro dessa pessoa. E há uma armadilha sutil aí — se o convite dissesse
-- "essa conta não existe", o app viraria uma máquina de descobrir quem tem
-- cadastro: bastaria testar endereços até um deles ser aceito. Por isso o
-- pedido é guardado pelo E-MAIL DIGITADO, exista a conta ou não, e a resposta é
-- sempre a mesma. Quem digita errado vê um convite pendente para sempre, que é
-- verdade — e não aprende nada sobre quem está ou não cadastrado.
--
-- Aplicar:  supabase db push   ou   cole no SQL Editor do projeto.

/* -------------------------------------------------- pedidos de amizade */

create table if not exists public.pedidos_amizade (
  id            uuid primary key default gen_random_uuid(),
  de_user       uuid not null references auth.users (id) on delete cascade,
  -- o endereço como foi digitado, em minúsculas. Guardar o e-mail em vez do
  -- uuid é o que faz o pedido existir mesmo quando a conta não existe.
  para_email    text not null,
  recado        text default '',
  estado        text not null default 'pendente'
                check (estado in ('pendente', 'aceito', 'recusado', 'cancelado')),
  criado_em     timestamptz not null default now(),
  respondido_em timestamptz
);

comment on table public.pedidos_amizade is
  'Convites de amizade por e-mail. Escrita só pela Edge Function rede.';

create unique index if not exists pedidos_amizade_um_por_par
  on public.pedidos_amizade (de_user, lower(para_email))
  where estado = 'pendente';

create index if not exists pedidos_amizade_por_email
  on public.pedidos_amizade (lower(para_email));

alter table public.pedidos_amizade enable row level security;

-- Vê o pedido quem mandou e quem foi chamado. O destinatário é reconhecido pelo
-- e-mail do próprio token — que é assinado pelo servidor de autenticação, então
-- não dá para dizer que se chama outra pessoa.
drop policy if exists "pedido: ler o meu" on public.pedidos_amizade;
create policy "pedido: ler o meu"
  on public.pedidos_amizade for select
  using (
    auth.uid() = de_user
    or lower(para_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

/* ---------------------------------------------------------- amizades */

create table if not exists public.amizades (
  id        uuid primary key default gen_random_uuid(),
  a_user    uuid not null references auth.users (id) on delete cascade,
  b_user    uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  constraint amizade_nao_reflexiva check (a_user <> b_user)
);

comment on table public.amizades is
  'Amizade aceita, sem direção: quem está aqui pode compartilhar com quem está aqui.';

-- Um par por vez, em qualquer ordem. Sem isto, dois pedidos cruzados criariam
-- duas amizades para as mesmas duas pessoas e a remoção deixaria uma de pé.
create unique index if not exists amizades_par_unico
  on public.amizades (least(a_user, b_user), greatest(a_user, b_user));

alter table public.amizades enable row level security;

drop policy if exists "amizade: ler as minhas" on public.amizades;
create policy "amizade: ler as minhas"
  on public.amizades for select
  using (auth.uid() = a_user or auth.uid() = b_user);

/* -------------------------------------------------- compartilhamentos */

create table if not exists public.compartilhamentos (
  id            uuid primary key default gen_random_uuid(),
  dono          uuid not null references auth.users (id) on delete cascade,
  para_user     uuid not null references auth.users (id) on delete cascade,
  -- de qual módulo veio: agenda, copywriter, mindmaps, teleprompter…
  colecao       text not null,
  item_id       text not null,
  titulo        text not null default '',
  -- CÓPIA do item, não um ponteiro para a linha do dono.
  --
  -- É a diferença entre entregar uma fotocópia e emprestar a chave do arquivo.
  -- Com ponteiro, ler o compartilhado exigiria abrir uma fresta nos `records`
  -- de quem compartilhou — e frestas assim são onde vazamento mora. Aqui o
  -- destinatário lê esta linha e nunca alcança nada do dono.
  dados         jsonb not null default '{}',
  recado        text default '',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint compartilhamento_nao_reflexivo check (dono <> para_user)
);

comment on table public.compartilhamentos is
  'Cópias entregues a um amigo. Escrita só pela Edge Function rede.';

create unique index if not exists compartilhamentos_unico
  on public.compartilhamentos (dono, para_user, colecao, item_id);

create index if not exists compartilhamentos_para
  on public.compartilhamentos (para_user);

alter table public.compartilhamentos enable row level security;

-- Só as duas pontas: quem deu e quem recebeu.
drop policy if exists "compartilhado: ler o meu" on public.compartilhamentos;
create policy "compartilhado: ler o meu"
  on public.compartilhamentos for select
  using (auth.uid() = dono or auth.uid() = para_user);

-- De novo: nenhuma política de insert, update ou delete, em nenhuma das três
-- tabelas. O que nenhuma política permite fica proibido para a chave do
-- navegador — e é exatamente por isso que a Edge Function existe.
