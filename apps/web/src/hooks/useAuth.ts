import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getStoredAuth } from '@/lib/auth';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const { user, setUser } = useAuthStore();

  useEffect(() => {
    const stored = getStoredAuth();
    if (stored) {
      setUser(stored);
    }
    setIsLoading(false);
  }, [setUser]);

  return { user, isLoading, isAuthenticated: !!user };
}
