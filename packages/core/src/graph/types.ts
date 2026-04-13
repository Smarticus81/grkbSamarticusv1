import { z } from 'zod';

export const ObligationKindSchema = z.enum(['obligation', 'constraint', 'definition']);
export type ObligationKind = z.infer<typeof ObligationKindSchema>;

export const ObligationNodeSchema = z.object({
  obligationId: z.string().min(1),
  jurisdiction: z.string().min(1),
  artifactType: z.string().min(1),
  processType: z.string().min(1),
  kind: ObligationKindSchema,
  title: z.string().min(1),
  text: z.string().min(1),
  sourceCitation: z.string().min(1),
  version: z.string().min(1),
  effectiveFrom: z.coerce.date().optional(),
  mandatory: z.boolean().default(true),
  requiredEvidenceTypes: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});
export type ObligationNode = z.infer<typeof ObligationNodeSchema>;

export const ConstraintNodeSchema = z.object({
  constraintId: z.string().min(1),
  appliesTo: z.string().min(1), // obligationId
  text: z.string().min(1),
  expression: z.string().optional(), // optional machine-readable expression
  severity: z.enum(['hard', 'soft']).default('hard'),
  metadata: z.record(z.unknown()).default({}),
});
export type ConstraintNode = z.infer<typeof ConstraintNodeSchema>;

export const DefinitionNodeSchema = z.object({
  definitionId: z.string().min(1),
  term: z.string().min(1),
  text: z.string().min(1),
  sourceCitation: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});
export type DefinitionNode = z.infer<typeof DefinitionNodeSchema>;

export const EvidenceTypeNodeSchema = z.object({
  evidenceType: z.string().min(1),
  description: z.string().min(1),
  schema: z.record(z.unknown()).default({}),
});
export type EvidenceTypeNode = z.infer<typeof EvidenceTypeNodeSchema>;

export type RelationType =
  | 'REQUIRES_EVIDENCE'
  | 'CONSTRAINED_BY'
  | 'SUPERSEDES'
  | 'APPLIES_TO'
  | 'PART_OF'
  | 'CROSS_REFERENCES'
  | 'TRIGGERS'
  | 'SATISFIES'
  | 'CONFLICTS_WITH';

export interface GraphPath {
  nodes: ObligationNode[];
  relationships: { from: string; to: string; type: RelationType }[];
}

export interface Subgraph {
  nodes: ObligationNode[];
  relationships: { from: string; to: string; type: RelationType }[];
}

export interface ObligationExplanation {
  obligation: ObligationNode;
  parents: ObligationNode[];
  constraints: ConstraintNode[];
  requiredEvidence: string[];
  crossReferences: ObligationNode[];
  plainEnglishChain: string[];
}

export interface ObligationTree {
  root: ObligationNode;
  children: ObligationTree[];
}

export interface SeedResult {
  file: string;
  obligationsLoaded: number;
  constraintsLoaded: number;
  definitionsLoaded: number;
  relationshipsLoaded: number;
  errors: string[];
}

export interface ObligationDiff {
  added: string[];
  removed: string[];
  changed: { obligationId: string; before: ObligationNode; after: ObligationNode }[];
}

export interface CoverageMap {
  processInstanceId: string;
  total: number;
  covered: number;
  uncovered: string[];
  byObligation: Record<string, { covered: boolean; evidenceCount: number }>;
}
