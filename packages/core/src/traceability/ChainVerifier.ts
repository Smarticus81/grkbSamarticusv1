import { createHash } from 'node:crypto';
import { DecisionTraceService } from './DecisionTraceService.js';
import type {
  ChainVerification,
  EntryVerification,
  VerificationReport,
  DecisionTraceEntry,
} from './types.js';

export class ChainVerifier {
  constructor(private readonly traceService: DecisionTraceService = new DecisionTraceService()) {}

  async verifyChain(processInstanceId: string): Promise<ChainVerification> {
    const chain = await this.traceService.getTraceChain(processInstanceId);
    return this.verifyEntries(chain);
  }

  verifyEntries(chain: DecisionTraceEntry[]): ChainVerification {
    let prevHash = DecisionTraceService.genesisHash();
    let verified = 0;
    let brokenAt: number | undefined;
    let brokenEntry: { expected: string; actual: string } | undefined;

    for (const entry of chain) {
      if (entry.previousHash !== prevHash) {
        brokenAt = entry.sequenceNumber;
        brokenEntry = { expected: prevHash, actual: entry.previousHash };
        break;
      }
      const expected = DecisionTraceService.computeHash({
        processInstanceId: entry.processInstanceId,
        traceId: entry.traceId,
        sequenceNumber: entry.sequenceNumber,
        previousHash: entry.previousHash,
        eventType: entry.eventType,
        actor: entry.actor,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        decision: entry.decision ?? null,
        inputData: entry.inputData,
        outputData: entry.outputData,
        reasons: entry.reasons,
        humanSummary: entry.humanSummary ?? null,
        regulatoryContext: entry.regulatoryContext,
        evidenceJustification: entry.evidenceJustification,
        complianceAssertion: entry.complianceAssertion,
      });
      if (expected !== entry.currentHash) {
        brokenAt = entry.sequenceNumber;
        brokenEntry = { expected, actual: entry.currentHash };
        break;
      }
      prevHash = entry.currentHash;
      verified++;
    }

    const verification: ChainVerification = {
      valid: brokenAt === undefined,
      totalEntries: chain.length,
      verifiedEntries: verified,
      brokenAt,
      brokenEntry,
      verifiedAt: new Date(),
      signatureHash: createHash('sha256')
        .update(chain.map((e) => e.currentHash).join('|'))
        .digest('hex'),
    };
    return verification;
  }

  async verifyEntry(entryId: number, chain: DecisionTraceEntry[]): Promise<EntryVerification> {
    const entry = chain.find((e) => e.id === entryId);
    if (!entry) throw new Error(`Entry not found: ${entryId}`);
    const expected = DecisionTraceService.computeHash({
      processInstanceId: entry.processInstanceId,
      traceId: entry.traceId,
      sequenceNumber: entry.sequenceNumber,
      previousHash: entry.previousHash,
      eventType: entry.eventType,
      actor: entry.actor,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      decision: entry.decision ?? null,
      inputData: entry.inputData,
      outputData: entry.outputData,
      reasons: entry.reasons,
      humanSummary: entry.humanSummary ?? null,
      regulatoryContext: entry.regulatoryContext,
      evidenceJustification: entry.evidenceJustification,
      complianceAssertion: entry.complianceAssertion,
    });
    return { entryId, valid: expected === entry.currentHash, expectedHash: expected, actualHash: entry.currentHash };
  }

  async exportVerificationReport(processInstanceId: string): Promise<VerificationReport> {
    const chain = await this.verifyChain(processInstanceId);
    return {
      processInstanceId,
      chain,
      generatedAt: new Date(),
      signatureHash: chain.signatureHash,
    };
  }
}
