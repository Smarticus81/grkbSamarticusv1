/**
 * Fallback graph coverage shown before the live API responds.
 * The live source of truth is Neo4j via `/api/graph/stats`; these constants
 * must track that graph so the static fallback and the live UI never disagree.
 *
 * Current live graph check, 2026-06-16:
 * - 677 obligations / user-facing requirements
 * - 853 evidence types (source data types)
 * - 27 semantic regulation/artifact buckets ("regulations & standards")
 * - 5 jurisdictions
 *
 * User-facing: "requirements" not "obligations". The OBLIGATION_COUNT
 * export name is kept for backward compat but represents requirements.
 */
export interface Regulation {
  name: string;
  count: number;
}

export const REGULATIONS: Regulation[] = [
  { name: 'Live semantic graph', count: 677 },
];

export const REG_COUNT = 27;
export const OBLIGATION_COUNT = REGULATIONS.reduce((sum, r) => sum + r.count, 0);
/** User-facing alias - displays as "requirements" */
export const REQUIREMENT_COUNT = OBLIGATION_COUNT;
export const EVIDENCE_TYPE_COUNT = 853;
export const JURISDICTION_COUNT = 5;
