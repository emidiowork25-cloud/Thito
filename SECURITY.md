# Modelo de segurança — Chapa Quente

Nenhum sistema exposto à internet é inviolável. O que este documento descreve
é o que está fechado, o que continua aberto e por quê.

## Camadas

### Transporte
- HSTS com `preload` e `upgrade-insecure-requests`: o navegador recusa HTTP.
- Conexão ao Postgres com verificação de certificado. Antes aceitava qualquer
  certificado (`rejectUnauthorized: false`), o que permitia interceptação.

### Cabeçalhos
Aplicados a todas as rotas pelo `src/middleware.ts`:

| Cabeçalho | Efeito |
|---|---|
| `content-security-policy` | Restringe origens de script, imagem, fonte e conexão |
| `frame-ancestors 'none'` + `x-frame-options` | Impede clickjacking por iframe |
| `x-content-type-options: nosniff` | Impede o navegador de reinterpretar tipos |
| `referrer-policy` | Não vaza a URL completa para terceiros |
| `permissions-policy` | Desliga câmera, microfone, geolocalização, pagamento |
| `cross-origin-opener-policy` | Isola a origem de popups |

`x-powered-by` foi removido: anunciava a versão do framework.

O `connect-src` é a fronteira de exfiltração — mesmo um script que executasse
não conseguiria enviar dados para fora desta origem e do Supabase do projeto.

### Autenticação
- Senhas com bcrypt, custo 12.
- JWT com algoritmo **fixado** em HS256 e `issuer`/`audience` verificados. Sem
  a fixação, um token forjado poderia declarar `alg: none` e passar.
- Segredo de assinatura precisa ter no mínimo 32 bytes — a aplicação recusa
  iniciar com um segredo curto, que seria quebrável offline.
- O payload é validado campo a campo depois da assinatura: assinatura prova
  origem, não formato.
- Login em tempo constante: quando o e-mail não existe, o bcrypt roda mesmo
  assim contra um hash isca. Sem isso, a diferença de tempo de resposta
  revelaria quais e-mails estão cadastrados.
- Mensagem única para e-mail errado e senha errada.

### Limite de requisições
Contadores em Postgres (`hit_rate_limit`), porque instâncias serverless não
compartilham memória — um contador em processo reiniciaria a cada cold start.

| Ação | Limite | Janela |
|---|---|---|
| Login | 8 por IP **e** 8 por conta | 5 min |
| Cadastro | 5 por IP | 1 h |
| Criar pedido | 20 por usuário | 5 min |
| Upload de imagem | 30 por loja | 1 h |

O login é limitado por IP *e* por conta: o primeiro contém um host varrendo
muitas contas, o segundo contém uma botnet convergindo numa só.

### Entrada
- Todo campo de texto tem tamanho máximo; listas têm teto de itens. Sem isso,
  um payload grande vira negação de serviço e linha inflada no banco.
- Schemas em `.strict()`: chave desconhecida é rejeitada, não ignorada.
- Preço limitado e arredondado a centavos.
- Preços do pedido vêm sempre do banco, nunca do payload — carrinho adulterado
  não muda o valor.

### Upload
- Formato identificado pelos **bytes iniciais**, não pelo `Content-Type` nem
  pela extensão, ambos escolhidos por quem envia.
- Só JPEG, PNG, GIF e WebP. Nome e extensão do arquivo salvo são gerados pelo
  servidor; nada do nome original chega ao caminho.
- Teto de 5 MB, verificado antes de ler o corpo na memória.

### Banco
- RLS ativo nas 7 tabelas **sem nenhuma política**, e `GRANT` revogado de
  `anon`/`authenticated`. Resultado: acesso zero via PostgREST. Antes, a chave
  `anon` — que é pública por natureza — lia a tabela `users` inteira, hashes
  de senha incluídos.
- A aplicação conecta direto como dona das tabelas, então passa por fora do
  RLS. É por isso que "RLS sem política" é o estado correto aqui, e não uma
  pendência.
- `search_path` fixado nas funções, para que o papel chamador não consiga
  redirecioná-las a uma tabela que controle.
- Timeout de 15s por consulta.

### Erros
Exceções não são devolvidas ao cliente. Cada uma recebe um `errorId` que
aparece na resposta e no log — dá para correlacionar sem expor esquema, host
ou credencial. `/api/health` só responde `{"status":"ok"}` sem o header
`x-health-token`.

## O que continua aberto

**Cadastro confirma se um e-mail existe.** Responder "já cadastrado" é uma
divulgação. A alternativa — resposta genérica e e-mail de confirmação — exige
infraestrutura de e-mail que o projeto não tem. O limite de 5/hora por IP é o
que impede uso em escala.

**Token no `localStorage`.** Um XSS conseguiria lê-lo. Cookie `httpOnly` seria
imune, mas exige reescrever o fluxo de autenticação. Mitigação atual: não há
`dangerouslySetInnerHTML`, `eval` nem `innerHTML` em lugar nenhum, e o React
escapa tudo que renderiza — não existe caminho conhecido de dado armazenado
para script.

**CSP permite script inline.** O Next.js injeta o payload de hidratação em
`<script>` inline. Um nonce seria mais forte, mas precisa ser gerado por
requisição, e estas páginas são pré-renderizadas no build — não existe
requisição cujo nonce o HTML pudesse carregar. Fechar isso exige tornar toda
página dinâmica, ao custo de uma invocação serverless por visita.

**Sem 2FA e sem bloqueio progressivo de conta.** O limite por conta segura
força bruta, mas não substitui segundo fator.

**Repositório público.** Nenhum segredo está versionado (só `.env.example`),
mas o código é legível por qualquer pessoa.

## Operação

- Rode `SELECT prune_rate_limits();` periodicamente para limpar contadores
  vencidos.
- `HEALTH_TOKEN` deve ser um valor longo e aleatório.
- Ao girar o `JWT_SECRET`, todas as sessões caem — é o mecanismo de logout
  global em caso de suspeita de vazamento.
- Verifique os alertas do Supabase depois de qualquer mudança de schema:
  eles pegam RLS ausente e `search_path` solto.
