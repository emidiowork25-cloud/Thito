'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Flame, Plus, Edit2, Trash2, Clock, CheckCircle } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  isAvailable: boolean;
}

interface Order {
  id: string;
  status: string;
  totalPrice: number;
  estimatedTimeMinutes?: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
}

export default function StoreDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [tab, setTab] = useState<'orders' | 'menu'>('orders');

  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: '', description: '', category: '' });

  useEffect(() => {
    if (!isAuthenticated || user?.userType !== 'store') {
      router.push('/login');
      return;
    }

    loadOrders();
    loadMenuItems();
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  const loadOrders = async () => {
    try {
      const response = await api.get('/orders/store/dashboard', { params: { status: 'all', limit: 20 } });
      setOrders(response.data.orders);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    }
  };

  const loadMenuItems = async () => {
    setLoading(true);
    try {
      // This would need a proper endpoint to get store's menu items
      // For now, we'll keep it empty or create the endpoint
    } catch (err) {
      console.error('Erro ao carregar itens:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMenuItem = async () => {
    if (!newItem.name || !newItem.price) {
      setError('Nome e preço são obrigatórios');
      return;
    }

    try {
      const response = await api.post('/menu', {
        name: newItem.name,
        price: parseFloat(newItem.price),
        description: newItem.description,
        category: newItem.category,
      });

      setMenuItems([...menuItems, response.data]);
      setNewItem({ name: '', price: '', description: '', category: '' });
      setShowNewItemForm(false);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao criar item');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const estimatedTime = newStatus === 'preparing' ? 15 : undefined;
      await api.patch(`/orders/${orderId}/status`, {
        status: newStatus,
        ...(estimatedTime && { estimatedTime }),
      });
      loadOrders();
    } catch (err) {
      setError('Erro ao atualizar status');
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    if (!confirm('Tem certeza que deseja deletar este item?')) return;

    try {
      await api.delete(`/menu/${itemId}`);
      setMenuItems(menuItems.filter((item) => item.id !== itemId));
    } catch (err) {
      setError('Erro ao deletar item');
    }
  };

  if (!isAuthenticated || user?.userType !== 'store') {
    return null;
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;

  return (
    <main className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-[#FFC107]/20 bg-[#1a1a1a]/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-8 h-8 text-[#FFC107]" />
              <div>
                <h1 className="text-2xl font-bold text-[#FFC107]">
                  Chapa Quente
                </h1>
                <p className="text-sm text-gray-400">Dashboard - {user?.name}</p>
              </div>
            </div>

            <button
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                router.push('/');
              }}
              className="btn-secondary text-sm"
            >
              Sair
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setTab('orders')}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                tab === 'orders'
                  ? 'bg-[#FFC107] text-[#1a1a1a]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Pedidos {pendingOrders > 0 && `(${pendingOrders})`}
            </button>
            <button
              onClick={() => setTab('menu')}
              className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                tab === 'menu'
                  ? 'bg-[#FFC107] text-[#1a1a1a]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Cardápio
            </button>
            <button
              onClick={() => router.push('/store/menu')}
              className="px-6 py-2 rounded-lg font-semibold bg-[#FFC107]/20 text-[#FFC107] hover:bg-[#FFC107]/30 transition-all ml-auto"
            >
              ➜ Gerenciar Itens Completo
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400">
            {error}
            <button onClick={() => setError('')} className="ml-4 text-xs underline">
              Descartar
            </button>
          </div>
        )}

        {/* Orders Tab */}
        {tab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <div className="card-highlight p-8 text-center">
                <p className="text-gray-400">Nenhum pedido ainda</p>
              </div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="card-highlight p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold"># {order.id.substring(0, 8)}</h3>
                      <p className="text-sm text-gray-400">
                        {new Date(order.createdAt).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>

                    <div className={`px-4 py-2 rounded-lg font-semibold text-sm ${
                      order.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' :
                      order.status === 'confirmed' ? 'bg-blue-900/30 text-blue-400' :
                      order.status === 'preparing' ? 'bg-orange-900/30 text-orange-400' :
                      order.status === 'ready' ? 'bg-green-900/30 text-green-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {order.status === 'pending' ? '⏳ Aguardando' :
                       order.status === 'confirmed' ? '✓ Confirmado' :
                       order.status === 'preparing' ? '👨‍🍳 Preparando' :
                       order.status === 'ready' ? '✨ Pronto' :
                       '✅ Entregue'}
                    </div>
                  </div>

                  <div className="mb-4 pb-4 border-b border-gray-700">
                    <p className="text-sm text-gray-400 mb-2">Itens:</p>
                    <div className="space-y-1">
                      {order.items.map((item, i) => (
                        <p key={i} className="text-sm">
                          {item.quantity}x {item.name}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center mb-4">
                    <p className="text-lg font-bold text-[#FFC107]">
                      R$ {order.totalPrice.toFixed(2)}
                    </p>
                    {order.estimatedTimeMinutes && (
                      <p className="text-sm text-gray-400 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {order.estimatedTimeMinutes} min
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => handleUpdateOrderStatus(order.id, 'confirmed')}
                        className="flex-1 px-4 py-2 bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 rounded-lg text-sm font-semibold transition-all"
                      >
                        Confirmar
                      </button>
                    )}
                    {order.status === 'confirmed' && (
                      <button
                        onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                        className="flex-1 px-4 py-2 bg-orange-900/30 hover:bg-orange-900/50 text-orange-400 rounded-lg text-sm font-semibold transition-all"
                      >
                        Começar Preparo
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => handleUpdateOrderStatus(order.id, 'ready')}
                        className="flex-1 px-4 py-2 bg-green-900/30 hover:bg-green-900/50 text-green-400 rounded-lg text-sm font-semibold transition-all"
                      >
                        Marcar Pronto
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <button
                        onClick={() => handleUpdateOrderStatus(order.id, 'completed')}
                        className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-all"
                      >
                        Entregue
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Menu Tab */}
        {tab === 'menu' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Cardápio</h2>
              <button
                onClick={() => setShowNewItemForm(!showNewItemForm)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Novo Item
              </button>
            </div>

            {/* New Item Form */}
            {showNewItemForm && (
              <div className="card-highlight p-6">
                <h3 className="text-lg font-bold mb-6">Adicionar Item</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Nome do item"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107]"
                  />

                  <input
                    type="number"
                    placeholder="Preço"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    step="0.01"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107]"
                  />

                  <input
                    type="text"
                    placeholder="Categoria (opcional)"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107]"
                  />

                  <textarea
                    placeholder="Descrição (opcional)"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-orange-500 h-20 resize-none"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateMenuItem}
                      className="flex-1 btn-primary"
                    >
                      Criar Item
                    </button>
                    <button
                      onClick={() => setShowNewItemForm(false)}
                      className="flex-1 btn-secondary"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Items */}
            {menuItems.length === 0 ? (
              <div className="card-highlight p-8 text-center">
                <p className="text-gray-400 mb-4">Seu cardápio ainda está vazio</p>
                <button
                  onClick={() => setShowNewItemForm(true)}
                  className="btn-primary inline-block"
                >
                  Adicionar Primeiro Item
                </button>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {menuItems.map((item) => (
                  <div key={item.id} className="card-highlight p-6">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-lg font-bold flex-1">{item.name}</h3>
                      <span className="text-[#FFC107] font-bold">R$ {item.price.toFixed(2)}</span>
                    </div>

                    {item.description && (
                      <p className="text-sm text-gray-400 mb-3">{item.description}</p>
                    )}

                    {item.category && (
                      <p className="text-xs text-gray-500 mb-4">{item.category}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteMenuItem(item.id)}
                        className="flex-1 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Deletar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
