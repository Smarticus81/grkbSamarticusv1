import { useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { createAuthenticatedApi } from '../lib/queryClient.js';

/**
 * React hook that returns an authenticated API function.
 *
 * Uses Clerk's `useAuth().getToken()` to automatically attach
 * an `Authorization: Bearer <token>` header to every request.
 *
 * Usage:
 * ```ts
 * const { api } = useAuthenticatedApi();
 * const data = await api<MyType>('/api/graph/obligations');
 * ```
 *
 * Falls back gracefully when Clerk is not configured — requests
 * are sent without an Authorization header.
 */
export function useAuthenticatedApi() {
  const { getToken, isSignedIn, orgId, userId } = useAuth();

  const getTokenStable = useCallback(
    () => getToken(),
    // getToken identity is stable per Clerk docs, but we include
    // isSignedIn so the memo updates on sign-in/sign-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getToken, isSignedIn],
  );

  const api = useMemo(
    () => createAuthenticatedApi(getTokenStable),
    [getTokenStable],
  );

  return {
    /** Authenticated fetch wrapper — auto-attaches Clerk JWT */
    api,
    /** Whether the user is currently signed in */
    isSignedIn: isSignedIn ?? false,
    /** Current Clerk organization ID (if any) */
    orgId: orgId ?? null,
    /** Current Clerk user ID (if any) */
    userId: userId ?? null,
  };
}
