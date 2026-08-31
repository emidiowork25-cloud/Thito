import { useCartStore } from '@/store/cartStore';

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

export function useCart() {
  const { items, storeId, setStoreId, addItem, removeItem, updateQuantity, clear, getTotal } =
    useCartStore();

  return {
    items,
    storeId,
    setStoreId,
    addItem,
    removeItem,
    updateQuantity,
    clear,
    total: getTotal(),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}
