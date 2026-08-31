'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { Flame, Clock, CheckCircle } from 'lucide-react';

interface Order {
  id: string;
  status: string;
  totalPrice: number;
  estimatedTimeMinutes?: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

const statusMap = {
  pending: { label: 'Aguardando Confirmação', color: 'text-yellow-400' },
  confirmed: { label: 'Confirmado', color: 'text-blue-400' },
  preparing: { label: 'Preparando', color: 'text-orange-400' },
  ready: { label: 'Pronto!', color: 'text-green-400' },
  completed: { label: 'Entregue', color: 'text-green-500' },
  cancelled: { label: 'Cancelado', color: 'text-red-400' },
};

export default function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const { isAuthenticated } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrder();
    const interval = setInterval(loadOrder, 3000);
    return () => clearInterval(interval);
  }, [params.orderId]);

  const loadOrder = async () => {
    try {
      const response = await api.get(`/orders/${params.orderId}`);
      setOrder(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao carregar pedido');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Carregando pedido...</p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-gray-900">
        <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-2">
            <Flame className="w-8 h-8 text-orange-500" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
              Chapa Quente
            </h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="card-menu p-8 text-center">
            <p className="text-red-400 mb-4">{error || 'Pedido não encontrado'}</p>
          </div>
        </div>
      </main>
    );
  }

  const statusInfo = statusMap[order.status as keyof typeof statusMap];

  return (
    <main className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-2">
          <Flame className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
            Chapa Quente
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card-menu p-8 mb-8">
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-sm text-gray-400 mb-1">Pedido #</p>
              <p className="text-xl font-mono font-bold">{order.id.substring(0, 8)}</p>
            </div>
            <div className={`text-right ${statusInfo.color}`}>
              <p className="text-sm text-gray-400 mb-1">Status</p>
              <p className="text-xl font-bold">{statusInfo.label}</p>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-4 mb-8 pb-8 border-b border-gray-700">
            {(['pending', 'confirmed', 'preparing', 'ready'] as const).map((status) => (
              <div key={status} className="flex items-center gap-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    (['pending', 'confirmed', 'preparing', 'ready'].indexOf(status) <=
                    ['pending', 'confirmed', 'preparing', 'ready'].indexOf(order.status as any))
                      ? 'bg-green-500'
                      : 'bg-gray-700'
                  }`}
                />
                <span className="text-sm capitalize">{statusMap[status].label}</span>
              </div>
            ))}
          </div>

          {/* Estimated Time */}
          {order.estimatedTimeMinutes && order.status !== 'completed' && (
            <div className="flex items-center gap-2 text-orange-400 mb-6">
              <Clock className="w-5 h-5" />
              <span>Tempo estimado: {order.estimatedTimeMinutes} minutos</span>
            </div>
          )}

          {order.status === 'ready' && (
            <div className="flex items-center gap-2 text-green-400 mb-6">
              <CheckCircle className="w-5 h-5" />
              <span>Seu pedido está pronto! 🎉</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="card-menu p-8">
          <h3 className="text-xl font-bold mb-6">Itens do Pedido</h3>
          <div className="space-y-4 mb-6 pb-6 border-b border-gray-700">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-gray-500">Qtd: {item.quantity}</p>
                </div>
                <p className="font-semibold">R$ {(item.unitPrice * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-orange-500">R$ {order.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
