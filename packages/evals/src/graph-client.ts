/**
 * Lightweight graph client for the eval harness.
 *
 * Reads regulation YAML files directly from disk so evals can run
 * without requiring a live Neo4j instance. For live-graph evals,
 * set EVAL_NEO4J_URI to point at a running instance.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface ObligationRecord {
  id: string;
  regulation: string;
  jurisdiction: string;
  processType: string;
  kind: string;
  title: string;
  text: string;
  sourceCitation: string;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
}

export interface ConstraintRecord {
  id: string;
  appliesTo: string;
  text: string;
  severity: string;
}

export interface GraphSnapshot {
  obligations: Map<string, ObligationRecord>;
  constraints: Map<string, ConstraintRecord>;
  regulations: Set<string>;
  jurisdictions: Set<string>;
  processTypes: Set<string>;
}

async function findYamlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findYamlFiles(fullPath)));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Load all regulation YAML files into an in-memory snapshot.
 */
export async function loadGraphSnapshot(regulationsDir: string): Promise<GraphSnapshot> {
  const obligations = new Map<string, ObligationRecord>();
  const constraints = new Map<string, ConstraintRecord>();
  const regulations = new Set<string>();
  const jurisdictions = new Set<string>();
  const processTypes = new Set<string>();

  const files = await findYamlFiles(regulationsDir);

  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf-8');
    const doc = parse(raw) as Record<string, unknown>;
    if (!doc || typeof doc !== 'object') continue;

    const regulation = (doc.regulation ?? (doc.metadata as Record<string, unknown>)?.regulation) as string;
    const jurisdiction = (doc.jurisdiction ?? '') as string;
    const processType = (doc.processType ?? '') as string;

    if (regulation) regulations.add(regulation);
    if (jurisdiction) jurisdictions.add(jurisdiction);
    if (processType) processTypes.add(processType);

    const oblArray = Array.isArray(doc.obligations) ? doc.obligations : [];
    for (const obl of oblArray) {
      const id = (obl.obligationId ?? obl.obligation_id) as string;
      if (!id) continue;
      obligations.set(id, {
        id,
        regulation: regulation ?? '',
        jurisdiction: (obl.jurisdiction ?? jurisdiction) as string,
        processType: (obl.process_type ?? processType) as string,
        kind: (obl.kind ?? 'obligation') as string,
        title: (obl.title ?? '') as string,
        text: (obl.text ?? '') as string,
        sourceCitation: (obl.sourceCitation ?? obl.source_citation ?? '') as string,
        mandatory: obl.mandatory !== false,
        requiredEvidenceTypes: (obl.requiredEvidenceTypes ?? obl.required_evidence_types ?? []) as string[],
      });
    }

    const conArray = Array.isArray(doc.constraints) ? doc.constraints : [];
    for (const con of conArray) {
      const id = (con.constraintId ?? con.constraint_id) as string;
      if (!id) continue;
      constraints.set(id, {
        id,
        appliesTo: (con.appliesTo ?? con.applies_to ?? '') as string,
        text: (con.text ?? '') as string,
        severity: (con.severity ?? 'hard') as string,
      });
    }
  }

  return { obligations, constraints, regulations, jurisdictions, processTypes };
}

/**
 * Search obligations by free-text query (simple substring match).
 */
export function searchObligations(
  snapshot: GraphSnapshot,
  query: string,
): ObligationRecord[] {
  const lower = query.toLowerCase();
  const results: ObligationRecord[] = [];
  for (const obl of snapshot.obligations.values()) {
    if (
      obl.title.toLowerCase().includes(lower) ||
      obl.text.toLowerCase().includes(lower) ||
      obl.id.toLowerCase().includes(lower)
    ) {
      results.push(obl);
    }
  }
  return results;
}

/**
 * Discover obligations for a given process type and jurisdiction.
 */
export function discoverObligations(
  snapshot: GraphSnapshot,
  processType: string,
  jurisdiction?: string,
): ObligationRecord[] {
  const results: ObligationRecord[] = [];
  const ptLower = processType.toLowerCase();
  const jurisLower = jurisdiction?.toLowerCase();

  for (const obl of snapshot.obligations.values()) {
    if (obl.processType.toLowerCase() !== ptLower) continue;
    if (jurisLower && obl.jurisdiction.toLowerCase() !== jurisLower) continue;
    results.push(obl);
  }
  return results;
}
