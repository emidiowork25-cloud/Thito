# Fontes do JARBAS

As famílias são servidas do próprio projeto, não de CDN. O hub precisa abrir offline,
e uma fonte que não carrega vira fallback silencioso — o desenho quebra sem avisar.
Só os subconjuntos **latin** e **latin-ext**: é o que o português usa.

| Papel | Pedida | O que está hospedado | Autoria |
|---|---|---|---|
| Destaque | **Gotham Bold** | **Montserrat** 700/800 | Julieta Ulanovsky |
| Subtítulo e rótulo | **Bebas Neue** | Bebas Neue (a própria) | Ryoichi Tsunekawa |
| Corpo | **Creato Display** | **Figtree** | Erik Kennedy |
| Dados e código | — | IBM Plex Mono | IBM Corp. |

## Por que Gotham e Creato não estão aqui

As duas são **fontes comerciais licenciadas**. Não posso baixar nem redistribuir
nenhuma das duas junto com o projeto — seria violação da licença delas.

O que fiz: os nomes reais vêm **primeiro na pilha do CSS**.

```css
--display: 'Gotham', 'Gotham Bold', 'Montserrat', system-ui, sans-serif;
--ui: 'Creato Display', 'Creato', 'Figtree', 'Segoe UI', system-ui, sans-serif;
```

Se você tiver a licença e instalar as fontes no computador, o navegador usa as de
verdade sem mudar uma linha. Sem elas, cai nas substitutas — Montserrat é o
parente livre mais próximo da Gotham (mesma linhagem geométrica) e Figtree cumpre
o papel da Creato em texto corrido.

Se você comprar as licenças para web, é só colocar os `.woff2` nesta pasta e
acrescentar dois blocos `@font-face` em `styles/fontes.css`.

## Bebas Neue

Só tem caixa-alta — não existe minúscula na família. Por isso ela é subtítulo e
rótulo, e nunca corpo de texto.

Todas as hospedadas são **SIL Open Font License 1.1**; o texto está em `OFL.txt`.
