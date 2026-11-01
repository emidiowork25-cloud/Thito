'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { Flame, Clock, CheckCircle, Bike, WifiOff } from 'lucide-react';
import DeliveryMap from '@/components/DeliveryMap';

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
  out_for_delivery: { label: 'Saiu para Entrega', color: 'text-[#FFC107]' },
  completed: { label: 'Entregue', color: 'text-green-500' },
  cancelled: { label: 'Cancelado', color: 'text-red-400' },
};

interface Tracking {
  tracking: boolean;
  deliveryStatus?: string;
  courierName?: string | null;
  destination?: { lat: number; lng: number; address?: string } | null;
  courier?: { lat: number; lng: number } | null;
  trail?: Array<{ lat: number; lng: number }>;
  staleSeconds?: number | null;
  eta?: { etaMinutes: number; distanceMetres: number } | null;
}

// A ping lands every ~8s, so polling faster than that only burns battery.
const TRACKING_POLL_MS = 8000;

export default function OrderTrackingPage({ params }: { params: { orderId: string } }) {
  const { isAuthenticated } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadOrder();
    const interval = setInterval(loadOrder, 3000);
    return () => clearInterval(interval);
  }, [params.orderId]);

  // Tracking is only polled once the order is actually out for delivery, so
  // a pending order does not hit this endpoint every few seconds for nothing.
  useEffect(() => {
    if (order?.status !== 'out_for_delivery') {
      setTracking(null);
      return;
    }
    loadTracking();
    const interval = setInterval(loadTracking, TRACKING_POLL_MS);
    return () => clearInterval(interval);
  }, [order?.status, params.orderId]);

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

  const loadTracking = async () => {
    try {
      const response = await api.get(`/orders/${params.orderId}/tracking`);
      setTracking(response.data);
    } catch {
      // Tracking is supplementary; the order view stays usable without it.
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <p className="text-gray-400">Carregando pedido...</p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-[#1a1a1a]">
        <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-2">
            <Flame className="w-8 h-8 text-[#FFC107]" />
            <h1 className="text-2xl font-bold text-[#FFC107]">
              Chapa Quente
            </h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="card-highlight p-8 text-center">
            <p className="text-red-400 mb-4">{error || 'Pedido não encontrado'}</p>
          </div>
        </div>
      </main>
    );
  }

  const statusInfo = statusMap[order.status as keyof typeof statusMap];

  return (
    <main className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-2">
          <Flame className="w-8 h-8 text-[#FFC107]" />
          <h1 className="text-2xl font-bold text-[#FFC107]">
            Chapa Quente
          </h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card-highlight p-8 mb-8">
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
            {(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] as const).map((status) => (
              <div key={status} className="flex items-center gap-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    (['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].indexOf(status) <=
                    ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'].indexOf(order.status as any))
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

        {/* Live delivery tracking */}
        {tracking?.tracking && (
          <div className="card-highlight p-5 sm:p-8 mb-8">
            <div className="flex items-center justify-between mb-5 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Bike className="w-5 h-5 text-[#FFC107] shrink-0" />
                <h3 className="text-lg sm:text-xl font-bold truncate">
                  {tracking.courierName
                    ? `${tracking.courierName} a caminho`
                    : 'Pedido a caminho'}
                </h3>
              </div>
              {tracking.eta && (
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-[#FFC107] leading-none">
                    {tracking.eta.etaMinutes} min
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {(tracking.eta.distanceMetres / 1000).toFixed(1)} km
                  </p>
                </div>
              )}
            </div>

            {tracking.courier ? (
              <DeliveryMap
                courier={tracking.courier}
                destination={tracking.destination ?? null}
                trail={tracking.trail ?? []}
                stale={(tracking.staleSeconds ?? 0) > 60}
                className="h-72"
              />
            ) : (
              <p className="text-gray-400 text-sm py-6 text-center">
                Aguardando o entregador iniciar o rastreio...
              </p>
            )}

            {/* The courier's phone stops reporting when it locks, so silence
                is shown as silence rather than a pin frozen in place. */}
            {tracking.courier && (tracking.staleSeconds ?? 0) > 60 && (
              <div className="mt-4 flex items-start gap-2 text-sm text-gray-400">
                <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Última posição há {Math.round((tracking.staleSeconds ?? 0) / 60)} min.
                  O entregador pode estar com a tela bloqueada.
                </span>
              </div>
            )}

            {tracking.eta && (
              <p className="text-xs text-gray-500 mt-4">
                Tempo estimado por distância e velocidade média — não considera
                trânsito.
              </p>
            )}
          </div>
        )}

        {/* Items */}
        <div className="card-highlight p-8">
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
            <span className="text-[#FFC107]">R$ {order.totalPrice.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}
