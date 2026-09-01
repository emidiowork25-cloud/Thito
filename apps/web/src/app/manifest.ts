import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Chapa Quente - Cardápio Digital',
    short_name: 'Chapa Quente',
    description: 'Peça seu hambúrguer do jeito que você gosta.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1a1a1a',
    theme_color: '#1a1a1a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
