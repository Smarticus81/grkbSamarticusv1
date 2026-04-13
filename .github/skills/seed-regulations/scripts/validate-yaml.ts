#!/usr/bin/env tsx
/**
 * Validates regulation YAML files against the obligation node schema without
 * writing to Neo4j. Exits non-zero if any file fails validation.
 *
 * Usage: tsx validate-yaml.ts <dir>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  ObligationNodeSchema,
  ConstraintNodeSchema,
  DefinitionNodeSchema,
} from '../../../../packages/core/src/graph/types.js';

const RegulationFileSchema = z.object({
  regulation: z.string(),
  jurisdiction: z.string(),
  version: z.string(),
  artifactType: z.string().optional(),
  processType: z.string().optional(),
  obligations: z.array(ObligationNodeSchema.partial({
    jurisdiction: true,
    version: true,
    artifactType: true,
    processType: true,
  })).default([]),
  constraints: z.array(ConstraintNodeSchema).default([]),
  definitions: z.array(DefinitionNodeSchema).default([]),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.string(),
    props: z.record(z.unknown()).optional(),
  })).default([]),
});

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) yield full;
  }
}

const dir = process.argv[2] ?? 'packages/core/regulations';
let failed = 0;
let total = 0;
for (const file of walk(dir)) {
  total++;
  try {
    const raw = readFileSync(file, 'utf8');
    RegulationFileSchema.parse(parseYaml(raw));
    // eslint-disable-next-line no-console
    console.log(`OK   ${file}`);
  } catch (e: any) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`FAIL ${file}: ${e.message}`);
  }
}
// eslint-disable-next-line no-console
console.log(`\n${total - failed}/${total} files valid`);
process.exit(failed === 0 ? 0 : 1);
