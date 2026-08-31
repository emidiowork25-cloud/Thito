'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Flame, ShoppingBag } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#031B2B] via-[#0a0e17] to-[#1a2332]">
      {/* Header */}
      <header className="border-b border-[#11BACA]/20 sticky top-0 z-50 bg-[#031B2B]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Flame className="w-8 h-8 text-[#FFA24D]" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#FFA24D] to-[#A60E35] bg-clip-text text-transparent">
              Chapa Quente
            </h1>
          </div>

          <nav className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-gray-400">{user?.name}</span>
                {user?.userType === 'customer' ? (
                  <button onClick={() => router.push('/menu')} className="btn-primary text-sm">
                    Cardápio
                  </button>
                ) : (
                  <button onClick={() => router.push('/store/dashboard')} className="btn-primary text-sm">
                    Dashboard
                  </button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => router.push('/login')} className="btn-secondary text-sm">
                  Login
                </button>
                <button onClick={() => router.push('/register')} className="btn-primary text-sm">
                  Cadastro
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h2 className="text-5xl md:text-6xl font-bold mb-6">
          Bem-vindo à <span className="bg-gradient-to-r from-[#FFA24D] to-[#A60E35] bg-clip-text text-transparent">Chapa Quente</span>
        </h2>
        <p className="text-xl text-[#11BACA]/70 mb-12 max-w-2xl mx-auto">
          O ponto certo da sua fome! Cardápio digital, pedidos rápidos e acompanhamento em tempo real.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mt-16">
          {/* Customer CTA */}
          <div className="card-highlight p-8">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-[#FFA24D]" />
            <h3 className="text-2xl font-bold mb-4">Sou Cliente</h3>
            <p className="text-gray-400 mb-6">
              Explore nosso cardápio digital, personalize seu pedido e acompanhe em tempo real.
            </p>
            <button
              onClick={() => router.push(isAuthenticated && user?.userType === 'customer' ? '/menu' : '/login')}
              className="btn-primary w-full"
            >
              {isAuthenticated && user?.userType === 'customer' ? 'Ir ao Cardápio' : 'Entrar como Cliente'}
            </button>
          </div>

          {/* Store CTA */}
          <div className="card-highlight p-8">
            <Flame className="w-16 h-16 mx-auto mb-4 text-[#FFA24D]" />
            <h3 className="text-2xl font-bold mb-4">Sou Loja</h3>
            <p className="text-gray-400 mb-6">
              Gerencie seu cardápio, pedidos e acompanhe seus clientes em tempo real.
            </p>
            <button
              onClick={() => router.push(isAuthenticated && user?.userType === 'store' ? '/store/dashboard' : '/register')}
              className="btn-primary w-full"
            >
              {isAuthenticated && user?.userType === 'store' ? 'Ir ao Dashboard' : 'Cadastrar Loja'}
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-24">
        <h3 className="text-3xl font-bold text-center mb-16">Por que Chapa Quente?</h3>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: 'Cardápio Digital',
              description: 'Cardápio bonito, organizado por categorias com fotos de alta qualidade',
            },
            {
              title: 'Pedidos Rápidos',
              description: 'Faça seu pedido em segundos e receba confirmação instantânea',
            },
            {
              title: 'Acompanhamento Real-time',
              description: 'Saiba exatamente quando seu pedido estará pronto',
            },
          ].map((feature, i) => (
            <div key={i} className="card-highlight p-6 text-center">
              <h4 className="text-xl font-bold mb-3 text-[#11BACA]">{feature.title}</h4>
              <p className="text-[#11BACA]/60">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#11BACA]/20 mt-24 py-8 text-center text-[#11BACA]/40">
        <p>&copy; 2024 Chapa Quente. Todos os direitos reservados. 🔥</p>
      </footer>
    </main>
  );
}
