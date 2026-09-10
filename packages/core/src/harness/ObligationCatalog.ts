import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ObligationNodeSchema, type ObligationNode } from '../graph/types.js';

/**
 * Read-only index of every obligation declared in the regulation YAML tree.
 * Lets the harness seed a MockGraph with *real* obligations (real evidence
 * requirements, real citations) instead of hand-written placeholders, so the
 * qualification gate and compliance validator exercise the same data the
 * production graph carries.
 */
export interface ObligationCatalog {
  get(id: string): ObligationNode | undefined;
  has(id: string): boolean;
  ids(): string[];
  size: number;
  /** Per-file parse problems. Never throws for a single bad file. */
  errors: { file: string; message: string }[];
  files: string[];
}

const CatalogFileSchema = z.object({
  regulation: z.string().optional(),
  jurisdiction: z.string().default('GLOBAL'),
  version: z.string().default('1.0.0'),
  artifactType: z.string().optional(),
  processType: z.string().optional(),
  obligations: z
    .array(ObligationNodeSchema.partial({ jurisdiction: true, version: true, artifactType: true, processType: true }))
    .default([]),
});

export function loadObligationCatalog(dir: string): ObligationCatalog {
  const nodes = new Map<string, ObligationNode>();
  const errors: { file: string; message: string }[] = [];
  const files: string[] = [];

  for (const file of walkYaml(dir)) {
    files.push(file);
    try {
      const parsed = CatalogFileSchema.safeParse(parseYaml(readFileSync(file, 'utf8')));
      if (!parsed.success) {
        errors.push({ file, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      const meta = parsed.data;
      for (const partial of meta.obligations) {
        const node = ObligationNodeSchema.safeParse({
          jurisdiction: meta.jurisdiction,
          version: meta.version,
          artifactType: meta.artifactType ?? 'GENERIC',
          processType: meta.processType ?? 'GENERIC',
          ...partial,
        });
        if (!node.success) {
          errors.push({ file, message: `obligation ${partial.obligationId ?? '?'}: ${node.error.message}` });
          continue;
        }
        nodes.set(node.data.obligationId, node.data);
      }
    } catch (e) {
      errors.push({ file, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    get: (id) => nodes.get(id),
    has: (id) => nodes.has(id),
    ids: () => Array.from(nodes.keys()),
    size: nodes.size,
    errors,
    files,
  };
}

/** Build a catalog from in-memory nodes (handy for unit tests). */
export function catalogFromNodes(list: ObligationNode[]): ObligationCatalog {
  const nodes = new Map(list.map((n) => [n.obligationId, n] as const));
  return {
    get: (id) => nodes.get(id),
    has: (id) => nodes.has(id),
    ids: () => Array.from(nodes.keys()),
    size: nodes.size,
    errors: [],
    files: [],
  };
}

function* walkYaml(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries.sort()) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walkYaml(full);
    else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) yield full;
  }
}
