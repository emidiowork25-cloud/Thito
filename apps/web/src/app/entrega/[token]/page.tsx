'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import DeliveryMap from '@/components/DeliveryMap';
import { Flame, MapPin, Navigation, Check, AlertTriangle, Loader2 } from 'lucide-react';

interface Delivery {
  deliveryId: string;
  status: string;
  storeName: string;
  courierName?: string | null;
  destination: { lat?: number; lng?: number; address?: string };
  notes?: string | null;
  totalPrice: number;
  items: Array<{ name: string; quantity: number }>;
}

interface Position {
  lat: number;
  lng: number;
}

// Far enough apart to be worth a round trip, close enough that the customer's
// pin moves smoothly. The ping endpoint allows 30/min; this stays well under.
const PING_INTERVAL_MS = 8000;

export default function CourierPage({ params }: { params: { token: string } }) {
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [sharing, setSharing] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [eta, setEta] = useState<{ etaMinutes: number; distanceMetres: number } | null>(null);
  const [geoError, setGeoError] = useState('');
  const [completed, setCompleted] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastSentRef = useRef(0);

  // The token is the credential, so these calls carry no auth header and
  // must not go through the axios client that redirects on 401.
  const endpoint = `/api/delivery/${params.token}`;

  useEffect(() => {
    fetch(endpoint)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || 'Link inválido');
        setDelivery(body);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [endpoint]);

  const sendPing = useCallback(
    async (coords: GeolocationCoordinates) => {
      const now = Date.now();
      if (now - lastSentRef.current < PING_INTERVAL_MS) return;
      lastSentRef.current = now;

      try {
        const res = await fetch(`${endpoint}/ping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy ?? undefined,
            speed: coords.speed != null && coords.speed >= 0 ? coords.speed : undefined,
            heading:
              coords.heading != null && !Number.isNaN(coords.heading)
                ? coords.heading
                : undefined,
          }),
        });
        const body = await res.json();
        if (res.ok && body.eta) setEta(body.eta);
        if (!res.ok) setGeoError(body?.error?.message || 'Falha ao enviar posição');
        else setGeoError('');
      } catch {
        // A dropped request is normal on mobile data; the next tick retries.
      }
    },
    [endpoint]
  );

  const startSharing = async () => {
    if (!('geolocation' in navigator)) {
      setGeoError('Este aparelho não suporta geolocalização');
      return;
    }

    setGeoError('');
    setSharing(true);

    // Keeps the screen awake. The browser suspends the page when the screen
    // locks, which freezes the tracking — this is what prevents that, where
    // the browser supports it.
    try {
      wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
    } catch {
      // Not fatal: tracking still works while the courier keeps the screen on.
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        sendPing(pos.coords);
      },
      (err) => {
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? 'Permissão de localização negada. Autorize nas configurações do navegador.'
            : 'Não foi possível obter a localização'
        );
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  };

  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
    setSharing(false);
  }, []);

  useEffect(() => stopSharing, [stopSharing]);

  // A wake lock is dropped when the tab is hidden and is not restored on its
  // own, so it is re-acquired when the courier comes back to the page.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState === 'visible' && sharing && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock?.request('screen');
        } catch {
          /* keep going without it */
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sharing]);

  const completeDelivery = async () => {
    if (!confirm('Confirmar que o pedido foi entregue?')) return;
    try {
      const res = await fetch(`${endpoint}/complete`, { method: 'POST' });
      if (res.ok) {
        stopSharing();
        setCompleted(true);
      } else {
        const body = await res.json();
        setGeoError(body?.error?.message || 'Falha ao concluir');
      }
    } catch {
      setGeoError('Falha de conexão ao concluir');
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-[#FFC107]">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando entrega...
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-4">
        <div className="card-highlight p-8 text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-[#FFC107] mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Link indisponível</h1>
          <p className="text-gray-400">{loadError}</p>
        </div>
      </main>
    );
  }

  if (completed) {
    return (
      <main className="min-h-screen bg-[#1a1a1a] flex items-center justify-center px-4">
        <div className="card-highlight p-8 text-center max-w-sm">
          <Check className="w-14 h-14 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Entrega concluída</h1>
          <p className="text-gray-400">Obrigado! Pode fechar esta página.</p>
        </div>
      </main>
    );
  }

  const destination =
    delivery?.destination.lat != null && delivery?.destination.lng != null
      ? { lat: delivery.destination.lat, lng: delivery.destination.lng }
      : null;

  return (
    <main className="min-h-screen bg-[#1a1a1a] pb-32">
      <header className="border-b border-[#FFC107]/20 sticky top-0 safe-top z-50 bg-[#1a1a1a]/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <Flame className="w-7 h-7 text-[#FFC107] shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#FFC107] truncate">Entrega</h1>
            <p className="text-xs text-gray-400 truncate">{delivery?.storeName}</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        <div className="card-highlight p-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-[#FFC107] shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-1">Endereço de entrega</p>
              <p className="font-semibold break-words">
                {delivery?.destination.address || 'Endereço não informado'}
              </p>
              {delivery?.notes && (
                <p className="text-sm text-gray-400 mt-2">Obs: {delivery.notes}</p>
              )}
            </div>
          </div>
        </div>

        <DeliveryMap courier={position} destination={destination} className="h-64" />

        {eta && (
          <div className="card-highlight p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Tempo estimado</p>
              <p className="text-2xl font-bold text-[#FFC107]">{eta.etaMinutes} min</p>
            </div>
            <p className="text-sm text-gray-400">
              {(eta.distanceMetres / 1000).toFixed(1)} km
            </p>
          </div>
        )}

        <div className="card-highlight p-4">
          <p className="text-xs text-gray-400 mb-2">Itens</p>
          <ul className="space-y-1">
            {delivery?.items.map((item, i) => (
              <li key={i} className="text-sm">
                {item.quantity}x {item.name}
              </li>
            ))}
          </ul>
          <p className="text-lg font-bold text-[#FFC107] mt-3">
            R$ {Number(delivery?.totalPrice ?? 0).toFixed(2)}
          </p>
        </div>

        {sharing && (
          <div className="p-4 rounded-lg bg-[#FFC107]/10 border border-[#FFC107]/30 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-[#FFC107] shrink-0" />
            <p className="text-sm text-[#FFC107]">
              Mantenha esta tela aberta e o celular desbloqueado. Se bloquear a
              tela ou trocar de app, o rastreio para e o cliente deixa de ver
              sua posição.
            </p>
          </div>
        )}

        {geoError && (
          <div className="p-4 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm">
            {geoError}
          </div>
        )}
      </div>

      {/* Fixed so the main action is reachable with a thumb while riding. */}
      <div className="fixed bottom-0 inset-x-0 bg-[#1a1a1a]/95 backdrop-blur border-t border-[#FFC107]/20 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto flex gap-3">
          {sharing ? (
            <button onClick={stopSharing} className="btn-secondary flex-1 min-h-[52px]">
              Pausar rastreio
            </button>
          ) : (
            <button
              onClick={startSharing}
              className="btn-primary flex-1 min-h-[52px] flex items-center justify-center gap-2"
            >
              <Navigation className="w-5 h-5" />
              Iniciar rastreio
            </button>
          )}
          <button
            onClick={completeDelivery}
            className="flex-1 min-h-[52px] rounded-lg font-bold bg-green-700 hover:bg-green-600 text-white flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Entreguei
          </button>
        </div>
      </div>
    </main>
  );
}
