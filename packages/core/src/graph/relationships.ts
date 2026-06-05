import type { RelationType } from './types.js';

export const ALL_RELATION_TYPES: RelationType[] = [
  'REQUIRES_EVIDENCE',
  'CONSTRAINED_BY',
  'SUPERSEDES',
  'APPLIES_TO',
  'PART_OF',
  'CROSS_REFERENCES',
  'TRIGGERS',
  'SATISFIES',
  'CONFLICTS_WITH',
  // === Cross-regulation edges ===
  'IMPLEMENTS',
  'HARMONIZED_BY',
  'DERIVED_FROM',
  'DEPENDS_ON',
  'EXEMPTS',
  // === AgentOS extensions (Phase 0) ===
  'EXECUTES',
  'REQUIRES_HITL',
  'BOUND_BY_POLICY',
  'MEASURED_BY',
  'STARTED_BY',
];

export function isValidRelationType(type: string): type is RelationType {
  return (ALL_RELATION_TYPES as string[]).includes(type);
}
