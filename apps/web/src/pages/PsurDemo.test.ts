import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthTokenRequiredError } from '../lib/queryClient.js';
import { createJsonClient, liveFetch, selectPsurDemoMode, shouldShowLiveWorkspaceControls } from './PsurDemo.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('selectPsurDemoMode', () => {
  it('keeps public/no-profile access in simulation mode', () => {
    expect(selectPsurDemoMode({ clerkAvailable: false, isLoaded: true, isSignedIn: undefined })).toBe('simulation');
    expect(selectPsurDemoMode({ clerkAvailable: true, isLoaded: true, isSignedIn: false })).toBe('simulation');
  });

  it('uses the live pipeline only for signed-in users after auth is loaded', () => {
    expect(selectPsurDemoMode({ clerkAvailable: true, isLoaded: false, isSignedIn: undefined })).toBe('loading');
    expect(selectPsurDemoMode({ clerkAvailable: true, isLoaded: true, isSignedIn: true })).toBe('live');
  });

  it('keeps the public demo simulated even for signed-in users', () => {
    expect(
      selectPsurDemoMode({
        clerkAvailable: true,
        isLoaded: true,
        isSignedIn: true,
        publicDemoRoute: true,
      }),
    ).toBe('simulation');
    expect(
      selectPsurDemoMode({
        clerkAvailable: true,
        isLoaded: true,
        isSignedIn: true,
        publicDemoRoute: false,
      }),
    ).toBe('live');
  });
});

describe('live workspace controls', () => {
  it('shows account/workspace controls only for signed-in live mode', () => {
    expect(shouldShowLiveWorkspaceControls({ mode: 'live', clerkAvailable: true })).toBe(true);
    expect(shouldShowLiveWorkspaceControls({ mode: 'simulation', clerkAvailable: true })).toBe(false);
    expect(shouldShowLiveWorkspaceControls({ mode: 'live', clerkAvailable: false })).toBe(false);
  });
});

describe('live PSUR API helpers', () => {
  it('requires a bearer token before live fetches touch the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(liveFetch(async () => null, '/api/psur/defaults')).rejects.toBeInstanceOf(AuthTokenRequiredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches bearer auth for live JSON requests', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ period: { start: '2025-01-01', end: '2025-12-31' }, inputs: {} }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const json = createJsonClient(async () => 'live-token');
    const result = await json('/api/psur/defaults');
    expect(result.status).toBe(200);

    const calls = fetchMock.mock.calls as [RequestInfo | URL, RequestInit?][];
    expect(calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer live-token',
      'Content-Type': 'application/json',
    });
  });
});
