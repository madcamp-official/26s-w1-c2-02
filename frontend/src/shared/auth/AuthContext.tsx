import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, tokenStorage } from '../api/http';
import { fetchMe, type AuthUser } from '../../features/auth/authApi';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  // Called after a successful signup/login: persist token and mark authenticated.
  signIn: (accessToken: string, user: AuthUser) => void;
  // Logout: only clears the client token. Server /auth/logout is a 501 stub for now,
  // so we skip it; add the call here once the backend implements it.
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  // On app load, validate any stored token by calling /users/me.
  useEffect(() => {
    let cancelled = false;

    async function validateSession() {
      if (!tokenStorage.get()) {
        setStatus('unauthenticated');
        return;
      }
      try {
        const { user: me } = await fetchMe();
        if (cancelled) return;
        setUser({ id: me.id, username: me.username, createdAt: me.createdAt });
        setStatus('authenticated');
      } catch (error) {
        if (cancelled) return;
        // Expired/invalid token → drop it and require login again.
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          tokenStorage.clear();
        }
        setUser(null);
        setStatus('unauthenticated');
      }
    }

    validateSession();
    return () => {
      cancelled = true;
    };
  }, []);

  function signIn(accessToken: string, nextUser: AuthUser) {
    tokenStorage.set(accessToken);
    setUser(nextUser);
    setStatus('authenticated');
  }

  function signOut() {
    tokenStorage.clear();
    setUser(null);
    setStatus('unauthenticated');
  }

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
