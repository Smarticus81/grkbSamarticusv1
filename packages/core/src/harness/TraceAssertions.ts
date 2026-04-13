import type { DecisionTraceEntry } from '../traceability/types.js';
import { ChainVerifier } from '../traceability/ChainVerifier.js';

export class TraceAssertions {
  private verifier = new ChainVerifier();

  assertChainValid(chain: DecisionTraceEntry[]): void {
    const verification = this.verifier.verifyEntries(chain);
    if (!verification.valid) {
      throw new Error(
        `Trace chain invalid at sequence ${verification.brokenAt}: expected=${verification.brokenEntry?.expected} actual=${verification.brokenEntry?.actual}`,
      );
    }
  }

  assertHasEvent(chain: DecisionTraceEntry[], eventType: string): void {
    if (!chain.some((e) => e.eventType === eventType)) {
      throw new Error(`Expected trace event ${eventType} but none found`);
    }
  }

  assertNoEvent(chain: DecisionTraceEntry[], eventType: string): void {
    if (chain.some((e) => e.eventType === eventType)) {
      throw new Error(`Unexpected trace event ${eventType} present`);
    }
  }

  assertEventCount(chain: DecisionTraceEntry[], eventType: string, expected: number): void {
    const count = chain.filter((e) => e.eventType === eventType).length;
    if (count !== expected) {
      throw new Error(`Expected ${expected} ${eventType} events, found ${count}`);
    }
  }
}
