import { DecisionTraceService } from './DecisionTraceService.js';
import { ChainVerifier } from './ChainVerifier.js';
import type { DecisionTraceEntry } from './types.js';

/**
 * Exports a process instance's decision trace in audit-ready formats.
 * - jsonl: one entry per line, machine-readable
 * - dot:   graphviz digraph for visualization
 * - audit: structured report with verification stamp + obligation coverage
 */
export class TraceExporter {
  constructor(
    private readonly traceService: DecisionTraceService = new DecisionTraceService(),
    private readonly verifier: ChainVerifier = new ChainVerifier(),
  ) {}

  async toJSONL(processInstanceId: string): Promise<string> {
    const chain = await this.traceService.getTraceChain(processInstanceId);
    return chain.map((e) => JSON.stringify(this.normalize(e))).join('\n');
  }

  async toDOT(processInstanceId: string): Promise<string> {
    const chain = await this.traceService.getTraceChain(processInstanceId);
    const lines = [`digraph trace_${processInstanceId.replace(/-/g, '_')} {`, '  rankdir=LR;', '  node [shape=box, fontname="Helvetica"];'];
    for (const e of chain) {
      const label = `${e.sequenceNumber}: ${e.eventType}\\n${e.actor}`;
      lines.push(`  n${e.sequenceNumber} [label="${label}"];`);
      if (e.sequenceNumber > 0) {
        lines.push(`  n${e.sequenceNumber - 1} -> n${e.sequenceNumber};`);
      }
    }
    lines.push('}');
    return lines.join('\n');
  }

  async toAuditReport(processInstanceId: string): Promise<{
    processInstanceId: string;
    generatedAt: string;
    chain: DecisionTraceEntry[];
    verification: { valid: boolean; signatureHash: string; totalEntries: number };
    summary: { byEventType: Record<string, number>; actors: string[] };
  }> {
    const chain = await this.traceService.getTraceChain(processInstanceId);
    const verification = await this.verifier.verifyChain(processInstanceId);
    const byEventType: Record<string, number> = {};
    const actorsSet = new Set<string>();
    for (const e of chain) {
      byEventType[e.eventType] = (byEventType[e.eventType] ?? 0) + 1;
      actorsSet.add(e.actor);
    }
    return {
      processInstanceId,
      generatedAt: new Date().toISOString(),
      chain,
      verification: {
        valid: verification.valid,
        signatureHash: verification.signatureHash,
        totalEntries: verification.totalEntries,
      },
      summary: { byEventType, actors: Array.from(actorsSet) },
    };
  }

  private normalize(e: DecisionTraceEntry): Record<string, unknown> {
    return {
      ...e,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    };
  }
}
