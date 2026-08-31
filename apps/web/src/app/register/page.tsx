'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { setStoredAuth } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { Flame } from 'lucide-react';

export default function RegisterPage() {
  const [userType, setUserType] = useState<'customer' | 'store'>('customer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        userType,
        name,
        email,
        password,
      });

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
      setError(err.response?.data?.error?.message || 'Erro ao cadastrar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Flame className="w-12 h-12 text-orange-500" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
            Chapa Quente
          </h1>
        </div>

        {/* Form */}
        <div className="card-menu p-8">
          <h2 className="text-2xl font-bold mb-6">Criar Conta</h2>

          {error && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            {/* User Type Selection */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <button
                type="button"
                onClick={() => setUserType('customer')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  userType === 'customer'
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                Cliente
              </button>
              <button
                type="button"
                onClick={() => setUserType('store')}
                className={`p-4 rounded-lg font-semibold transition-all ${
                  userType === 'store'
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >
                Loja
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-orange-500"
                placeholder="Seu nome"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-orange-500"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-orange-500"
                placeholder="Mín. 6 caracteres"
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
              {loading ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </form>

          <p className="text-center text-gray-400 text-sm mt-6">
            Já tem conta?{' '}
            <button
              onClick={() => router.push('/login')}
              className="text-orange-500 hover:text-orange-400 font-semibold"
            >
              Entre aqui
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
