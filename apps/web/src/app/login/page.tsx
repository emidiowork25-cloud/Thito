'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { setStoredAuth } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { Flame } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, ...user } = response.data;

      setStoredAuth({ token, ...user });
      setUser({
        id: user.userId,
        email: user.email,
        name: user.name,
        userType: user.userType,
      });

      if (user.userType === 'customer') {
        router.push('/menu');
      } else {
        router.push('/store/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Flame className="w-12 h-12 text-[#FFC107]" />
          </div>
          <h1 className="text-3xl font-bold text-[#FFC107]">
            Chapa Quente
          </h1>
        </div>

        {/* Form */}
        <div className="card-highlight p-8">
          <h2 className="text-2xl font-bold mb-6">Entrar</h2>

          {error && (
            <div className="mb-4 p-4 bg-[#FFC107]/20 border border-[#FFC107] rounded-lg text-[#FFC107] text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#FFC107]">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-[#FFC107]/30 rounded-lg focus:outline-none focus:border-[#FFC107] text-white placeholder-[#FFC107]/40"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-[#FFC107]">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-[#FFC107]/30 rounded-lg focus:outline-none focus:border-[#FFC107] text-white placeholder-[#FFC107]/40"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-[#FFC107]/60 text-sm mt-6">
            Não tem conta?{' '}
            <button
              onClick={() => router.push('/register')}
              className="text-[#FFC107] hover:text-[#FFD700] font-semibold"
            >
              Cadastre-se
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
