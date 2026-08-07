import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from './api';
import type { Me, Permission } from './types';

interface SessionValue {
  user: Me | null;
  /** True while the first session check is still in flight. */
  loading: boolean;
  /** Account is holding provisional credentials and can do nothing else. */
  mustChangePassword: boolean;
  siteName: string;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: Permission) => boolean;
  isAdmin: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChange, setMustChange] = useState(false);
  const [siteName, setSiteName] = useState('SRT HUB EASY');

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const session = await api.session();
      setUser(session.authenticated ? (session.user ?? null) : null);
      setMustChange(Boolean(session.mustChangePassword));
    } catch {
      // A failed session probe means signed out, not broken.
      setUser(null);
      setMustChange(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The name is public so the landing and login screens can show it before
    // anyone authenticates.
    void api
      .branding()
      .then((b) => setSiteName(b.siteName))
      .catch(() => undefined);
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string): Promise<void> => {
    const result = await api.login(username, password);
    setUser(result.user);
    setMustChange(result.mustChangePassword);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch {
      // Even if the server call fails, drop the local state — the user asked
      // to leave and the cookie is gone from their perspective either way.
    }
    setUser(null);
    setMustChange(false);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      loading,
      mustChangePassword: mustChange,
      siteName,
      signIn,
      signOut,
      refresh,
      isAdmin: user?.role === 'admin',
      can: (permission) =>
        user?.role === 'admin' || (user?.permissions.includes(permission) ?? false),
    }),
    [user, loading, mustChange, siteName, signIn, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return value;
}

/**
 * Turns an API rejection into a message worth showing. Anything that is not an
 * ApiError is a bug or a dead network, and saying so is more useful than
 * printing a stack trace at an operator.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return `Falha de comunicação: ${err.message}`;
  return 'Ocorreu um erro inesperado.';
}
