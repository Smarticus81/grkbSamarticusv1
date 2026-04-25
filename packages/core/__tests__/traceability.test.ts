import { describe, it, expect } from 'vitest';
import { ChainVerifier } from '../src/traceability/ChainVerifier.js';
import { InMemoryTraceService } from '../src/harness/TestHarness.js';

describe('hash-chained traceability', () => {
  it('builds and verifies a valid chain', async () => {
    const svc = new InMemoryTraceService();
    const ctx = await svc.startTrace('pi-1', 'tenant-test');
    await svc.logEvent(ctx, { eventType: 'AGENT_SPAWNED', actor: 'agent-a' });
    await svc.logEvent(ctx, { eventType: 'AGENT_COMPLETED', actor: 'agent-a' });
    const chain = await svc.getTraceChain('pi-1');
    expect(chain.length).toBe(3);
    const verifier = new ChainVerifier();
    const result = verifier.verifyEntries(chain as any);
    expect(result.valid).toBe(true);
    expect(result.totalEntries).toBe(3);
  });

  it('detects tampered entries', async () => {
    const svc = new InMemoryTraceService();
    const ctx = await svc.startTrace('pi-2', 'tenant-test');
    await svc.logEvent(ctx, { eventType: 'AGENT_SPAWNED', actor: 'agent-b' });
    const chain = await svc.getTraceChain('pi-2');
    chain[1].outputData = { tampered: true };
    const verifier = new ChainVerifier();
    const result = verifier.verifyEntries(chain as any);
    expect(result.valid).toBe(false);
  });
});
