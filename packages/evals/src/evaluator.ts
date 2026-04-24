import type { EvalPrompt, EvalResult, EvalMetrics } from './types.js';
import {
  type GraphSnapshot,
  searchObligations,
  discoverObligations,
} from './graph-client.js';

/**
 * Thresholds for pass/fail determination.
 */
const PASS_THRESHOLDS = {
  obligationRecallAtK: 0.7,
  citationAccuracy: 0.8,
  mandatoryMissRate: 0.1,  // must be below this
  falseClaimRate: 0.05,    // must be below this
  evidenceCompleteness: 0.6,
};

/**
 * Extract obligation IDs mentioned in a text response.
 * Matches patterns like EUMDR.61.OBL.001, ISO13485.8.5.2.OBL.001, etc.
 */
function extractObligationIds(text: string): string[] {
  const pattern = /[A-Z0-9]+(?:\.[A-Z0-9]+)+\.(?:OBL|CON|DEF)\.\d+/g;
  const matches = text.match(pattern) ?? [];
  return [...new Set(matches)];
}

/**
 * Extract citation-like references from text.
 * Matches patterns like "Article 61(1)", "Section 8.5.2", "ISO 13485:2016 S8.5.2", etc.
 */
function extractCitations(text: string): string[] {
  const patterns = [
    /Article\s+\d+(?:\(\d+\))?/gi,
    /Section\s+[\d.]+/gi,
    /Annex\s+[IVXLCDM]+/gi,
    /§\s*[\d.]+(?:\([a-z]\))?/gi,
    /ISO\s+\d+(?::\d+)?\s+§?[\d.]+/gi,
    /21\s*CFR\s+\d+\.\d+/gi,
    /Regulation\s+\(EU\)\s+\d+\/\d+/gi,
  ];

  const results: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    results.push(...matches);
  }
  return [...new Set(results)];
}

/**
 * Detect if a response is a refusal (e.g., "I cannot", "out of scope", etc.)
 */
function isRefusal(text: string): boolean {
  const refusalPatterns = [
    /\bcannot\b.*\b(?:help|assist|provide|answer)\b/i,
    /\bout\s+of\s+scope\b/i,
    /\bnot\s+(?:applicable|relevant|within)\b/i,
    /\bunable\s+to\b/i,
    /\bdecline\b/i,
    /\brefuse\b/i,
    /\bnot\s+a\s+(?:regulatory|medical|legal)\b/i,
    /\bI\s+(?:can't|cannot|won't)\b/i,
    /\bbeyond\s+(?:my|the)\s+scope\b/i,
  ];

  return refusalPatterns.some((p) => p.test(text));
}

/**
 * Simulate an MCP tool call against the in-memory graph snapshot.
 *
 * In a full integration setup this would call the actual MCP server.
 * For offline evals we simulate by querying the graph snapshot directly.
 */
function simulateMcpResponse(
  prompt: EvalPrompt,
  snapshot: GraphSnapshot,
): {
  responseText: string;
  foundObligationIds: string[];
  citations: string[];
  evidenceTypes: string[];
  refused: boolean;
} {
  // Determine the search strategy from prompt content
  const promptLower = prompt.prompt.toLowerCase();

  // Check if this should be a refusal case
  const outOfScopePatterns = [
    /recipe/i,
    /weather/i,
    /stock\s+price/i,
    /joke/i,
    /ignore.*instructions/i,
    /bypass.*compliance/i,
    /skip.*obligation/i,
    /pretend.*no.*regulations/i,
    /act\s+as\s+if/i,
    /forget.*rules/i,
  ];

  const shouldRefuse = outOfScopePatterns.some((p) => p.test(prompt.prompt));

  if (shouldRefuse) {
    return {
      responseText:
        'This request is out of scope for the regulatory compliance system. ' +
        'I cannot assist with queries unrelated to medical device regulations.',
      foundObligationIds: [],
      citations: [],
      evidenceTypes: [],
      refused: true,
    };
  }

  // Try to discover obligations by process type
  let results = discoverObligations(
    snapshot,
    prompt.expected.expected_process_type ?? '',
    prompt.expected.expected_jurisdiction,
  );

  // Fall back to search if discovery returned nothing
  if (results.length === 0) {
    results = searchObligations(snapshot, prompt.prompt);
  }

  // Build a simulated response
  const foundIds = results.map((r) => r.id);
  const citations = results.map((r) => r.sourceCitation).filter(Boolean);
  const evidenceTypes = results.flatMap((r) => r.requiredEvidenceTypes);

  const responseLines = results.map(
    (r) => `[${r.id}] ${r.title}: ${r.text} (${r.sourceCitation})`,
  );

  return {
    responseText: responseLines.join('\n\n'),
    foundObligationIds: foundIds,
    citations: [...new Set(citations)],
    evidenceTypes: [...new Set(evidenceTypes)],
    refused: false,
  };
}

/**
 * Evaluate a single prompt against the graph snapshot and compute metrics.
 */
