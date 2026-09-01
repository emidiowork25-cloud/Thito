import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chapa Quente - Hamburgueria Digital',
  description: 'Sistema de pedidos e cardápio digital para Chapa Quente Hamburgueria',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Chapa Quente',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-180.png',
  },
  formatDetection: {
    // Stops iOS from turning prices and quantities into phone-number links.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets the page paint under the iPhone notch and home indicator; the safe
  // area is then reclaimed with env(safe-area-inset-*) in globals.css.
  viewportFit: 'cover',
  // Pinch-zoom stays available — capping it would fail accessibility.
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#1a1a1a] text-white">{children}</body>
    </html>
  );
}
