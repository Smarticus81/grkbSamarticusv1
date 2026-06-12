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

async function apiError(res: Response): Promise<Error> {
  const text = await res.text();
  if (!text) return new Error(`API ${res.status}`);
  try {
    const body = JSON.parse(text) as { message?: unknown; error?: unknown; detail?: unknown };
    const message =
      typeof body.message === 'string'
        ? body.message
        : typeof body.error === 'string'
          ? body.error
          : typeof body.detail === 'string'
            ? body.detail
            : text;
    return new Error(`API ${res.status}: ${message}`);
  } catch {
    return new Error(`API ${res.status}: ${text}`);
  }
}

export interface SseMessage {
  event: string;
  data: string;
}

export interface StreamSseOptions {
  signal?: AbortSignal;
  onEvent: (message: SseMessage) => void | Promise<void>;
}

/**
 * Unauthenticated API helper — use for health checks and public endpoints.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw await apiError(res);
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
    if (!res.ok) throw await apiError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  };
}

async function readSseStream(
  res: Response,
  onEvent: StreamSseOptions['onEvent'],
): Promise<void> {
  if (!res.body) throw new Error('SSE response did not include a readable body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = async (frame: string) => {
    const lines = frame.split(/\r?\n/);
    let event = 'message';
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) await onEvent({ event, data: data.join('\n') });
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (frame.trim()) await dispatch(frame);
      }
    }
    const trailing = buffer.trim();
    if (trailing) await dispatch(trailing);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream an authenticated server-sent events endpoint via fetch.
 *
 * Native EventSource cannot attach Authorization headers, so production Clerk
 * routes must use this reader instead.
 */
export function createAuthenticatedSse(
  getToken: () => Promise<string | null>,
) {
  return async function streamSse(
    path: string,
    options: StreamSseOptions,
  ): Promise<void> {
    const token = await getToken();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers,
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`SSE ${res.status}: ${await res.text()}`);
    await readSseStream(res, options.onEvent);
  };
}
