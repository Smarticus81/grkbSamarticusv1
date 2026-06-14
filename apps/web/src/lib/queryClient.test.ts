import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AuthTokenRequiredError,
  createAuthenticatedApi,
  createAuthenticatedBlob,
  createAuthenticatedSse,
} from './queryClient.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticated request helpers', () => {
  it('attaches a bearer token to authenticated API requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createAuthenticatedApi(async () => 'tenant-token');
    await expect(api('/api/psur/runs')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    const calls = fetchMock.mock.calls as [RequestInfo | URL, RequestInit?][];
    expect(calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: 'Bearer tenant-token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('fails closed before fetch when an authenticated API token is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const api = createAuthenticatedApi(async () => null);
    await expect(api('/api/psur/runs')).rejects.toBeInstanceOf(AuthTokenRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows explicit no-token dev bypass requests without an Authorization header', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createAuthenticatedApi(async () => null, { requireToken: false });
    await expect(api('/api/health')).resolves.toEqual({ ok: true });

    const calls = fetchMock.mock.calls as [RequestInfo | URL, RequestInit?][];
    const headers = calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('fails closed for blob and SSE helpers when the token is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const blob = createAuthenticatedBlob(async () => null);
    const sse = createAuthenticatedSse(async () => null);

    await expect(blob('/api/psur/runs/run-1/artifacts/report.pdf')).rejects.toBeInstanceOf(AuthTokenRequiredError);
    await expect(sse('/api/psur/runs/stream', { onEvent: vi.fn() })).rejects.toBeInstanceOf(AuthTokenRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