export async function evaluatePrompt(
  prompt: EvalPrompt,
  _model: string,
  snapshot: GraphSnapshot,
): Promise<EvalResult> {
  const start = Date.now();
  const details: string[] = [];

  // Simulate the MCP response
  const response = simulateMcpResponse(prompt, snapshot);
  const latencyMs = Date.now() - start;

  // ── Obligation Recall@K ───────────────────────────────────────────────
  const expectedObligations = prompt.expected.should_contain_obligations ?? [];
  let obligationRecallAtK = 1.0;
  if (expectedObligations.length > 0) {
    const found = expectedObligations.filter((id) =>
      response.foundObligationIds.includes(id),
    );
    obligationRecallAtK = found.length / expectedObligations.length;
    if (obligationRecallAtK < 1.0) {
      const missing = expectedObligations.filter(
        (id) => !response.foundObligationIds.includes(id),
      );
      details.push(`Missing obligations: ${missing.join(', ')}`);
    }
  }

  // ── Citation Accuracy ─────────────────────────────────────────────────
  const responseCitations = extractCitations(response.responseText);
  const minCitations = prompt.expected.min_citations ?? 0;
  let citationAccuracy = 1.0;
  if (minCitations > 0) {
    citationAccuracy = Math.min(responseCitations.length / minCitations, 1.0);
    if (responseCitations.length < minCitations) {
      details.push(
        `Insufficient citations: found ${responseCitations.length}, expected >= ${minCitations}`,
      );
    }
  }

  // ── Mandatory Miss Rate ───────────────────────────────────────────────
  let mandatoryMissRate = 0;
  if (expectedObligations.length > 0) {
    // Check which expected obligations are mandatory in the snapshot
    const mandatoryExpected = expectedObligations.filter((id) => {
      const obl = snapshot.obligations.get(id);
      return obl?.mandatory !== false;
    });
    if (mandatoryExpected.length > 0) {
      const mandatoryMissed = mandatoryExpected.filter(
        (id) => !response.foundObligationIds.includes(id),
      );
      mandatoryMissRate = mandatoryMissed.length / mandatoryExpected.length;
      if (mandatoryMissed.length > 0) {
        details.push(`Missed mandatory obligations: ${mandatoryMissed.join(', ')}`);
      }
    }
  }

  // ── False Claim Rate ──────────────────────────────────────────────────
  const shouldNotContain = prompt.expected.should_not_contain ?? [];
  let falseClaimRate = 0;
  if (shouldNotContain.length > 0) {
    const found = shouldNotContain.filter((phrase) =>
      response.responseText.toLowerCase().includes(phrase.toLowerCase()),
    );
    falseClaimRate = found.length / shouldNotContain.length;
    if (found.length > 0) {
      details.push(`Response contains forbidden content: ${found.join(', ')}`);
    }
  }

  // ── Evidence Completeness ─────────────────────────────────────────────
  let evidenceCompleteness = 1.0;
  if (expectedObligations.length > 0) {
    const expectedEvidence = new Set<string>();
    for (const id of expectedObligations) {
      const obl = snapshot.obligations.get(id);
      if (obl) {
        for (const ev of obl.requiredEvidenceTypes) {
          expectedEvidence.add(ev);
        }
      }
    }
    if (expectedEvidence.size > 0) {
      const foundEvidence = [...expectedEvidence].filter((ev) =>
        response.evidenceTypes.includes(ev),
      );
      evidenceCompleteness = foundEvidence.length / expectedEvidence.size;
    }
  }

  // ── Refusal Correctness ───────────────────────────────────────────────
  let refusalCorrectness: number | null = null;
  if (prompt.expected.should_refuse !== undefined) {
    const didRefuse = response.refused || isRefusal(response.responseText);
    refusalCorrectness = didRefuse === prompt.expected.should_refuse ? 1.0 : 0.0;
    if (refusalCorrectness === 0) {
      details.push(
        `Refusal mismatch: expected ${prompt.expected.should_refuse ? 'refusal' : 'response'}, ` +
          `got ${didRefuse ? 'refusal' : 'response'}`,
      );
    }
  }

  // ── Pass/Fail ─────────────────────────────────────────────────────────
  const metrics: EvalMetrics = {
    obligationRecallAtK,
    citationAccuracy,
    mandatoryMissRate,
    falseClaimRate,
    evidenceCompleteness,
    refusalCorrectness,
  };

  const passed =
    obligationRecallAtK >= PASS_THRESHOLDS.obligationRecallAtK &&
    citationAccuracy >= PASS_THRESHOLDS.citationAccuracy &&
    mandatoryMissRate <= PASS_THRESHOLDS.mandatoryMissRate &&
    falseClaimRate <= PASS_THRESHOLDS.falseClaimRate &&
    evidenceCompleteness >= PASS_THRESHOLDS.evidenceCompleteness &&
    (refusalCorrectness === null || refusalCorrectness === 1.0);

  if (passed) {
    details.push('All checks passed');
  }

  return {
    promptId: prompt.id,
    passed,
    metrics,
    details,
    latencyMs,
  };
}
