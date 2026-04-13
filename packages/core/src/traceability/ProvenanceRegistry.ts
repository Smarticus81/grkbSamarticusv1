import type { ProvenanceRecord } from './types.js';

/**
 * In-memory registry for evidence provenance. Persisted copies live with each
 * evidence atom in `evidenceAtoms.provenance` (jsonb), but agents can also look
 * up live provenance via this registry during a process run.
 */
export class ProvenanceRegistry {
  private store = new Map<string, ProvenanceRecord>();

  register(atomId: string, record: ProvenanceRecord): void {
    this.store.set(atomId, record);
  }

  get(atomId: string): ProvenanceRecord | undefined {
    return this.store.get(atomId);
  }

  has(atomId: string): boolean {
    return this.store.has(atomId);
  }

  all(): Array<{ atomId: string; provenance: ProvenanceRecord }> {
    return Array.from(this.store.entries()).map(([atomId, provenance]) => ({ atomId, provenance }));
  }

  clear(): void {
    this.store.clear();
  }
}
