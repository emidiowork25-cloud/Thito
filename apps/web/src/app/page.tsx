'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Flame, ShoppingBag, MapPin, Clock, MessageCircle, UtensilsCrossed, Truck } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();

  return (
    <main className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-[#FFC107]/20 sticky top-0 z-50 bg-[#1a1a1a]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Flame className="w-8 h-8 text-[#FFC107]" />
            <h1 className="text-2xl font-bold text-[#FFC107]">
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

      {/* Hero Video Section */}
      <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <div className="absolute inset-0 w-full h-full">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          >
            {/* Add your video sources below */}
            <source src="/videos/hero.mp4" type="video/mp4" />
            <source src="/videos/hero.webm" type="video/webm" />
          </video>
          {/* Overlay escuro para melhorar legibilidade do texto */}
          <div className="absolute inset-0 bg-black/50"></div>
        </div>

        {/* Content */}
        <div className="relative z-10 text-center px-4 max-w-4xl">
          <h2 className="text-6xl md:text-7xl font-bold mb-6">
            Bem-vindo à <span className="text-[#FFC107]">Chapa Quente</span>
          </h2>
          <p className="text-3xl text-[#FFC107] font-bold mb-4">
            O ponto certo da sua fome! 🔥
          </p>
          <p className="text-xl text-gray-200 mb-12 max-w-2xl mx-auto">
            Hambúrgueres frescos, suculentos e personalizados do seu jeito
        </p>

        {/* Business Info Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {/* Hours */}
          <div className="card-highlight p-6 border border-[#FFC107]/30 hover:border-[#FFC107] transition-all">
            <Clock className="w-10 h-10 mx-auto mb-3 text-[#FFC107]" />
            <h4 className="font-bold text-[#FFC107] mb-2">HORÁRIO</h4>
            <p className="text-white font-semibold text-lg mb-1">16:00 às 02:00</p>
            <p className="text-[#FFC107]/60 text-sm">Todos os dias</p>
          </div>

          {/* Location */}
          <div className="card-highlight p-6 border border-[#FFC107]/30 hover:border-[#FFC107] transition-all">
            <MapPin className="w-10 h-10 mx-auto mb-3 text-[#FFC107]" />
            <h4 className="font-bold text-[#FFC107] mb-2">LOCALIZAÇÃO</h4>
            <p className="text-white font-semibold text-lg mb-1">Charnequinha</p>
            <p className="text-[#FFC107]/60 text-sm">Cabo de Santo Agostinho - PE</p>
          </div>

          {/* Services */}
          <div className="card-highlight p-6 border border-[#FFC107]/30 hover:border-[#FFC107] transition-all">
            <Truck className="w-10 h-10 mx-auto mb-3 text-[#FFC107]" />
            <h4 className="font-bold text-[#FFC107] mb-2">ATENDIMENTO</h4>
            <p className="text-white font-semibold text-lg mb-1">Loja & Delivery</p>
            <p className="text-[#FFC107]/60 text-sm">iFood & WhatsApp</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mt-12">
          {/* Customer CTA */}
          <div className="card-highlight p-8">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-[#FFC107]" />
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
            <Flame className="w-16 h-16 mx-auto mb-4 text-[#FFC107]" />
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

        {/* Contact Section */}
        <div className="mt-12 p-8 rounded-xl bg-[#FFC107]/10 border border-[#FFC107]/20">
          <h3 className="text-2xl font-bold mb-6 text-white">Outras formas de Contato</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <a
              href="https://wa.me/558799999999"
              className="flex items-center gap-4 p-4 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-all border border-[#FFC107]/20 hover:border-[#FFC107]"
            >
              <MessageCircle className="w-8 h-8 text-[#FFC107]" />
              <div className="text-left">
                <p className="font-semibold">WhatsApp</p>
                <p className="text-sm text-gray-400">Faça seu pedido direto</p>
              </div>
            </a>
            <a
              href="https://ifood.com.br"
              className="flex items-center gap-4 p-4 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-all border border-[#FFC107]/20 hover:border-[#FFC107]"
            >
              <UtensilsCrossed className="w-8 h-8 text-[#FFC107]" />
              <div className="text-left">
                <p className="font-semibold">iFood</p>
                <p className="text-sm text-gray-400">Peça pelo app</p>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 py-24">
        <h3 className="text-3xl font-bold text-center mb-16 title-underline">Por que Chapa Quente?</h3>
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
              <h4 className="text-xl font-bold mb-3 text-[#FFC107]">{feature.title}</h4>
              <p className="text-[#FFC107]/60">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#FFC107]/20 mt-24 py-8 text-center text-[#FFC107]/40">
        <p>&copy; 2024 Chapa Quente. Todos os direitos reservados. 🔥</p>
      </footer>
    </main>
  );
}
