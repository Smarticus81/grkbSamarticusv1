import type { EvidenceTypeDefinition } from './types.js';

export class EvidenceTypeRegistry {
  private map = new Map<string, EvidenceTypeDefinition>();

  register(def: EvidenceTypeDefinition): void {
    this.map.set(def.evidenceType, def);
  }

  get(evidenceType: string): EvidenceTypeDefinition | undefined {
    return this.map.get(evidenceType);
  }

  has(evidenceType: string): boolean {
    return this.map.has(evidenceType);
  }

  list(): EvidenceTypeDefinition[] {
    return Array.from(this.map.values());
  }

  validate(evidenceType: string, data: unknown): { valid: boolean; errors: string[] } {
    const def = this.map.get(evidenceType);
    if (!def) return { valid: false, errors: [`Unknown evidence type: ${evidenceType}`] };
    if (!def.validator) return { valid: true, errors: [] };
    return def.validator(data);
  }
}
