import { describe, it, expect } from 'vitest';
import { ChainVerifier } from '../src/traceability/ChainVerifier.js';
import {
  assembleAuditPack,
  decisionFromTraceEntry,
  renderAuditPackMarkdown,
  AuditPackSchema,
} from '../src/traceability/AuditPack.js';
import { InMemoryTraceService } from '../src/harness/TestHarness.js';
import type { DecisionTraceEntry } from '../src/traceability/types.js';

async function buildChain(processInstanceId: string): Promise<DecisionTraceEntry[]> {
  const svc = new InMemoryTraceService();
  const ctx = await svc.startTrace(processInstanceId);
  await svc.logEvent(ctx, {
    eventType: 'QUALIFICATION_PASSED',
    actor: 'capa-agent',
    humanSummary: 'Qualification passed (3/3)',
  });
  await svc.logEvent(ctx, {
    eventType: 'OBLIGATION_SATISFIED',
    actor: 'capa-agent',
    entityType: 'obligation',
    entityId: 'CFR820.100.OBL.001',
    reasons: ['Root cause analysis documented'],
    regulatoryContext: { citation: '21 CFR 820.100(a)(2)', regulation: 'FDA_QMSR' },
  });
  await svc.logEvent(ctx, {
    eventType: 'OBLIGATION_VIOLATED',
    actor: 'capa-agent',
    entityType: 'obligation',
    entityId: 'ISO13485.8.5.2.OBL.001',
    reasons: ['Effectiveness check missing'],
  });
  await svc.logEvent(ctx, {
    eventType: 'AGENT_COMPLETED',
    actor: 'capa-agent',
    regulatoryContext: { obligationIds: ['EUMDR.ART.83.OBL.001'] },
  });
  return (await svc.getTraceChain(processInstanceId)) as DecisionTraceEntry[];
}

