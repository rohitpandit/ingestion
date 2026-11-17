import type { PublicUser } from '@mdiw/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { api, ApiRequestError } from '../api/client.js';

interface AuthValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (error) {
        // A missing session is the normal signed-out state, not a failure.
        if (error instanceof ApiRequestError && error.status === 401) return null;
        throw error;
      }
    },
  });

  const setUser = useCallback(
    (user: PublicUser | null) => {
      queryClient.setQueryData(['me'], user);
      queryClient.removeQueries({ queryKey: ['workspaces'] });
    },
    [queryClient],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user: data ?? null,
      loading: isLoading,
      login: async (email, password) => setUser(await api.login(email, password)),
      register: async (email, password) => setUser(await api.register(email, password)),
      logout: async () => {
        await api.logout();
        setUser(null);
        queryClient.clear();
      },
    }),
    [data, isLoading, queryClient, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
