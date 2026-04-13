import { createHash, randomUUID } from 'node:crypto';
import type { EvidenceAtom, AtomizeInput } from './types.js';
import type { EvidenceTypeRegistry } from './EvidenceTypeRegistry.js';
import { ParserRegistry } from './parsers/ParserRegistry.js';

/**
 * Normalizes any input (parsed via the parser registry) into one or more
 * evidence atoms with full provenance.
 */
export class Atomizer {
  constructor(
    private readonly typeRegistry: EvidenceTypeRegistry,
    private readonly parsers: ParserRegistry = new ParserRegistry(),
  ) {}

  async atomize(input: AtomizeInput): Promise<EvidenceAtom[]> {
    const parsed = await this.parsers.parse(input.raw, input.filename);
    const records = Array.isArray(parsed) ? parsed : [parsed];
    const atoms: EvidenceAtom[] = [];

    for (const rec of records) {
      const data = rec as Record<string, unknown>;
      const json = JSON.stringify(data);
      const contentHash = createHash('sha256').update(json).digest('hex');

      const validation = this.typeRegistry.validate(input.evidenceType, data);
      const status = validation.valid ? 'valid' : 'invalid';

      atoms.push({
        atomId: randomUUID(),
        evidenceType: input.evidenceType,
        sourceSystem: input.sourceSystem,
        extractDate: new Date(),
        contentHash,
        recordCount: 1,
        data,
        normalizedData: data,
        provenance: {
          where: input.filename ?? input.sourceSystem,
          when: new Date(),
          how: `parser:${this.parsers.detect(input.filename)}`,
          why: input.why,
          who: input.who,
          contentHash,
        },
        status,
        version: 1,
      });
    }
    return atoms;
  }
}
