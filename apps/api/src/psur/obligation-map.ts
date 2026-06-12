/**
 * Citation → obligation resolution for the PSUR demo bridge.
 *
 * The Python PSUR pipeline emits `decision` events whose `regulatory_basis`
 * uses ONLY the canonical citation strings enumerated below. This module maps
 * each canonical citation to a graph lookup spec (term groups matched against
 * obligation sourceCitation/title/text) and resolves them to real obligation
 * IDs via `ObligationGraph.findObligationIdsByTerms` at startup.
 *
 * Rules:
 *  - Results are cached after first resolution.
 *  - Citations that are not canonical, or that resolve to zero graph nodes,
 *    are reported as unresolved — we NEVER guess an obligation ID.
 *  - If Neo4j is unavailable, the resolver degrades gracefully: it logs once
 *    and reports every citation as unresolved instead of crashing the API.
 */
import type { ObligationGraph } from '@regground/core';

// ---------------------------------------------------------------------------
// Canonical citations (exact strings emitted by the Python pipeline)
// ---------------------------------------------------------------------------

export const UK_MDR_2024_REGS = [
  '44ZE',
  '44ZF',
  '44ZH',
  '44ZI',
  '44ZJ',
  '44ZK',
  '44ZL',
  '44ZM',
  '44ZN',
  '44ZQ',
] as const;

export const CANONICAL_CITATIONS = [
  'EU MDR Art. 86',
  'MDCG 2022-21',
  'UK MDR 2024 Reg 44ZE',
  'UK MDR 2024 Reg 44ZF',
  'UK MDR 2024 Reg 44ZH',
  'UK MDR 2024 Reg 44ZI',
  'UK MDR 2024 Reg 44ZJ',
  'UK MDR 2024 Reg 44ZK',
  'UK MDR 2024 Reg 44ZL',
  'UK MDR 2024 Reg 44ZM',
  'UK MDR 2024 Reg 44ZN',
  'UK MDR 2024 Reg 44ZQ',
  'ISO 14971',
  'IMDRF Annex A',
  'IMDRF Annex F',
] as const;

export type CanonicalCitation = (typeof CANONICAL_CITATIONS)[number];

/**
 * Graph lookup spec per canonical citation.
 *
 * `termGroups` is an AND-of-ORs: an obligation matches when, for every group,
 * at least one term in the group appears (case-insensitively) in the node's
 * sourceCitation/title/text.
 *
 * NOTE on UK MDR 2024: the seeded `uk-mdr` regulation currently covers
 * UK MDR 2002 (as amended). The Part 4A regs (44ZE–44ZQ, SI 2024/1368) are
 * looked up by their reg number; until they are seeded these resolve to
 * nothing and are correctly surfaced as `unresolved_citation` — never mapped
 * to a UK MDR 2002 obligation by guesswork.
 */
export interface ObligationLookupSpec {
  regulation: string;
  termGroups: string[][];
}

function ukMdr2024Spec(reg: (typeof UK_MDR_2024_REGS)[number]): ObligationLookupSpec {
  return {
    regulation: 'uk-mdr',
    termGroups: [[`regulation ${reg.toLowerCase()}`, reg.toLowerCase()]],
  };
}

