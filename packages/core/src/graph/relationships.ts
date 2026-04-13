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
];

export function isValidRelationType(type: string): type is RelationType {
  return (ALL_RELATION_TYPES as string[]).includes(type);
}
