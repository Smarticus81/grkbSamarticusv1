import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { ObligationGraph } from './ObligationGraph.js';
import type { SeedResult, RelationType } from './types.js';
import {
  ObligationNodeSchema,
  ConstraintNodeSchema,
  DefinitionNodeSchema,
} from './types.js';
import { isValidRelationType } from './relationships.js';

const RegulationFileSchema = z.object({
  regulation: z.string(),
  jurisdiction: z.string(),
  version: z.string(),
  artifactType: z.string().optional(),
  processType: z.string().optional(),
  obligations: z.array(ObligationNodeSchema.partial({ jurisdiction: true, version: true, artifactType: true, processType: true })).default([]),
  constraints: z.array(ConstraintNodeSchema).default([]),
  definitions: z.array(DefinitionNodeSchema).default([]),
  relationships: z
    .array(z.object({ from: z.string(), to: z.string(), type: z.string(), props: z.record(z.unknown()).optional() }))
    .default([]),
});

export type RegulationFile = z.infer<typeof RegulationFileSchema>;

export class GraphSeeder {
  constructor(private readonly graph: ObligationGraph) {}

  async seedFromYAML(filePath: string): Promise<SeedResult> {
    const result: SeedResult = {
      file: basename(filePath),
      obligationsLoaded: 0,
      constraintsLoaded: 0,
      definitionsLoaded: 0,
      relationshipsLoaded: 0,
      errors: [],
    };
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = RegulationFileSchema.parse(parseYaml(raw));

      for (const oblPartial of parsed.obligations) {
        const obl = ObligationNodeSchema.parse({
          jurisdiction: parsed.jurisdiction,
          version: parsed.version,
          artifactType: parsed.artifactType ?? 'GENERIC',
          processType: parsed.processType ?? 'GENERIC',
          ...oblPartial,
        });
        try {
          await this.graph.upsertObligation(obl);
          result.obligationsLoaded++;
        } catch (e: any) {
          result.errors.push(`obligation ${obl.obligationId}: ${e.message}`);
        }
      }

      for (const c of parsed.constraints) {
        try {
          await this.graph.upsertConstraint(c);
          result.constraintsLoaded++;
        } catch (e: any) {
          result.errors.push(`constraint ${c.constraintId}: ${e.message}`);
        }
      }

      for (const d of parsed.definitions) {
        try {
          await this.graph.upsertDefinition(d);
          result.definitionsLoaded++;
        } catch (e: any) {
          result.errors.push(`definition ${d.definitionId}: ${e.message}`);
        }
      }

      for (const rel of parsed.relationships) {
        if (!isValidRelationType(rel.type)) {
          result.errors.push(`invalid relation type: ${rel.type}`);
          continue;
        }
        try {
          await this.graph.upsertRelationship(rel.from, rel.to, rel.type as RelationType, rel.props);
          result.relationshipsLoaded++;
        } catch (e: any) {
          result.errors.push(`relationship ${rel.from}->${rel.to}: ${e.message}`);
        }
      }
    } catch (e: any) {
      result.errors.push(`file parse: ${e.message}`);
    }
    return result;
  }

  async seedAllRegulations(dir: string): Promise<SeedResult[]> {
    await this.graph.ensureConstraints();
    const results: SeedResult[] = [];
    for (const file of this.walkYaml(dir)) {
      results.push(await this.seedFromYAML(file));
    }
    return results;
  }

  private *walkYaml(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        yield* this.walkYaml(full);
      } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
        yield full;
      }
    }
  }
}
