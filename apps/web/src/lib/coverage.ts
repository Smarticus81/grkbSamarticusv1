/**
 * Fallback graph coverage shown before the live API responds.
 * The live source of truth is Neo4j via `/api/graph/stats`.
 *
 * Current live graph check, 2026-06-06:
 * - 613 obligations / user-facing requirements
 * - 785 evidence types
 * - 26 semantic regulation/artifact buckets
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
  { name: 'Live semantic graph', count: 613 },
];

export const REG_COUNT = 26;
export const OBLIGATION_COUNT = REGULATIONS.reduce((sum, r) => sum + r.count, 0);
/** User-facing alias — displays as "requirements" */
export const REQUIREMENT_COUNT = OBLIGATION_COUNT;
export const EVIDENCE_TYPE_COUNT = 785;
export const JURISDICTION_COUNT = 5;
