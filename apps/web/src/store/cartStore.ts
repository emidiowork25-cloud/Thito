import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Customization {
  removed: string[];
  added: string[];
}

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  ingredients?: string;
  customizations?: Customization;
}

interface CartStore {
  storeId: string | null;
  items: CartItem[];
  setStoreId: (storeId: string) => void;
  addItem: (item: CartItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clear: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      storeId: null,
      items: [],
      setStoreId: (storeId) => set({ storeId }),
      addItem: (newItem) =>
        set((state) => {
          const existing = state.items.find((item) => item.menuItemId === newItem.menuItemId);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.menuItemId === newItem.menuItemId
                  ? { ...item, quantity: item.quantity + newItem.quantity }
                  : item
              ),
            };
          }
          return { items: [...state.items, newItem] };
        }),
      removeItem: (menuItemId) =>
        set((state) => ({
          items: state.items.filter((item) => item.menuItemId !== menuItemId),
        })),
      updateQuantity: (menuItemId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((item) => item.menuItemId !== menuItemId)
              : state.items.map((item) =>
                  item.menuItemId === menuItemId ? { ...item, quantity } : item
                ),
        })),
      clear: () => set({ storeId: null, items: [] }),
      getTotal: () => {
        const state = get();
        return state.items.reduce((total, item) => total + item.price * item.quantity, 0);
      },
    }),
    {
      name: 'cart-store',
      // On the server there is no localStorage; hand persist a no-op store
      // so prerendering does not blow up, then hydrate in the browser.
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? window.localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} }
      ),
    }
  )
);
