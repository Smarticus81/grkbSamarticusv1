import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_CITATIONS,
  CitationResolver,
  OBLIGATION_LOOKUP_SPECS,
  isCanonicalCitation,
  type CitationGraph,
} from './obligation-map.js';

/**
 * Mini obligation corpus mirroring the seeded graph's citation/title/text
 * fields (see packages/core/regulations/). The mock matches the same way the
 * Cypher in ObligationGraph.findObligationIdsByTerms does: AND across term
 * groups, OR within a group, case-insensitive substring over the haystack.
 */
const CORPUS: Array<{ id: string; hay: string }> = [
  {
    id: 'EUMDR.86.PSUR.OBL.001',
    hay: 'Regulation (EU) 2017/745 Article 86(1) Prepare a periodic safety update report',
  },
  {
    id: 'MDCG2022-21.1.OBL.001',
    hay: 'MDCG 2022-21 Section 1; EU MDR Article 86(1) PSUR scope and applicability',
  },
  {
    id: 'IMDRF.AET.OBL.001',
    hay:
      'IMDRF/AE WG/N43 FINAL:2020 Use IMDRF adverse event terminology Annexes A (medical device problem), ' +
      'B, C, D, E, F (health effects: health impact), and G (medical device component)',
  },
  {
    id: 'ISO14971.RISK.OBL.001',
    hay: 'ISO 14971:2019 §4.1 Establish a risk management process',
  },
];

function mockGraph(): CitationGraph & { calls: string[][][] } {
  const calls: string[][][] = [];
  return {
    calls,
    async findObligationIdsByTerms(groups: string[][]): Promise<string[]> {
      calls.push(groups);
      return CORPUS.filter(({ hay }) => {
        const lower = hay.toLowerCase();
        return groups.every((group) => group.some((term) => lower.includes(term.toLowerCase())));
      }).map(({ id }) => id);
    },
  };
}

describe('canonical citation map', () => {
  it('has a lookup spec for every canonical citation', () => {
    for (const citation of CANONICAL_CITATIONS) {
      expect(OBLIGATION_LOOKUP_SPECS[citation]).toBeDefined();
      expect(OBLIGATION_LOOKUP_SPECS[citation].termGroups.length).toBeGreaterThan(0);
    }
  });

  it('recognises canonical strings and rejects everything else', () => {
    expect(isCanonicalCitation('MDCG 2022-21')).toBe(true);
    expect(isCanonicalCitation('UK MDR 2024 Reg 44ZM')).toBe(true);
    expect(isCanonicalCitation('MDCG 2022-21 §3.4')).toBe(false);
    expect(isCanonicalCitation('Made Up Reg 99')).toBe(false);
  });
});

describe('CitationResolver', () => {
  it('resolves canonical citations to graph obligation IDs', async () => {
    const resolver = new CitationResolver(mockGraph());
    const basis = await resolver.resolve(['EU MDR Art. 86', 'MDCG 2022-21', 'IMDRF Annex A']);
    expect(basis.obligationIds).toContain('EUMDR.86.PSUR.OBL.001');
    expect(basis.obligationIds).toContain('MDCG2022-21.1.OBL.001');
    expect(basis.obligationIds).toContain('IMDRF.AET.OBL.001');
    expect(basis.unresolvedCitations).toEqual([]);
  });

  it('reports unknown and zero-hit citations as unresolved — never guesses', async () => {
    const resolver = new CitationResolver(mockGraph());
    const basis = await resolver.resolve([
      'UK MDR 2024 Reg 44ZM', // canonical but not yet seeded in the graph
      'Totally Invented Act 1999', // not canonical
      'ISO 14971',
    ]);
    expect(basis.obligationIds).toEqual(['ISO14971.RISK.OBL.001']);
    expect(basis.unresolvedCitations).toContain('UK MDR 2024 Reg 44ZM');
    expect(basis.unresolvedCitations).toContain('Totally Invented Act 1999');
  });

  it('caches startup resolution — the graph is queried once per canonical citation', async () => {
    const graph = mockGraph();
    const resolver = new CitationResolver(graph);
    await resolver.resolve(['MDCG 2022-21']);
    const callsAfterFirst = graph.calls.length;
    expect(callsAfterFirst).toBe(CANONICAL_CITATIONS.length);
    await resolver.resolve(['MDCG 2022-21', 'ISO 14971']);
    expect(graph.calls.length).toBe(callsAfterFirst);
  });

  it('degrades gracefully when the graph is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const resolver = new CitationResolver({
      async findObligationIdsByTerms(): Promise<string[]> {
        throw new Error('Neo4j connection refused');
      },
    });
    const basis = await resolver.resolve(['MDCG 2022-21', 'ISO 14971']);
    expect(resolver.isDegraded).toBe(true);
    expect(basis.obligationIds).toEqual([]);
    expect(basis.unresolvedCitations).toEqual(['MDCG 2022-21', 'ISO 14971']);
    warn.mockRestore();
  });

  it('shapes regulatoryContext with an explicit unresolved_citation marker', async () => {
    const resolver = new CitationResolver(mockGraph());
    const resolved = await resolver.resolve(['MDCG 2022-21']);
    expect(resolver.toRegulatoryContext(resolved)).toEqual({
      citations: ['MDCG 2022-21'],
      obligationIds: ['MDCG2022-21.1.OBL.001'],
    });

    const mixed = await resolver.resolve(['UK MDR 2024 Reg 44ZL']);
    const ctx = resolver.toRegulatoryContext(mixed);
    expect(ctx.unresolved_citation).toEqual(['UK MDR 2024 Reg 44ZL']);
    expect(ctx.obligationIds).toEqual([]);
  });
});
