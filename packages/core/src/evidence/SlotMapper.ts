import type { EvidenceAtom, SlotMapping } from './types.js';
import type { ObligationNode } from '../graph/types.js';

/**
 * Maps available evidence atoms into named "slots" defined by obligations.
 * A slot is satisfied if at least one atom of the slot's evidence type is
 * present.
 */
export class SlotMapper {
  map(obligations: ObligationNode[], atoms: EvidenceAtom[]): SlotMapping[] {
    const mappings: SlotMapping[] = [];
    const byType = new Map<string, EvidenceAtom[]>();
    for (const a of atoms) {
      const list = byType.get(a.evidenceType) ?? [];
      list.push(a);
      byType.set(a.evidenceType, list);
    }
    for (const obl of obligations) {
      for (const slot of obl.requiredEvidenceTypes) {
        const matching = byType.get(slot) ?? [];
        mappings.push({
          slot,
          atomIds: matching.map((a) => a.atomId),
          obligationIds: [obl.obligationId],
        });
      }
    }
    return mappings;
  }

  unsatisfiedSlots(mappings: SlotMapping[]): SlotMapping[] {
    return mappings.filter((m) => m.atomIds.length === 0);
  }
}
