# 🎥 Pasta de Vídeos - Hero Section

## 📍 Coloque seus vídeos aqui

Adicione os seguintes arquivos nesta pasta:

### Obrigatórios:
- `hero.mp4` - Vídeo em formato MP4 (1920x1080, ~2-5 MB)
- `hero.webm` - Vídeo em formato WebM (1920x1080, ~1-3 MB)

### Recomendado:
- `hero-fallback.jpg` - Imagem estática para fallback

## 📝 Especificações

| Propriedade | Valor |
|------------|-------|
| Resolução | 1920x1080 (16:9) |
| Duração | 10-30 segundos |
| FPS | 24-30 |
| Formato | MP4 + WebM |
| Tamanho | < 5 MB cada |
| Audio | Será silenciado |

## 🔄 Autoplay

- Autoplay: **Ativado** (som mudo)
- Loop: **Ativado**
- Responsive: **Ativado**

## 📦 Como preparar seu vídeo

Se você tiver um vídeo original, use estes comandos:

### Gerar MP4:
```bash
ffmpeg -i seu-video.mov -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k hero.mp4
```

### Gerar WebM:
```bash
ffmpeg -i seu-video.mov -c:v libvpx-vp9 -crf 23 -b:v 0 -c:a libopus -b:a 128k hero.webm
```

### Gerar Fallback (JPG):
```bash
ffmpeg -i seu-video.mov -ss 00:00:05 -vframes 1 hero-fallback.jpg
```

## ✅ Teste

Após adicionar os vídeos:

1. Reinicie o servidor: `npm run dev`
2. Acesse: `http://localhost:3000`
3. Verifique se o vídeo carrega na hero section
4. Teste em diferentes navegadores

## 🎨 Aspectos Técnicos

- O vídeo tem overlay escuro semi-transparente para melhorar legibilidade
- Se o vídeo não carregar, a página usa gradiente como fallback
- Mobile: Otimizado para reprodução eficiente

## 📞 Suporte

Ver `VIDEO_SETUP.md` na raiz do projeto para mais informações.
