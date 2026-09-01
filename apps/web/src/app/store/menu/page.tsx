'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Flame, Plus, Edit2, Trash2, Upload, X, Check } from 'lucide-react';

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

interface FormState {
  name: string;
  description: string;
  ingredients: string;
  price: string;
  category: string;
  imageUrl?: string;
}

export default function StoreMenuPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState>({
    name: '',
    description: '',
    ingredients: '',
    price: '',
    category: '',
  });

  useEffect(() => {
    // useAuth reports null until it has read localStorage, so acting on the
    // first render bounced signed-in owners to /login on every refresh.
    if (authLoading) return;

    if (!isAuthenticated || user?.userType !== 'store') {
      router.push('/login');
      return;
    }
    loadMenuItems();
  }, [authLoading, isAuthenticated, user]);

  const loadMenuItems = async () => {
    setLoading(true);
    try {
      const response = await api.get('/menu');
      setMenuItems(response.data);
    } catch (err) {
      console.error('Erro ao carregar itens:', err);
      setError('Erro ao carregar cardápio');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm({ ...form, imageUrl: response.data.imageUrl });
      setError('');
    } catch (err) {
      setError('Erro ao fazer upload da imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.price) {
      setError('Nome e preço são obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const data = {
        name: form.name,
        description: form.description || null,
        ingredients: form.ingredients || null,
        price: parseFloat(form.price),
        category: form.category || null,
        imageUrl: form.imageUrl || null,
      };

      if (editingId) {
        await api.put(`/menu/${editingId}`, data);
      } else {
        await api.post('/menu', data);
      }

      setForm({ name: '', description: '', ingredients: '', price: '', category: '' });
      setEditingId(null);
      setShowForm(false);
      setError('');
      loadMenuItems();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erro ao salvar item');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: MenuItem) => {
    setForm({
      name: item.name,
      description: item.description || '',
      ingredients: item.ingredients || '',
      price: item.price.toString(),
      category: item.category || '',
      imageUrl: item.imageUrl,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Tem certeza que deseja deletar este item?')) return;

    try {
      await api.delete(`/menu/${itemId}`);
      loadMenuItems();
    } catch (err) {
      setError('Erro ao deletar item');
    }
  };

  const resetForm = () => {
    setForm({ name: '', description: '', ingredients: '', price: '', category: '' });
    setEditingId(null);
    setShowForm(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center text-[#FFC107]">
        Carregando...
      </div>
    );
  }

  if (!isAuthenticated || user?.userType !== 'store') {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#1a1a1a]">
      {/* Header */}
      <header className="border-b border-[#FFC107]/20 bg-[#1a1a1a]/90 backdrop-blur sticky top-0 safe-top z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-8 h-8 text-[#FFC107]" />
              <div>
                <h1 className="text-2xl font-bold text-[#FFC107]">
                  Gerenciar Cardápio
                </h1>
                <p className="text-sm text-gray-400">Chapa Quente</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/store/dashboard')}
              className="btn-secondary text-sm"
            >
              Voltar ao Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-400 flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-xs underline">
              Descartar
            </button>
          </div>
        )}

        {/* Add Button */}
        <div className="mb-8 flex justify-between items-center">
          <h2 className="text-3xl font-bold">Seus Itens</h2>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Novo Item
            </button>
          )}
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="card-highlight p-8 mb-12 border border-[#FFC107]/30">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">
                {editingId ? 'Editar Item' : 'Adicionar Novo Item'}
              </h3>
              <button onClick={resetForm} className="p-1 hover:bg-gray-700 rounded">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Image Upload */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-3">Foto do Prato</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#FFC107]/50 rounded-lg p-8 text-center cursor-pointer hover:border-[#FFC107] transition-all"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploading}
                  />
                  {form.imageUrl ? (
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={form.imageUrl}
                        alt="Preview"
                        className="h-40 w-40 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => setForm({ ...form, imageUrl: undefined })}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        Remover imagem
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-[#FFC107]" />
                      <p className="font-semibold">
                        {uploading ? 'Enviando...' : 'Clique para enviar a foto'}
                      </p>
                      <p className="text-sm text-gray-400">PNG, JPG até 10MB</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold mb-2">Nome do Prato *</label>
                <input
                  type="text"
                  placeholder="Ex: Hamburger Especial"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107]"
                />
              </div>

              {/* Price */}
              <div>
                <label className="block text-sm font-semibold mb-2">Preço *</label>
                <div className="flex items-center">
                  <span className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-l-lg border-r-0">
                    R$
                  </span>
                  <input
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-r-lg focus:outline-none focus:border-[#FFC107]"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-semibold mb-2">Categoria</label>
                <input
                  type="text"
                  placeholder="Ex: Burgers, Bebidas"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107]"
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-2">Descrição</label>
                <textarea
                  placeholder="Descreva o prato (sabor, presentação, etc.)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107] h-20 resize-none"
                />
              </div>

              {/* Ingredients */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-2">Ingredientes</label>
                <textarea
                  placeholder="Separe os ingredientes por vírgula ou quebra de linha"
                  value={form.ingredients}
                  onChange={(e) => setForm({ ...form, ingredients: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-[#FFC107] h-24 resize-none"
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 btn-primary flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {loading ? 'Salvando...' : editingId ? 'Atualizar Item' : 'Criar Item'}
              </button>
              <button onClick={resetForm} className="flex-1 btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Items Grid */}
        {loading && !showForm ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Carregando itens...</p>
          </div>
        ) : menuItems.length === 0 ? (
          <div className="card-highlight p-12 text-center">
            <p className="text-gray-400 mb-6">Seu cardápio ainda está vazio</p>
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary inline-block"
            >
              Adicionar Primeiro Item
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item) => (
              <div key={item.id} className="card-highlight overflow-hidden flex flex-col">
                {/* Image */}
                {item.imageUrl && (
                  <div className="h-40 overflow-hidden bg-gray-700">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 p-4 flex flex-col">
                  <h3 className="text-lg font-bold mb-1">{item.name}</h3>

                  {item.category && (
                    <p className="text-xs text-[#FFC107] mb-2 uppercase font-semibold">
                      {item.category}
                    </p>
                  )}

                  {item.description && (
                    <p className="text-sm text-gray-400 mb-2 flex-1">{item.description}</p>
                  )}

                  {item.ingredients && (
                    <div className="mb-3 pb-3 border-b border-gray-700">
                      <p className="text-xs text-gray-500 mb-1">Ingredientes:</p>
                      <p className="text-xs text-gray-400">
                        {item.ingredients.substring(0, 100)}
                        {item.ingredients.length > 100 ? '...' : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-between items-center mb-4">
                    <p className="text-lg font-bold text-[#FFC107]">
                      R$ {item.price.toFixed(2)}
                    </p>
                    {item.isAvailable ? (
                      <span className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded font-semibold">
                        Disponível
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-red-900/30 text-red-400 text-xs rounded font-semibold">
                        Indisponível
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="flex-1 px-3 min-h-[44px] bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" />
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="flex-1 px-3 min-h-[44px] bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Deletar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
