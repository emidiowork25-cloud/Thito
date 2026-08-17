-- Quem é o super admin, dito e não deduzido.
--
-- A primeira versão deduzia: "o usuário mais antigo do projeto". Parece a
-- mesma coisa que "o primeiro usuário" e não é. Neste projeto havia um
-- cadastro abandonado, criado onze minutos antes do bom e nunca confirmado —
-- e foi ele quem virou dono. O ADMIN sumiu do menu de quem construiu a casa, e
-- o poder ficou com uma conta que não consegue nem fazer login.
--
-- Dedução serve para começar; para mandar, é preciso estar escrito. Esta
-- coluna é onde fica escrito.
--
-- Aplicar:  supabase db push
--     ou:   cole no SQL Editor do projeto.

alter table public.contas
  add column if not exists super_admin boolean not null default false;

comment on column public.contas.super_admin is
  'Quem inclui e exclui pessoas. Escrita só pela chave de serviço — nenhuma política de update existe nesta tabela.';

-- Um dono por vez. Sem isto, dois registros marcados fariam a função escolher
-- pela ordem da consulta, que é um jeito silencioso de trocar quem manda.
create unique index if not exists contas_um_super_admin
  on public.contas (super_admin)
  where super_admin;

-- Dizer QUEM é fica de fora daqui de propósito: o uuid é deste projeto, e uma
-- migração com um uuid dentro estraga qualquer outro projeto que a rode. Num
-- projeto novo a função deduz sozinha (é o degrau 3 dela) e a linha nasce na
-- primeira aprovação. Para nomear o dono à mão, no SQL Editor:
--
--   insert into public.contas (user_id, email, nome, estado, super_admin, aprovado_em)
--   select id, email, coalesce(raw_user_meta_data->>'nome', ''), 'aprovado', true, now()
--     from auth.users where email = 'coloque-o-e-mail-aqui'
--   on conflict (user_id) do update
--     set super_admin = true, estado = 'aprovado';
--
-- Ou, sem tocar no banco: o segredo SUPER_ADMIN_ID na função, que vem antes de
-- tudo. Os dois caminhos existem porque nenhum deles depende do outro estar de pé.
