import { useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  createAuthenticatedApi,
  createAuthenticatedSse,
  api as unauthApi,
  type StreamSseOptions,
} from '../lib/queryClient.js';

// Build-time constant — true only when a Clerk publishable key is present.
// This never changes between renders, so selecting the hook at module init
// satisfies React's rules of hooks.
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface AuthenticatedApiReturn {
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  streamSse: (path: string, options: StreamSseOptions) => Promise<void>;
  isSignedIn: boolean;
  orgId: string | null;
  userId: string | null;
}

// ---------------------------------------------------------------------------
// Clerk-backed hook (only used when VITE_CLERK_PUBLISHABLE_KEY is set,
// meaning ClerkProvider is guaranteed to be in the tree)
// ---------------------------------------------------------------------------
function useClerkApi(): AuthenticatedApiReturn {
  const { getToken, isSignedIn, orgId, userId } = useAuth();

  const getTokenStable = useCallback(
    () => getToken(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getToken, isSignedIn],
  );

  const authenticatedApi = useMemo(
    () => createAuthenticatedApi(getTokenStable),
    [getTokenStable],
  );
  const authenticatedSse = useMemo(
    () => createAuthenticatedSse(getTokenStable),
    [getTokenStable],
  );

  return {
    api: authenticatedApi,
    streamSse: authenticatedSse,
    isSignedIn: isSignedIn ?? false,
    orgId: orgId ?? null,
    userId: userId ?? null,
  };
}

// ---------------------------------------------------------------------------
// No-auth fallback (used when Clerk is not configured — dev bypass mode)
// ---------------------------------------------------------------------------
function useDevApi(): AuthenticatedApiReturn {
  const stableApi = useMemo(() => unauthApi, []);
  const streamSse = useMemo(() => createAuthenticatedSse(async () => null), []);
  return { api: stableApi, streamSse, isSignedIn: false, orgId: null, userId: null };
}

/**
 * Returns an authenticated API function and auth state.
 *
 * When `VITE_CLERK_PUBLISHABLE_KEY` is set, attaches a Clerk JWT Bearer token
 * to every request. When not set (dev / local mode), falls back to the
 * unauthenticated helper — pair this with `AUTH_BYPASS_DEV=true` on the API.
 *
 * Usage:
 * ```ts
 * const { api } = useAuthenticatedApi();
 * const data = await api<MyType>('/api/graph/obligations');
 * ```
 */
export const useAuthenticatedApi: () => AuthenticatedApiReturn =
  CLERK_ENABLED ? useClerkApi : useDevApi;
