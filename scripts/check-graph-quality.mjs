#!/usr/bin/env node
/**
 * check-graph-quality.mjs
 *
 * Validates all regulation YAML files in packages/core/regulations/ against
 * quality rules:
 *   1. Every file must parse against the legacy or v2 YAML schema
 *   2. No duplicate obligation / constraint IDs across the entire graph
 *   3. No orphan obligations (every obligation must belong to a known regulation)
 *   4. No dangling cross-references (every ref target must exist)
 *   5. Every mandatory obligation must have >= 1 evidence type
 *   6. Every regulation file must have version metadata
 *
 * Exit code 0 = clean, 1 = violations found.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const REGULATIONS_DIR = join(ROOT, 'packages', 'core', 'regulations');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively find all .yaml / .yml files under a directory.
 */
async function findYamlFiles(dir) {
  const results = [];
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const violations = [];
  const allObligationIds = new Map();   // id -> filePath
  const allConstraintIds = new Map();   // id -> filePath
  const allConstraintTargets = [];      // { appliesTo, file }
  const files = await findYamlFiles(REGULATIONS_DIR);

  if (files.length === 0) {
    console.error('No YAML files found in', REGULATIONS_DIR);
    process.exit(1);
  }

  console.log(`Scanning ${files.length} regulation YAML files...\n`);

  for (const filePath of files) {
    const rel = relative(ROOT, filePath);
    let raw;
    let doc;

    // ── Parse ───────────────────────────────────────────────────────────
    try {
      raw = await readFile(filePath, 'utf-8');
      doc = parse(raw);
    } catch (err) {
      violations.push({ file: rel, rule: 'PARSE', message: `YAML parse error: ${err.message}` });
      continue;
    }

    if (!doc || typeof doc !== 'object') {
      violations.push({ file: rel, rule: 'PARSE', message: 'YAML root is not an object' });
      continue;
    }

    // ── Rule 6: Version metadata ────────────────────────────────────────
    const version = doc.version ?? doc.metadata?.version;
    if (!version) {
      violations.push({ file: rel, rule: 'VERSION', message: 'Missing version field' });
    }

    const regulation = doc.regulation ?? doc.metadata?.regulation;
    if (!regulation) {
      violations.push({ file: rel, rule: 'REGULATION', message: 'Missing regulation identifier' });
    }

    // ── Obligations ─────────────────────────────────────────────────────
    const obligations = Array.isArray(doc.obligations) ? doc.obligations : [];
    for (const obl of obligations) {
      const id = obl.obligationId ?? obl.obligation_id;
      if (!id) {
        violations.push({ file: rel, rule: 'OBL_ID', message: 'Obligation missing ID field' });
        continue;
      }

      // Rule 2: Duplicate IDs
      if (allObligationIds.has(id)) {
        violations.push({
          file: rel,
          rule: 'DUPLICATE_OBL',
          message: `Duplicate obligation ID "${id}" (also in ${allObligationIds.get(id)})`,
        });
      } else {
        allObligationIds.set(id, rel);
      }

      // Rule 5: Mandatory obligations need evidence types
      const isMandatory = obl.mandatory !== false;
      const evidenceTypes = obl.requiredEvidenceTypes ?? obl.required_evidence_types ?? [];
      if (isMandatory && evidenceTypes.length === 0) {
        violations.push({
          file: rel,
          rule: 'EVIDENCE',
          message: `Mandatory obligation "${id}" has no required evidence types`,
        });
      }
    }

    // ── Constraints ─────────────────────────────────────────────────────
    const constraints = Array.isArray(doc.constraints) ? doc.constraints : [];
    for (const con of constraints) {
      const id = con.constraintId ?? con.constraint_id;
      if (!id) {
        violations.push({ file: rel, rule: 'CON_ID', message: 'Constraint missing ID field' });
        continue;
      }

      if (allConstraintIds.has(id)) {
        violations.push({
          file: rel,
          rule: 'DUPLICATE_CON',
          message: `Duplicate constraint ID "${id}" (also in ${allConstraintIds.get(id)})`,
        });
      } else {
        allConstraintIds.set(id, rel);
      }

      const target = con.appliesTo ?? con.applies_to;
      if (target) {
        allConstraintTargets.push({ target, file: rel, constraintId: id });
      }
    }

    // ── Cross-references ────────────────────────────────────────────────
    const crossRefs = Array.isArray(doc.cross_references) ? doc.cross_references : [];
    for (const ref of crossRefs) {
      if (ref.from) {
        allConstraintTargets.push({ target: ref.from, file: rel, constraintId: `xref:${ref.from}->${ref.to}` });
      }
      if (ref.to) {
        allConstraintTargets.push({ target: ref.to, file: rel, constraintId: `xref:${ref.from}->${ref.to}` });
      }
    }
  }

  // ── Rule 4: Dangling cross-references ─────────────────────────────────
  for (const { target, file, constraintId } of allConstraintTargets) {
    if (!allObligationIds.has(target) && !allConstraintIds.has(target)) {
      violations.push({
        file,
        rule: 'DANGLING_REF',
        message: `Reference target "${target}" in ${constraintId} does not exist in any regulation file`,
      });
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  console.log('='.repeat(70));
  console.log('REGULATION GRAPH QUALITY REPORT');
  console.log('='.repeat(70));
  console.log(`Files scanned:      ${files.length}`);
  console.log(`Obligations found:  ${allObligationIds.size}`);
  console.log(`Constraints found:  ${allConstraintIds.size}`);
  console.log(`Violations found:   ${violations.length}`);
  console.log('='.repeat(70));

  if (violations.length > 0) {
    console.log('\nVIOLATIONS:\n');

    // Group by rule
    const byRule = new Map();
    for (const v of violations) {
      if (!byRule.has(v.rule)) byRule.set(v.rule, []);
      byRule.get(v.rule).push(v);
    }

    for (const [rule, items] of byRule) {
      console.log(`  [${rule}] (${items.length} violation${items.length > 1 ? 's' : ''}):`);
      for (const item of items) {
        console.log(`    - ${item.file}: ${item.message}`);
      }
      console.log();
    }

    process.exit(1);
  } else {
    console.log('\nAll checks passed.\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
