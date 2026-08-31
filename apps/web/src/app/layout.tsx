import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chapa Quente - Hamburgueria Digital',
  description: 'Sistema de pedidos e cardápio digital para Chapa Quente Hamburgueria',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-900 text-white">{children}</body>
    </html>
  );
}
