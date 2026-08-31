'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/hooks/useCart';
import { Flame, ShoppingCart, Plus, X, Trash2 } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  ingredients?: string;
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
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [customizations, setCustomizations] = useState<{ removed: string[]; added: string[] }>({
    removed: [],
    added: [],
  });
  const [newIngredient, setNewIngredient] = useState('');
  const categories = Array.from(new Set(menuItems.map((item) => item.category).filter((c): c is string => Boolean(c))));

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

  const handleOpenCustomizer = (item: MenuItem) => {
    setSelectedItem(item);
    setCustomizations({ removed: [], added: [] });
    setNewIngredient('');
  };

  const toggleIngredient = (ingredient: string) => {
    if (customizations.removed.includes(ingredient)) {
      setCustomizations({
        ...customizations,
        removed: customizations.removed.filter((i) => i !== ingredient),
      });
    } else {
      setCustomizations({
        ...customizations,
        removed: [...customizations.removed, ingredient],
      });
    }
  };

  const addIngredient = () => {
    if (newIngredient.trim()) {
      setCustomizations({
        ...customizations,
        added: [...customizations.added, newIngredient.trim()],
      });
      setNewIngredient('');
    }
  };

  const removeAddedIngredient = (index: number) => {
    setCustomizations({
      ...customizations,
      added: customizations.added.filter((_, i) => i !== index),
    });
  };

  const handleAddToCart = () => {
    if (selectedItem) {
      addItem({
        menuItemId: selectedItem.id,
        name: selectedItem.name,
        price: selectedItem.price,
        quantity: 1,
        ingredients: selectedItem.ingredients,
        customizations:
          customizations.removed.length > 0 || customizations.added.length > 0
            ? customizations
            : undefined,
      });
      setSelectedItem(null);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">Carregando...</div>;
  }

  if (!isAuthenticated) {
    router.push('/login');
    return null;
  }

  if (!storeIdParam) {
    return (
      <main className="min-h-screen bg-[#1a1a1a]">
        <header className="border-b border-[#FFC107]/20 sticky top-0 z-50 bg-[#1a1a1a]/90 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Flame className="w-8 h-8 text-[#FFC107]" />
              <h1 className="text-2xl font-bold text-[#FFC107]">
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
                  ? 'bg-[#FFC107] text-[#1a1a1a]'
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
                    ? 'bg-[#FFC107] text-[#1a1a1a]'
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
                      <p className="text-2xl font-bold text-[#FFC107]">
                        R$ {item.price.toFixed(2)}
                      </p>
                      {item.category && <p className="text-xs text-gray-500">{item.category}</p>}
                    </div>

                    <button
                      onClick={() => handleOpenCustomizer(item)}
                      disabled={!item.isAvailable}
                      className={`p-3 rounded-lg transition-all ${
                        item.isAvailable
                          ? 'bg-[#FFC107] text-[#1a1a1a] hover:bg-[#FFD700]'
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

      {/* Customization Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-highlight w-full max-w-2xl max-h-[90vh] overflow-y-auto border-2 border-[#FFC107]/50">
            {/* Header */}
            <div className="sticky top-0 bg-[#FFC107]/10 border-b border-[#FFC107]/30 p-6 flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-3xl font-bold mb-2">{selectedItem.name}</h2>
                {selectedItem.description && (
                  <p className="text-gray-400">{selectedItem.description}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-2 hover:bg-gray-700 rounded-lg transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Image */}
              {selectedItem.imageUrl && (
                <div className="rounded-lg overflow-hidden border border-[#FFC107]/20">
                  <img
                    src={selectedItem.imageUrl}
                    alt={selectedItem.name}
                    className="w-full h-60 object-cover"
                  />
                </div>
              )}

              {/* Price Info */}
              <div className="bg-[#FFC107]/10 border border-[#FFC107]/20 rounded-lg p-4">
                <p className="text-sm text-gray-400 mb-1">Preço</p>
                <p className="text-3xl font-bold text-[#FFC107]">R$ {selectedItem.price.toFixed(2)}</p>
              </div>

              {/* Ingredients - Remover */}
              {selectedItem.ingredients && (
                <div>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span className="text-[#FFC107]">🥘</span>
                    Ingredientes Originais
                  </h3>
                  <div className="space-y-2">
                    {selectedItem.ingredients.split('\n').map((ing, idx) => {
                      const ingredient = ing.trim();
                      return (
                        ingredient && (
                          <button
                            key={idx}
                            onClick={() => toggleIngredient(ingredient)}
                            className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                              customizations.removed.includes(ingredient)
                                ? 'bg-red-900/30 border-red-500 text-red-300 line-through'
                                : 'bg-gray-700/50 border-gray-600 hover:border-[#FFC107] text-gray-200'
                            }`}
                          >
                            <span className="mr-3">
                              {customizations.removed.includes(ingredient) ? '✕' : '✓'}
                            </span>
                            {ingredient}
                          </button>
                        )
                      );
                    })}
                  </div>
                  {customizations.removed.length > 0 && (
                    <p className="text-sm text-red-400 mt-3 flex items-center gap-1">
                      <span>✕</span>
                      Removendo: {customizations.removed.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {/* Ingredients - Adicionar */}
              <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-[#FFC107]">➕</span>
                  Adicionar Ingredientes
                </h3>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Ex: Bacon, Ovo, Queijo Extra"
                    value={newIngredient}
                    onChange={(e) => setNewIngredient(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addIngredient()}
                    className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107]"
                  />
                  <button
                    onClick={addIngredient}
                    className="px-6 py-3 bg-[#FFC107] text-[#1a1a1a] rounded-lg font-semibold hover:bg-[#FFD700] transition-all"
                  >
                    Adicionar
                  </button>
                </div>

                {customizations.added.length > 0 && (
                  <div className="space-y-2">
                    {customizations.added.map((ing, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-4 py-3 bg-green-900/30 border border-green-500/50 rounded-lg text-green-300"
                      >
                        <span className="flex items-center gap-2">
                          <span>➕</span>
                          {ing}
                        </span>
                        <button
                          onClick={() => removeAddedIngredient(idx)}
                          className="p-1 hover:bg-green-900/50 rounded transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumo de Customizações */}
              {(customizations.removed.length > 0 || customizations.added.length > 0) && (
                <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-lg p-4">
                  <p className="text-sm font-semibold mb-2">Suas Customizações:</p>
                  <ul className="text-sm text-gray-300 space-y-1">
                    {customizations.removed.map((ing, idx) => (
                      <li key={idx}>✕ Sem {ing}</li>
                    ))}
                    {customizations.added.map((ing, idx) => (
                      <li key={idx}>➕ Com {ing}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-gradient-to-t from-[#1a1a1a] to-transparent border-t border-[#FFC107]/30 p-6 flex gap-3">
              <button
                onClick={() => setSelectedItem(null)}
                className="flex-1 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddToCart}
                className="flex-1 px-6 py-3 bg-[#FFC107] text-[#1a1a1a] hover:bg-[#FFD700] rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                Adicionar ao Carrinho
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
