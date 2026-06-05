import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

/**
 * Unauthenticated API helper — use for health checks and public endpoints.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Factory that creates an authenticated API helper.
 * The returned function auto-attaches the Clerk JWT as a Bearer token.
 *
 * @param getToken - Clerk's `getToken()` from `useAuth()`
 */
export function createAuthenticatedApi(
  getToken: () => Promise<string | null>,
) {
  return async function authenticatedApi<T>(
    path: string,
    init?: RequestInit,
  ): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> ?? {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  };
}
