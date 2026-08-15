-- ADMIN do JARBAS: contas e convites.
--
-- A regra de ouro é "só o primeiro usuário inclui e exclui gente". Uma regra
-- assim não pode morar no navegador: quem abre o app é dono do JavaScript que
-- roda nele, e um `if (souAdmin)` do lado de cá é decoração, não tranca.
--
-- Então a tranca é esta: NENHUMA política abaixo concede escrita. Com a chave
-- publicável — a única que o navegador tem — dá para ler a própria conta e mais
-- nada. Aprovar, bloquear, remover e criar convite só existem através da Edge
-- Function `admin`, que roda no servidor com a chave de serviço e confere no
-- JWT quem está pedindo antes de fazer qualquer coisa.
--
-- Aplicar:  supabase db push
--     ou:   cole no SQL Editor do projeto.

/* ---------------------------------------------------------------- contas */

create table if not exists public.contas (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  nome        text default '',
  -- pendente: criou a conta e espera o aval do admin
  -- aprovado: o admin liberou e o e-mail de confirmação foi enviado
  -- bloqueado: entrou e depois perdeu o acesso
  estado      text not null default 'pendente'
              check (estado in ('pendente', 'aprovado', 'bloqueado')),
  -- os módulos que esta pessoa vê. Vazio = nenhum além do Painel e dos Ajustes.
  modulos     text[] not null default '{}',
  convite     text default '',
  observacao  text default '',
  criado_em   timestamptz not null default now(),
  aprovado_em timestamptz
);

comment on table public.contas is
  'Quem pode usar o JARBAS e com quais módulos. Escrita só pela Edge Function admin.';

alter table public.contas enable row level security;

-- A pessoa lê a própria conta: é assim que o app dela sabe quais módulos
-- mostrar e se já foi aprovada. Ler a própria linha não dá poder nenhum.
drop policy if exists "conta propria: ler" on public.contas;
create policy "conta propria: ler"
  on public.contas for select
  using (auth.uid() = user_id);

-- Não há política de insert, update ou delete. É de propósito: com RLS ligado,
-- o que nenhuma política permite fica proibido para a chave publicável.

/* --------------------------------------------------------------- convites */

create table if not exists public.convites (
  codigo     text primary key,
  modulos    text[] not null default '{}',
  criado_por uuid references auth.users (id) on delete set null,
  anotacao   text default '',
  expira_em  timestamptz,
  max_usos   int not null default 1,
  usos       int not null default 0,
  criado_em  timestamptz not null default now()
);

comment on table public.convites is
  'Códigos de convite. O link carrega só o código — a lista de módulos mora aqui, no servidor, para não poder ser reescrita por quem recebe o link.';

alter table public.convites enable row level security;

-- Nenhuma política. O navegador não lê nem escreve convite: quem valida o
-- código na hora do cadastro é a Edge Function. Se a lista de módulos viajasse
-- dentro do link, bastaria editar a URL para se conceder o app inteiro.

/* ------------------------------------------------------------------ notas */

create index if not exists contas_estado_idx on public.contas (estado);
create index if not exists convites_criado_por_idx on public.convites (criado_por);