export const OBLIGATION_LOOKUP_SPECS: Record<CanonicalCitation, ObligationLookupSpec> = {
  'EU MDR Art. 86': {
    regulation: 'eu-mdr',
    termGroups: [['2017/745 article 86', 'eu mdr article 86']],
  },
  'MDCG 2022-21': {
    regulation: 'mdcg-2022-21',
    termGroups: [['mdcg 2022-21']],
  },
  'UK MDR 2024 Reg 44ZE': ukMdr2024Spec('44ZE'),
  'UK MDR 2024 Reg 44ZF': ukMdr2024Spec('44ZF'),
  'UK MDR 2024 Reg 44ZH': ukMdr2024Spec('44ZH'),
  'UK MDR 2024 Reg 44ZI': ukMdr2024Spec('44ZI'),
  'UK MDR 2024 Reg 44ZJ': ukMdr2024Spec('44ZJ'),
  'UK MDR 2024 Reg 44ZK': ukMdr2024Spec('44ZK'),
  'UK MDR 2024 Reg 44ZL': ukMdr2024Spec('44ZL'),
  'UK MDR 2024 Reg 44ZM': ukMdr2024Spec('44ZM'),
  'UK MDR 2024 Reg 44ZN': ukMdr2024Spec('44ZN'),
  'UK MDR 2024 Reg 44ZQ': ukMdr2024Spec('44ZQ'),
  'ISO 14971': {
    regulation: 'iso-14971',
    termGroups: [['iso 14971']],
  },
  'IMDRF Annex A': {
    regulation: 'imdrf',
    termGroups: [['imdrf'], ['annex a', 'annexes a', 'medical device problem']],
  },
  'IMDRF Annex F': {
    regulation: 'imdrf',
    termGroups: [['imdrf'], ['annex f', 'health impact']],
  },
};

export function isCanonicalCitation(value: string): value is CanonicalCitation {
  return (CANONICAL_CITATIONS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/** Minimal graph surface the resolver needs (eases mocking in tests). */
export type CitationGraph = Pick<ObligationGraph, 'findObligationIdsByTerms'>;

export interface ResolvedBasis {
  /** The citation strings as emitted by the pipeline, in order. */
  citations: string[];
  /** Distinct obligation IDs resolved from the canonical citations. */
  obligationIds: string[];
  /** Citations that could not be grounded in the graph. */
  unresolvedCitations: string[];
}

export class CitationResolver {
  private cache = new Map<string, string[]>();
  private initPromise: Promise<void> | null = null;
  private degraded = false;

  constructor(private readonly graph: CitationGraph) {}

  /** True when Neo4j was unreachable and all citations report unresolved. */
  get isDegraded(): boolean {
    return this.degraded;
  }

  /**
   * Resolve every canonical citation once and cache the results. Safe to call
   * repeatedly; concurrent callers share one in-flight initialization. A graph
   * failure marks the resolver degraded instead of throwing.
   */
  async initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInitialize();
    }
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    for (const citation of CANONICAL_CITATIONS) {
      const spec = OBLIGATION_LOOKUP_SPECS[citation];
      try {
        const ids = await this.graph.findObligationIdsByTerms(spec.termGroups);
        this.cache.set(citation, ids);
      } catch (err) {
        // Neo4j unavailable (or query failure) — degrade gracefully.
        this.degraded = true;
        this.cache.clear();
        console.warn(
          '[psur] citation resolution degraded — obligation graph unavailable, ' +
            'all citations will be recorded as unresolved:',
          err instanceof Error ? err.message : err,
        );
        return;
      }
    }
  }

  /**
   * Resolve a decision event's `regulatory_basis` list. Unknown citations and
   * citations with zero graph hits come back in `unresolvedCitations`.
   */
  async resolve(citations: string[]): Promise<ResolvedBasis> {
    await this.initialize();
    const obligationIds = new Set<string>();
    const unresolved: string[] = [];
    for (const citation of citations) {
      const ids = this.cache.get(citation);
      if (ids && ids.length > 0) {
        for (const id of ids) obligationIds.add(id);
      } else {
        unresolved.push(citation);
      }
    }
    return {
      citations: [...citations],
      obligationIds: Array.from(obligationIds),
      unresolvedCitations: unresolved,
    };
  }

  /**
   * Shape a resolved basis into the `regulatoryContext` stored on the trace
   * entry. The `unresolved_citation` key is only present when something could
   * not be grounded — its presence is the explicit "we did not guess" marker.
   */
  toRegulatoryContext(basis: ResolvedBasis): Record<string, unknown> {
    const ctx: Record<string, unknown> = {
      citations: basis.citations,
      obligationIds: basis.obligationIds,
    };
    if (basis.unresolvedCitations.length > 0) {
      ctx.unresolved_citation = basis.unresolvedCitations;
    }
    return ctx;
  }
}
