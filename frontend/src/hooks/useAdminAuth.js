import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export function useAdminAuth() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  // Verify auth state by pinging a protected endpoint — the HttpOnly cookie is
  // sent automatically by the browser; we never touch it from JS.
  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: 'include' })
      .then((r) => setIsAdmin(r.ok))
      .catch(() => setIsAdmin(false))
      .finally(() => setChecked(true));
  }, []);

  const login = useCallback(() => {
    // Called after a successful POST /auth/login — the cookie is already set.
    setIsAdmin(true);
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
    setIsAdmin(false);
    router.push('/login');
  }, [router]);

  return { isAdmin, checked, login, logout };
}
