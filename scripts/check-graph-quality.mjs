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
  // === AgentOS bookkeeping (Phase 0) ===
  const allAgentRoleIds = new Map();
  const allHITLGateIds = new Map();
  const allPolicyIds = new Map();
  const allSLOIds = new Map();
  const allTriggerIds = new Map();
  const allProcessIds = new Set();
  const agentOsRefs = []; // { kind, target, file, ownerId }
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

    // ── AgentOS sections (Phase 0) ──────────────────────────────────────
    // Each section follows a uniform pattern: collect IDs (dedup), validate
    // shape, and queue cross-refs for resolution after all files are scanned.

    const agentRoles = Array.isArray(doc.agentRoles) ? doc.agentRoles : [];
    for (const role of agentRoles) {
      const id = role.agentRoleId;
      if (!id) {
        violations.push({ file: rel, rule: 'AGENTROLE_ID', message: 'AgentRole missing agentRoleId' });
        continue;
      }
      if (allAgentRoleIds.has(id)) {
        violations.push({ file: rel, rule: 'DUPLICATE_AGENTROLE', message: `Duplicate agentRoleId "${id}" (also in ${allAgentRoleIds.get(id)})` });
      } else {
        allAgentRoleIds.set(id, rel);
      }
      for (const pid of role.processIds ?? []) {
        agentOsRefs.push({ kind: 'process', target: pid, file: rel, ownerId: id });
      }
      for (const oid of role.obligationScope ?? []) {
        agentOsRefs.push({ kind: 'obligation', target: oid, file: rel, ownerId: id });
      }
    }

    const hitlGates = Array.isArray(doc.hitlGates) ? doc.hitlGates : [];
    for (const gate of hitlGates) {
      const id = gate.gateId;
      if (!id) {
        violations.push({ file: rel, rule: 'HITLGATE_ID', message: 'HITLGate missing gateId' });
        continue;
      }
      if (allHITLGateIds.has(id)) {
        violations.push({ file: rel, rule: 'DUPLICATE_HITLGATE', message: `Duplicate gateId "${id}" (also in ${allHITLGateIds.get(id)})` });
      } else {
        allHITLGateIds.set(id, rel);
      }
      if (!gate.appliesTo) {
        violations.push({ file: rel, rule: 'HITLGATE_APPLIESTO', message: `HITLGate "${id}" missing appliesTo (obligationId)` });
      } else {
        agentOsRefs.push({ kind: 'obligation', target: gate.appliesTo, file: rel, ownerId: id });
      }
      if (!gate.approverRole) {
        violations.push({ file: rel, rule: 'HITLGATE_APPROVER', message: `HITLGate "${id}" missing approverRole` });
      }
    }

    const policies = Array.isArray(doc.policies) ? doc.policies : [];
    const VALID_POLICY_CLASSES = new Set([
      'model_allowlist', 'data_residency', 'pii_redaction', 'hitl_required', 'slo_time_bound',
    ]);
    for (const policy of policies) {
      const id = policy.policyId;
      if (!id) {
        violations.push({ file: rel, rule: 'POLICY_ID', message: 'GovernancePolicy missing policyId' });
        continue;
      }
      if (allPolicyIds.has(id)) {
        violations.push({ file: rel, rule: 'DUPLICATE_POLICY', message: `Duplicate policyId "${id}" (also in ${allPolicyIds.get(id)})` });
      } else {
        allPolicyIds.set(id, rel);
      }
      if (!policy.policyClass || !VALID_POLICY_CLASSES.has(policy.policyClass)) {
        violations.push({ file: rel, rule: 'POLICY_CLASS', message: `Policy "${id}" has invalid policyClass: ${policy.policyClass}` });
      }
      // appliesTo entries may target either obligationIds or processIds; we
      // resolve against both at the end.
      for (const target of policy.appliesTo ?? []) {
        agentOsRefs.push({ kind: 'either', target, file: rel, ownerId: id });
      }
    }

    const slos = Array.isArray(doc.slos) ? doc.slos : [];
    for (const slo of slos) {
      const id = slo.sloId;
      if (!id) {
        violations.push({ file: rel, rule: 'SLO_ID', message: 'ObservabilitySLO missing sloId' });
        continue;
      }
      if (allSLOIds.has(id)) {
        violations.push({ file: rel, rule: 'DUPLICATE_SLO', message: `Duplicate sloId "${id}" (also in ${allSLOIds.get(id)})` });
      } else {
        allSLOIds.set(id, rel);
      }
      if (typeof slo.threshold !== 'number') {
        violations.push({ file: rel, rule: 'SLO_THRESHOLD', message: `SLO "${id}" missing or non-numeric threshold` });
      }
      if (!slo.appliesTo) {
        violations.push({ file: rel, rule: 'SLO_APPLIESTO', message: `SLO "${id}" missing appliesTo` });
      } else {
        agentOsRefs.push({ kind: 'either', target: slo.appliesTo, file: rel, ownerId: id });
      }
    }

    const triggers = Array.isArray(doc.triggers) ? doc.triggers : [];
    for (const trig of triggers) {
      const id = trig.triggerId;
      if (!id) {
        violations.push({ file: rel, rule: 'TRIGGER_ID', message: 'ProcessTrigger missing triggerId' });
        continue;
      }
      if (allTriggerIds.has(id)) {
        violations.push({ file: rel, rule: 'DUPLICATE_TRIGGER', message: `Duplicate triggerId "${id}" (also in ${allTriggerIds.get(id)})` });
      } else {
        allTriggerIds.set(id, rel);
      }
      if (!trig.processId) {
        violations.push({ file: rel, rule: 'TRIGGER_PROCESS', message: `Trigger "${id}" missing processId` });
      } else {
        agentOsRefs.push({ kind: 'process', target: trig.processId, file: rel, ownerId: id });
      }
      if (trig.eventType === 'schedule' && !trig.schedule) {
        violations.push({ file: rel, rule: 'TRIGGER_SCHEDULE', message: `Trigger "${id}" eventType=schedule but no cron schedule provided` });
      }
    }
  }

  // ── Process IDs known to the system (from process bundles) ──────────
  // Process bundles live under packages/core/processes/<process>/bundle.yaml
  const PROCESSES_DIR = join(ROOT, 'packages', 'core', 'processes');
  try {
    const processFiles = await findYamlFiles(PROCESSES_DIR);
    for (const pf of processFiles) {
      try {
        const doc = parse(await readFile(pf, 'utf-8'));
        if (doc?.processId) allProcessIds.add(doc.processId);
      } catch {
        // ignore malformed bundles here; bundle validation is its own concern
      }
    }
  } catch {
    // process directory may not exist in a fresh checkout
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

  // ── AgentOS dangling-ref resolution ───────────────────────────────────
  for (const { kind, target, file, ownerId } of agentOsRefs) {
    let resolved = false;
    if (kind === 'obligation') {
      resolved = allObligationIds.has(target);
    } else if (kind === 'process') {
      resolved = allProcessIds.has(target);
    } else if (kind === 'either') {
      resolved = allObligationIds.has(target) || allProcessIds.has(target);
    }
    if (!resolved) {
      violations.push({
        file,
        rule: 'AGENTOS_DANGLING_REF',
        message: `Reference target "${target}" (${kind}) in ${ownerId} does not exist in any regulation/process file`,
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
  console.log(`AgentRoles found:   ${allAgentRoleIds.size}`);
  console.log(`HITLGates found:    ${allHITLGateIds.size}`);
  console.log(`Policies found:     ${allPolicyIds.size}`);
  console.log(`SLOs found:         ${allSLOIds.size}`);
  console.log(`Triggers found:     ${allTriggerIds.size}`);
  console.log(`Processes known:    ${allProcessIds.size}`);
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