describe('audit pack assembly', () => {
  it('assembles a VERIFIED pack with obligations and statuses from a valid chain', async () => {
    const chain = await buildChain('pi-pack-1');
    const verification = new ChainVerifier().verifyEntries(chain);
    const pack = await assembleAuditPack({
      packType: 'process-instance',
      subjectId: 'pi-pack-1',
      decisions: chain.map(decisionFromTraceEntry),
      verification,
    });

    expect(() => AuditPackSchema.parse(pack)).not.toThrow();
    expect(pack.verification.verdict).toBe('VERIFIED');
    expect(pack.summary.decisionCount).toBe(chain.length);

    const byId = new Map(pack.obligations.map((o) => [o.obligationId, o]));
    expect(byId.get('CFR820.100.OBL.001')?.status).toBe('satisfied');
    expect(byId.get('ISO13485.8.5.2.OBL.001')?.status).toBe('violated');
    expect(pack.summary.obligations.satisfied).toBe(1);
    expect(pack.summary.obligations.violated).toBe(1);

    const satisfiedDecision = pack.decisions.find((d) => d.eventType === 'OBLIGATION_SATISFIED');
    expect(satisfiedDecision?.citation).toBe('21 CFR 820.100(a)(2)');
    expect(satisfiedDecision?.regulation).toBe('FDA_QMSR');
  });

  it('includes obligations referenced via regulatoryContext.obligationIds', async () => {
    const chain = await buildChain('pi-pack-refs');
    const verification = new ChainVerifier().verifyEntries(chain);
    const pack = await assembleAuditPack(
      {
        packType: 'process-instance',
        subjectId: 'pi-pack-refs',
        decisions: chain.map(decisionFromTraceEntry),
        verification,
      },
      undefined,
      ['EUMDR.ART.83.OBL.001'],
    );
    const referenced = pack.obligations.find((o) => o.obligationId === 'EUMDR.ART.83.OBL.001');
    expect(referenced?.status).toBe('referenced');
  });

  it('still exports a tampered chain, flagged FAILED_VERIFICATION', async () => {
    const chain = await buildChain('pi-pack-2');
    chain[2]!.outputData = { tampered: true };
    const verification = new ChainVerifier().verifyEntries(chain);
    expect(verification.valid).toBe(false);

    const pack = await assembleAuditPack({
      packType: 'process-instance',
      subjectId: 'pi-pack-2',
      decisions: chain.map(decisionFromTraceEntry),
      verification,
    });

    expect(pack.verification.verdict).toBe('FAILED_VERIFICATION');
    expect(pack.verification.brokenAt).toBe(2);
    expect(pack.notes.some((n) => n.includes('FAILED'))).toBe(true);
    // The record itself is still present — hiding it would falsify evidence.
    expect(pack.decisions.length).toBe(chain.length);

    const markdown = renderAuditPackMarkdown(pack);
    expect(markdown).toContain('FAILED VERIFICATION');
    expect(markdown).toContain('must not be relied upon');
  });

  it('never lets a later satisfied event mask a violation', async () => {
    const svc = new InMemoryTraceService();
    const ctx = await svc.startTrace('pi-pack-3');
    await svc.logEvent(ctx, {
      eventType: 'OBLIGATION_VIOLATED',
      actor: 'agent',
      entityType: 'obligation',
      entityId: 'OBL.X',
    });
    await svc.logEvent(ctx, {
      eventType: 'OBLIGATION_SATISFIED',
      actor: 'agent',
      entityType: 'obligation',
      entityId: 'OBL.X',
    });
    const chain = (await svc.getTraceChain('pi-pack-3')) as DecisionTraceEntry[];
    const pack = await assembleAuditPack({
      packType: 'process-instance',
      subjectId: 'pi-pack-3',
      decisions: chain.map(decisionFromTraceEntry),
      verification: new ChainVerifier().verifyEntries(chain),
    });
    expect(pack.obligations.find((o) => o.obligationId === 'OBL.X')?.status).toBe('violated');
  });

  it('enriches obligations via lookup and reports enrichment state', async () => {
    const chain = await buildChain('pi-pack-4');
    const pack = await assembleAuditPack(
      {
        packType: 'process-instance',
        subjectId: 'pi-pack-4',
        decisions: chain.map(decisionFromTraceEntry),
        verification: new ChainVerifier().verifyEntries(chain),
      },
      async (id) =>
        id === 'CFR820.100.OBL.001'
          ? {
              title: 'CAPA procedures',
              sourceCitation: '21 CFR 820.100',
              jurisdiction: 'FDA',
              mandatory: true,
            }
          : null,
    );
    const enriched = pack.obligations.find((o) => o.obligationId === 'CFR820.100.OBL.001');
    expect(enriched?.enriched).toBe(true);
    expect(enriched?.title).toBe('CAPA procedures');
    const unenriched = pack.obligations.find((o) => o.obligationId === 'ISO13485.8.5.2.OBL.001');
    expect(unenriched?.enriched).toBe(false);

    const markdown = renderAuditPackMarkdown(pack);
    expect(markdown).toContain('21 CFR 820.100');
    expect(markdown).toContain('CAPA procedures');
  });

  it('degrades to a note when the graph lookup throws', async () => {
    const chain = await buildChain('pi-pack-5');
    const pack = await assembleAuditPack(
      {
        packType: 'process-instance',
        subjectId: 'pi-pack-5',
        decisions: chain.map(decisionFromTraceEntry),
        verification: new ChainVerifier().verifyEntries(chain),
      },
      async () => {
        throw new Error('Neo4j unreachable');
      },
    );
    expect(pack.obligations.length).toBeGreaterThan(0);
    expect(pack.obligations.every((o) => !o.enriched)).toBe(true);
    expect(pack.notes.some((n) => n.includes('enrichment unavailable'))).toBe(true);
  });

  it('does not mutate the source chain during assembly', async () => {
    const chain = await buildChain('pi-pack-6');
    const snapshot = JSON.stringify(chain);
    await assembleAuditPack({
      packType: 'process-instance',
      subjectId: 'pi-pack-6',
      decisions: chain.map(decisionFromTraceEntry),
      verification: new ChainVerifier().verifyEntries(chain),
    });
    expect(JSON.stringify(chain)).toBe(snapshot);
  });

  it('marks an empty chain as EMPTY', async () => {
    const pack = await assembleAuditPack({
      packType: 'process-instance',
      subjectId: 'pi-pack-empty',
      decisions: [],
      verification: new ChainVerifier().verifyEntries([]),
    });
    expect(pack.verification.verdict).toBe('EMPTY');
    const markdown = renderAuditPackMarkdown(pack);
    expect(markdown).toContain('EMPTY');
  });
});
