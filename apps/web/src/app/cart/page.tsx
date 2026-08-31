'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { Flame, Trash2, Minus, Plus, ArrowLeft } from 'lucide-react';

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { items, storeId, removeItem, updateQuantity, clear, total } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  const handleCheckout = async () => {
    if (!storeId || items.length === 0) {
      setError('Carrinho vazio ou loja não selecionada');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/orders', {
        storeId,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          notes: item.notes,
        })),
      });

      const orderId = response.data.orderId;
      clear();
      router.push(`/order/${orderId}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao criar pedido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#031B2B] to-[#0a0e17]">
      {/* Header */}
      <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Flame className="w-8 h-8 text-[#FFA24D]" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-[#FFA24D] to-[#A60E35] bg-clip-text text-transparent">
              Chapa Quente
            </h1>
          </div>

          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold mb-8">Seu Carrinho</h2>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="card-highlight p-12 text-center">
            <p className="text-gray-400 mb-6">Seu carrinho está vazio</p>
            <button
              onClick={() => router.back()}
              className="btn-primary inline-block"
            >
              Ir ao Cardápio
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <div key={item.menuItemId} className="card-highlight p-6 flex justify-between items-center">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-1">{item.name}</h3>
                    <p className="text-[#FFA24D] font-semibold">
                      R$ {(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 ml-6">
                    <div className="flex items-center gap-2 bg-gray-700 rounded-lg p-2">
                      <button
                        onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                        className="p-1 hover:bg-gray-600 rounded"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                        className="p-1 hover:bg-gray-600 rounded"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.menuItemId)}
                      className="p-2 hover:bg-red-900/30 rounded-lg transition"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="card-highlight p-6 h-fit">
              <h3 className="text-xl font-bold mb-6">Resumo</h3>

              <div className="space-y-3 mb-6 pb-6 border-b border-gray-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Itens ({items.length})</span>
                  <span>R$ {total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Entrega</span>
                  <span>Grátis</span>
                </div>
              </div>

              <div className="flex justify-between text-lg font-bold mb-6">
                <span>Total</span>
                <span className="text-[#FFA24D]">R$ {total.toFixed(2)}</span>
              </div>

              <button
                onClick={handleCheckout}
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Processando...' : 'Confirmar Pedido'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
