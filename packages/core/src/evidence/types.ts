import type { ProvenanceRecord } from '../traceability/types.js';

export interface EvidenceAtom {
  atomId: string;
  evidenceType: string;
  sourceSystem: string;
  extractDate: Date;
  contentHash: string;
  recordCount: number;
  periodStart?: Date;
  periodEnd?: Date;
  data: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  provenance: ProvenanceRecord;
  status: 'valid' | 'invalid' | 'superseded';
  version: number;
}

export interface AtomizeInput {
  raw: unknown;
  evidenceType: string;
  sourceSystem: string;
  filename?: string;
  why: string;
  who?: string;
}

export interface EvidenceTypeDefinition {
  evidenceType: string;
  description: string;
  schema: Record<string, unknown>; // JSON schema or zod-derived
  validator?: (data: unknown) => { valid: boolean; errors: string[] };
}

export interface SlotMapping {
  slot: string;
  atomIds: string[];
  obligationIds: string[];
}
