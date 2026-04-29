/**
 * Process node — a runnable QMS process that scopes which obligations its
 * agents are allowed to see at runtime. The process bundle is the source of
 * truth for "what regulations does this agent operate under".
 *
 * Agents bound to a process can ONLY query obligations connected via
 * (:Process)-[:GOVERNED_BY]->(:Obligation). Anything outside that set is
 * invisible — this is the tether that prevents agents from inventing
 * citations or claiming obligations they don't actually own.
 */

import { z } from 'zod';

export const ProcessNodeSchema = z.object({
  processId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  /** ISO category — e.g. "post-market", "design", "qms-core", "production". */
  category: z.string().min(1),
  jurisdictions: z.array(z.string()).min(1),
  version: z.string().default('1.0.0'),
});
export type ProcessNode = z.infer<typeof ProcessNodeSchema>;

export const ProcessBundleSchema = z.object({
  processId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  jurisdictions: z.array(z.string()).min(1),
  version: z.string().default('1.0.0'),
  /** Obligation IDs that govern this process. Each ID MUST already exist in
   *  the graph (loaded by the regulation seeder) or seeding will fail loud. */
  governedBy: z.array(z.string().min(1)).min(1),
});
export type ProcessBundle = z.infer<typeof ProcessBundleSchema>;

export interface ProcessSeedResult {
  file: string;
  processId: string;
  obligationsBound: number;
  obligationsMissing: string[];
  errors: string[];
}
