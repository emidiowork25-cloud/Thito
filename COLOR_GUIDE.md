# 🎨 Guia de Cores - Chapa Quente

## Paleta de Cores Oficial

A paleta de cores do Chapa Quente foi cuidadosamente selecionada para refletir a identidade da hamburgueria - quente, moderna e sofisticada.

### Cores Principais

| Nome | Código HEX | RGB | Uso |
|------|-----------|-----|-----|
| **Dark Navy** | `#031B2B` | rgb(3, 27, 43) | Fundo principal, backgrounds |
| **Cyan** | `#11BACA` | rgb(17, 186, 202) | Acentos, destaques, hover states |
| **Orange** | `#FFA24D` | rgb(255, 162, 77) | Botões primários, CTAs |
| **Deep Red** | `#A60E35` | rgb(166, 14, 53) | Gradientes, ênfase, alertas |

### Cores Secundárias

| Nome | Código HEX | Uso |
|------|-----------|-----|
| Gray 900 | `#0a0e17` | Fundo escuro adicional |
| Gray 800 | `#1a2332` | Cards, containers |
| Gray 700 | `#2a3d52` | Bordas, divisores |

## Uso das Cores

### Gradientes

**Gradiente Primário (Orange → Red)**
```css
background: linear-gradient(135deg, #FFA24D 0%, #A60E35 100%);
```
Usado em: Botões primários, headers, CTAs principais

**Gradiente Cyan (Cyan → Orange)**
```css
background: linear-gradient(135deg, #11BACA 0%, #FFA24D 100%);
```
Usado em: Destaques especiais, seções premium

**Gradiente Dark (Red → Navy)**
```css
background: linear-gradient(135deg, #A60E35 0%, #031B2B 100%);
```
Usado em: Backgrounds, footers, overlays

### Componentes

#### Botões

**Primário (CTA principal)**
- Background: Gradiente Orange → Red
- Texto: Branco
- Hover: Tons mais escuros do gradiente

**Secundário (Ações comuns)**
- Background: Gray 800 com borda Cyan
- Texto: Branco
- Hover: Gray 700, borda Cyan mais opaca

**Terciário (Menos importante)**
- Background: Transparente
- Borda: Cyan
- Texto: Cyan
- Hover: Background Cyan com opacidade 10%

#### Cards

**Card Padrão**
- Background: Gray 800
- Borda: Gray 700
- Hover: Borda Cyan, sombra aumentada

**Card Destaque**
- Background: Gradiente Gray 800 → Gray 700
- Borda: Cyan com opacidade 20%
- Hover: Borda Cyan com opacidade 60%

#### Textos

| Elemento | Cor | Código |
|----------|-----|--------|
| Título Principal | Orange | `#FFA24D` |
| Título Secundário | Cyan | `#11BACA` |
| Texto Normal | White | `#FFFFFF` |
| Texto Secundário | Cyan 70% | `#11BACA` com 70% opacity |
| Texto Desabilitado | Cyan 40% | `#11BACA` com 40% opacity |

#### Status

**Pendente**
- Background: Yellow com 20% opacidade
- Texto: Yellow

**Confirmado**
- Background: Blue com 20% opacidade
- Texto: Blue

**Preparando**
- Background: Orange com 20% opacidade
- Texto: Orange

**Pronto**
- Background: Green com 20% opacidade
- Texto: Green

**Cancelado/Erro**
- Background: Red com 20% opacidade
- Texto: Red

## Implementação

### Tailwind CSS

As cores estão configuradas em `apps/web/tailwind.config.js`:

```javascript
colors: {
  brand: {
    darkBg: '#031B2B',
    cyan: '#11BACA',
    orange: '#FFA24D',
    red: '#A60E35',
  },
}
```

### CSS Variables

As cores também estão disponíveis como variáveis CSS em `apps/web/src/app/globals.css`:

```css
:root {
  --color-dark-bg: #031B2B;
  --color-cyan: #11BACA;
  --color-orange: #FFA24D;
  --color-red: #A60E35;
}
```

## Acessibilidade

A paleta foi selecionada considerando:
- ✅ Contraste suficiente entre cores (WCAG AA)
- ✅ Legibilidade para pessoas com daltonismo
- ✅ Consistência em diferentes contextos
- ✅ Elegância e modernidade

## Referências

Inspect da paleta:
- 031B2B: Azul marinho profundo
- 11BACA: Turquesa vibrante e amigável
- FFA24D: Laranja quente e convidativo
- A60E35: Vermelho profundo e sofisticado

---

Para mais informações sobre o design do Chapa Quente, consulte o README principal.
