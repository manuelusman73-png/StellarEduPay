import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

const TOKEN_KEY = 'admin_token';

function parseToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload;
  } catch {
    return null;
  }
}

function isTokenValid(token) {
  if (!token) return false;
  const payload = parseToken(token);
  if (!payload || payload.role !== 'admin') return false;
  return payload.exp * 1000 > Date.now();
}

export function useAdminAuth() {
  const router = useRouter();
  const [token, setToken] = useState(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    if (isTokenValid(stored)) {
      setToken(stored);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
    }
  }, []);

  const login = useCallback((newToken) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    router.push('/login');
  }, [router]);

  const isAdmin = isTokenValid(token);

  return { token, isAdmin, login, logout };
}
