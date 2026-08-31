# 🎥 Setup do Vídeo Hero Section - Chapa Quente

## 📂 Estrutura de Pastas

Os vídeos devem ser colocados em:
```
apps/web/public/videos/
├── hero.mp4        (formato MP4 - fallback padrão)
├── hero.webm       (formato WebM - melhor compressão)
└── hero-fallback.jpg (imagem estática - fallback)
```

## 📹 Especificações do Vídeo

### Dimensões Recomendadas:
- **Resolução:** 1920x1080 (Full HD) ou 1280x720 (HD)
- **Proporção:** 16:9
- **Duração:** 10-30 segundos (loop contínuo)
- **FPS:** 24-30 fps

### Formatos:
1. **MP4 (H.264)**
   - Compatibilidade: Todos os navegadores modernos
   - Tamanho: ~2-5 MB para 30 segundos em HD
   - Codec: H.264 + AAC
   - Comando ffmpeg:
   ```bash
   ffmpeg -i video.original -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k hero.mp4
   ```

2. **WebM (VP9)**
   - Melhor compressão
   - Tamanho: ~1-3 MB para 30 segundos em HD
   - Comando ffmpeg:
   ```bash
   ffmpeg -i video.original -c:v libvpx-vp9 -crf 23 -b:v 0 -c:a libopus -b:a 128k hero.webm
   ```

### Otimização:
```bash
# Comprimir MP4
ffmpeg -i video.original -vcodec libx264 -crf 28 -preset fast -c:a aac -b:a 96k hero.mp4

# Comprimir WebM
ffmpeg -i video.original -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 96k hero.webm

# Extrair frame para fallback
ffmpeg -i video.original -ss 00:00:05 -vframes 1 hero-fallback.jpg
```

## 🎬 Exemplo de Vídeo Ideal

Para um restaurante de hambúrgueres:
- **Conteúdo:** Preparo de hambúrguer, suco da carne sendo cortada, hambúrguer completo, clientes desfrutando
- **Efeitos:** Slow motion nas partes importantes, transições suaves
- **Áudio:** Pode estar silencioso (está com mute obrigatório)
- **Cores:** Cores vibrantes que combinem com amarelo ouro

## 🔧 Como Adicionar o Vídeo

### 1. Copiar arquivo para pasta pública:
```bash
cp seu-video.mp4 apps/web/public/videos/hero.mp4
cp seu-video.webm apps/web/public/videos/hero.webm
```

### 2. Estrutura já está configurada em:
```
apps/web/src/app/page.tsx (linhas 51-65)
```

O código já possui:
- ✅ Tag `<video>` com autoplay, muted, loop
- ✅ Múltiplas fontes de vídeo (MP4 + WebM para compatibilidade)
- ✅ Overlay escuro para melhorar legibilidade
- ✅ Responsive (playsInline para mobile)
- ✅ Fallback para imagem se vídeo não carregar

## 📱 Compatibilidade

| Navegador | MP4 | WebM |
|-----------|-----|------|
| Chrome    | ✅  | ✅   |
| Firefox   | ✅  | ✅   |
| Safari    | ✅  | ❌   |
| Edge      | ✅  | ✅   |
| Mobile    | ✅  | ✅   |

## ⚡ Performance

- **Lazy load automático:** O vídeo começa só quando visível
- **Muted obrigatório:** Permite autoplay em todos os navegadores
- **Fallback de imagem:** Carrega imagem estática se vídeo falhar

## 🎨 Estilo

O hero section foi adaptado para o novo design (BURGRY style):
- Texto em **amarelo ouro (#FFC107)**
- Overlay escuro para contraste
- Responsive para mobile e desktop
- Texto grande e legível

## 📝 Próximos Passos

1. Prepare seu vídeo (ou solicite edição)
2. Converta para MP4 e WebM
3. Copie para `apps/web/public/videos/`
4. Teste no navegador (http://localhost:3000)
5. Ajuste overlay (opacidade do `bg-black/50` se necessário)
