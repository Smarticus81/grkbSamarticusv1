/**
 * ProcessSeeder — loads process bundle YAMLs and binds each to its
 * obligation set in the graph. Process bundles are the source of truth
 * for "what regulations does this process cover" and act as the runtime
 * scope tether for any agent bound to the process.
 *
 * Order of operations:
 *   1. Regulation seeder must have already loaded all (:Obligation) nodes.
 *   2. ProcessSeeder upserts (:Process) nodes.
 *   3. ProcessSeeder calls replaceProcessObligations which validates each
 *      claimed obligation ID exists in the graph and creates [:GOVERNED_BY]
 *      edges.
 *   4. Any obligation ID that doesn't resolve is reported as an error and
 *      surfaced to the seeder caller — we never silently bind to phantoms.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ObligationGraph } from './ObligationGraph.js';
import {
  ProcessBundleSchema,
  type ProcessBundle,
  type ProcessSeedResult,
} from './ProcessNode.js';

export class ProcessSeeder {
  constructor(private readonly graph: ObligationGraph) {}

  async seedFromYAML(filePath: string): Promise<ProcessSeedResult> {
    const result: ProcessSeedResult = {
      file: `${basename(dirname(filePath))}/${basename(filePath)}`,
      processId: '',
      obligationsBound: 0,
      obligationsMissing: [],
      errors: [],
    };
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed: ProcessBundle = ProcessBundleSchema.parse(parseYaml(raw));
      result.processId = parsed.processId;
      await this.graph.upsertProcess({
        processId: parsed.processId,
        name: parsed.name,
        description: parsed.description,
        category: parsed.category,
        jurisdictions: parsed.jurisdictions,
        version: parsed.version,
      });
      const { bound, missing } = await this.graph.replaceProcessObligations(
        parsed.processId,
        parsed.governedBy,
      );
      result.obligationsBound = bound.length;
      result.obligationsMissing = missing;
      if (missing.length > 0) {
        result.errors.push(
          `process ${parsed.processId} references ${missing.length} obligation(s) not in graph: ${missing.join(', ')}`,
        );
      }
    } catch (e) {
      result.errors.push(`file parse: ${e instanceof Error ? e.message : String(e)}`);
    }
    return result;
  }

  /**
   * Walk a directory of process bundles. Expects layout:
   *   <dir>/<process-id>/bundle.yaml
   *   <dir>/<process-id>/bundle.yml
   * but also accepts any *.yaml / *.yml file at any depth.
   */
  async seedAllProcesses(dir: string): Promise<ProcessSeedResult[]> {
    const results: ProcessSeedResult[] = [];
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
