import type { ObligationGraph } from '../../graph/ObligationGraph.js';
import type { ObligationNode } from '../../graph/types.js';
import type { ComplianceContext } from '../types.js';
import type { Validator, ValidationFinding } from './types.js';

/**
 * Verifies that every citation string in the output (e.g., "EUMDR.ART.83")
 * resolves to a real graph node. Emits findings for dangling references.
 *
 * Scans the following output fields for citation strings:
 * - `citations`: string[]
 * - `references`: string[]
 * - `sourceCitations`: string[]
 * - Any string field value matching the citation pattern (e.g., "EUMDR.ART.*")
 */
export class CitationVerifier implements Validator {
  readonly name = 'CitationVerifier';

  /** Pattern that matches typical obligation/citation IDs like "EUMDR.ART.83" or "ISO13485.7.3.2" */
  private readonly citationPattern = /\b[A-Z][A-Z0-9_]*\.[A-Z0-9_.]+\b/g;

  constructor(private readonly graph: ObligationGraph) {}

  async validate(
    output: unknown,
    obligations: ObligationNode[],
    _context: ComplianceContext,
  ): Promise<ValidationFinding[]> {
    const findings: ValidationFinding[] = [];
    const citations = this.extractCitations(output);

    if (citations.length === 0) {
      return findings;
    }

    // Build a set of known obligation IDs from the loaded set for fast lookup.
    const knownIds = new Set(obligations.map((o) => o.obligationId));
    // Also index by sourceCitation for cross-referencing.
    const knownCitations = new Set(obligations.map((o) => o.sourceCitation));

    for (const citation of citations) {
      // First check if it is a known obligation ID or source citation.
      if (knownIds.has(citation) || knownCitations.has(citation)) {
        continue; // Valid reference.
      }

      // Try to resolve via the graph.
      const resolved = await this.graph.getObligation(citation);
      if (resolved) {
        continue; // Valid reference found in graph.
      }

      // Dangling reference.
      findings.push({
        validator: this.name,
        severity: 'warning',
        message: `Citation "${citation}" does not resolve to any known obligation in the graph.`,
        remediation: `Verify that "${citation}" is a valid obligation ID or source citation. Correct or remove if erroneous.`,
      });
    }

    return findings;
  }

  /**
   * Extract citations from the output payload. Looks at explicit citation arrays
   * and scans string fields for citation-shaped patterns.
   */
  private extractCitations(output: unknown): string[] {
    if (!output || typeof output !== 'object') return [];
    const obj = output as Record<string, unknown>;
    const citations = new Set<string>();

    // Explicit citation array fields.
    const arrayFields = ['citations', 'references', 'sourceCitations'];
    for (const field of arrayFields) {
      const value = obj[field];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            citations.add(item);
          }
        }
      }
    }

    // Scan string values at the top level for citation patterns.
    for (const [key, value] of Object.entries(obj)) {
      if (arrayFields.includes(key)) continue; // Already processed.
      if (typeof value === 'string') {
        const matches = value.matchAll(this.citationPattern);
        for (const match of matches) {
          citations.add(match[0]);
        }
      }
    }

    return Array.from(citations);
  }
}
