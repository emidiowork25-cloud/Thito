'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { Flame, Trash2, Minus, Plus, ArrowLeft, MapPin, LocateFixed } from 'lucide-react';

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { items, storeId, removeItem, updateQuantity, clear, total } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  // Coordinates come from the device rather than from geocoding the typed
  // text: it is exact, needs no external service, and the address string
  // stays as the human-readable version the courier reads.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  // Redirect from an effect, not from render: useAuth reports null until it
  // has read localStorage, so redirecting during render bounced signed-in
  // users to /login on every refresh (and broke prerendering).
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-[#FFC107]">
        Carregando...
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('Este aparelho não suporta geolocalização');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError('Não foi possível obter sua localização. Autorize no navegador.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleCheckout = async () => {
    if (!storeId || items.length === 0) {
      setError('Carrinho vazio ou loja não selecionada');
      return;
    }
    if (address.trim().length < 5) {
      setError('Informe o endereço de entrega');
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
          customizations: item.customizations,
        })),
        deliveryAddress: address.trim(),
        ...(coords ? { deliveryLat: coords.lat, deliveryLng: coords.lng } : {}),
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
    <main className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-[#FFC107]/20 sticky top-0 safe-top z-50 bg-[#1a1a1a]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Flame className="w-8 h-8 text-[#FFC107]" />
            <h1 className="text-2xl font-bold text-[#FFC107]">
              Chapa Quente
            </h1>
          </div>

          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition min-h-[44px] px-2 -mr-2"
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
                <div key={item.menuItemId} className="card-highlight p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold mb-1">{item.name}</h3>
                      <p className="text-[#FFC107] font-semibold">
                        R$ {(item.price * item.quantity).toFixed(2)}
                      </p>
                    </div>

                    <button
                      onClick={() => removeItem(item.menuItemId)}
                      aria-label={`Remover ${item.name} do carrinho`}
                      className="tap-target hover:bg-red-900/30 rounded-lg transition ml-2 shrink-0"
                    >
                      <Trash2 className="w-5 h-5 text-red-400" />
                    </button>
                  </div>

                  {/* Customizações */}
                  {item.customizations && (
                    <div className="mb-4 pb-4 border-b border-gray-700">
                      <p className="text-xs text-gray-500 mb-2 uppercase font-semibold">Customizações:</p>
                      <div className="space-y-1">
                        {item.customizations.removed.map((ing, idx) => (
                          <p key={idx} className="text-sm text-red-400">
                            ✕ Sem {ing}
                          </p>
                        ))}
                        {item.customizations.added.map((ing, idx) => (
                          <p key={idx} className="text-sm text-green-400">
                            ➕ Com {ing}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-gray-700 rounded-lg p-1">
                      <button
                        onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                        aria-label={`Diminuir quantidade de ${item.name}`}
                        className="tap-target hover:bg-gray-600 rounded"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <span className="w-10 text-center font-semibold text-lg">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                        aria-label={`Aumentar quantidade de ${item.name}`}
                        className="tap-target hover:bg-gray-600 rounded"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="card-highlight p-6 h-fit">
              <h3 className="text-xl font-bold mb-6">Resumo</h3>

              {/* Delivery address */}
              <div className="mb-6 pb-6 border-b border-gray-700">
                <label
                  htmlFor="delivery-address"
                  className="flex items-center gap-2 text-sm font-semibold mb-2"
                >
                  <MapPin className="w-4 h-4 text-[#FFC107]" />
                  Endereço de entrega
                </label>
                <textarea
                  id="delivery-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, número, complemento e ponto de referência"
                  rows={3}
                  maxLength={300}
                  className="w-full px-4 py-2 bg-gray-800 border border-[#FFC107]/30 rounded-lg focus:outline-none focus:border-[#FFC107] text-white placeholder-gray-500 resize-none"
                />

                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locating}
                  className="mt-3 w-full min-h-[44px] rounded-lg border border-[#FFC107]/40 text-[#FFC107] text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#FFC107]/10 transition-all disabled:opacity-50"
                >
                  <LocateFixed className="w-4 h-4" />
                  {locating
                    ? 'Obtendo localização...'
                    : coords
                      ? 'Localização confirmada ✓'
                      : 'Usar minha localização atual'}
                </button>

                <p className="text-xs text-gray-500 mt-2">
                  {coords
                    ? 'Você poderá acompanhar o entregador no mapa.'
                    : 'Sem a localização o pedido funciona, mas não dá para acompanhar o entregador no mapa.'}
                </p>
              </div>

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
                <span className="text-[#FFC107]">R$ {total.toFixed(2)}</span>
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
