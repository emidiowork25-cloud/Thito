'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { Flame, ShoppingCart, Plus } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  imageUrl?: string;
  isAvailable: boolean;
}

export default function MenuPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();
  const { addItem, itemCount, storeId, setStoreId } = useCart();

  const [storeIdParam, setStoreIdParam] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const categories = Array.from(new Set(menuItems.map((item) => item.category).filter(Boolean)));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storeId = params.get('storeId');
    if (storeId) {
      setStoreIdParam(storeId);
      setStoreId(storeId);
      loadMenu(storeId);
    }
  }, [setStoreId]);

  const loadMenu = async (storeId: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/menu', { params: { storeId } });
      setMenuItems(response.data);
    } catch (err) {
      setError('Erro ao carregar cardápio');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center">Carregando...</div>;
  }

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  if (!storeIdParam) {
    return (
      <main className="min-h-screen bg-gray-900">
        <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Flame className="w-8 h-8 text-orange-500" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
                Chapa Quente
              </h1>
            </div>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-12">
          <p className="text-gray-400">Selecione uma loja para ver o cardápio</p>
        </div>
      </main>
    );
  }

  const filteredItems = selectedCategory
    ? menuItems.filter((item) => item.category === selectedCategory)
    : menuItems;

  return (
    <main className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700 sticky top-0 z-50 bg-gray-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Flame className="w-8 h-8 text-orange-500" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-600 bg-clip-text text-transparent">
              Chapa Quente
            </h1>
          </div>

          <button
            onClick={() => router.push('/cart')}
            className="relative btn-primary flex items-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            Carrinho ({itemCount})
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        {error && (
          <div className="mb-8 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Categories */}
        {categories.length > 0 && (
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-6 py-2 rounded-lg font-semibold whitespace-nowrap transition-all ${
                selectedCategory === ''
                  ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Todos
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-6 py-2 rounded-lg font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* Menu Items Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-400">Carregando cardápio...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-400">Nenhum item disponível</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredItems.map((item) => (
              <div key={item.id} className="card-menu overflow-hidden">
                {item.imageUrl && (
                  <div className="h-40 bg-gray-700 overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                )}

                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2">{item.name}</h3>
                  {item.description && <p className="text-sm text-gray-400 mb-4">{item.description}</p>}

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-2xl font-bold text-orange-500">
                        R$ {item.price.toFixed(2)}
                      </p>
                      {item.category && <p className="text-xs text-gray-500">{item.category}</p>}
                    </div>

                    <button
                      onClick={() =>
                        addItem({
                          menuItemId: item.id,
                          name: item.name,
                          price: item.price,
                          quantity: 1,
                        })
                      }
                      disabled={!item.isAvailable}
                      className={`p-3 rounded-lg transition-all ${
                        item.isAvailable
                          ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {!item.isAvailable && <p className="text-xs text-red-400 mt-2">Indisponível</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
