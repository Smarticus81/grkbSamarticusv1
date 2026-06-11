#!/usr/bin/env node
/**
 * Baseline-gated compliance-validation benchmark.
 *
 * Runs golden cases against the real CompliancePipeline (all five validators)
 * and the QualificationGate from @regground/core, entirely on in-memory mocks
 * — no Neo4j, Postgres, or LLM. Scores per-check precision/recall and overall
 * accuracy, then compares against the committed baseline:
 * any regression exits non-zero, so a release cannot ship if
 * compliance-validation accuracy drops.
 *
 * Usage:
 *   tsx src/validation-bench.ts                     # run + gate against baseline
 *   tsx src/validation-bench.ts --update-baseline   # rewrite the baseline (explicit only)
 *   tsx src/validation-bench.ts --out=path.json     # also write the results artifact here
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  MockGraph,
  CompliancePipeline,
  QualificationGate,
  ClaimCoverageValidator,
  EvidenceBackedComplianceValidator,
  ConstraintEvaluator,
  CitationVerifier,
  RegulatoryContradictionDetector,
  ObligationNodeSchema,
  type ObligationNode,
  type ObligationExplanation,
  type RelationType,
  type ValidationFinding,
} from '@regground/core';
import {
  BenchCaseFileSchema,
  BaselineSchema,
  VALIDATOR_NAMES,
  type Baseline,
  type BenchCase,
  type BenchGraphSpec,
  type BenchObligation,
  type CheckScore,
  type PipelineCase,
  type QualificationCase,
} from './validation-bench/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const CASES_DIR = join(PACKAGE_ROOT, 'validation-cases');
const BASELINE_PATH = join(PACKAGE_ROOT, 'validation-baseline.json');
const REPORTS_DIR = join(PACKAGE_ROOT, 'reports');

const GATE_CHECK = 'QualificationGate';
const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, error: 2, critical: 3 };
const EPSILON = 1e-9;

// ── Graph construction ──────────────────────────────────────────────────────

/** MockGraph with declarative cross-reference support for the contradiction detector. */
class BenchGraph extends MockGraph {
  private readonly xrefs = new Map<string, ObligationNode[]>();

  setCrossReferences(obligationId: string, nodes: ObligationNode[]): void {
    this.xrefs.set(obligationId, nodes);
  }

  override async explainObligation(id: string): Promise<ObligationExplanation> {
    const base = await super.explainObligation(id);
    return { ...base, crossReferences: this.xrefs.get(id) ?? [] };
  }
}

function toObligationNode(spec: BenchObligation): ObligationNode {
  return ObligationNodeSchema.parse({
    obligationId: spec.obligationId,
    jurisdiction: spec.jurisdiction,
    artifactType: 'QMS_RECORD',
    processType: spec.processType,
    kind: 'obligation',
    title: spec.title ?? spec.obligationId,
    text: spec.text ?? `Requirement ${spec.obligationId}`,
    sourceCitation: spec.sourceCitation ?? `src:${spec.obligationId}`,
    version: '1',
    mandatory: spec.mandatory,
    requiredEvidenceTypes: spec.requiredEvidenceTypes,
  });
}

async function buildGraph(spec: BenchGraphSpec): Promise<BenchGraph> {
  const graph = new BenchGraph();
  for (const o of spec.obligations) {
    await graph.upsertObligation(toObligationNode(o));
  }
  for (const c of spec.constraints) {
    await graph.upsertConstraint({
      constraintId: c.constraintId,
      appliesTo: c.appliesTo,
      text: c.text,
      ...(c.expression !== undefined ? { expression: c.expression } : {}),
      severity: c.severity,
      metadata: {},
    });
  }
  for (const r of spec.relationships) {
    await graph.upsertRelationship(r.from, r.to, r.type as RelationType);
  }
  for (const [id, refs] of Object.entries(spec.crossReferences)) {
    graph.setCrossReferences(id, refs.map(toObligationNode));
  }
  return graph;
}

// ── Case execution ──────────────────────────────────────────────────────────

interface CheckTally {
  positives: number;
  truePositives: number;
  falseAlarmCandidates: number;
  falseAlarms: number;
}

interface CaseOutcome {
  id: string;
  suite: string;
  passed: boolean;
  failures: string[];
}

function newTally(): CheckTally {
  return { positives: 0, truePositives: 0, falseAlarmCandidates: 0, falseAlarms: 0 };
}

function findingMatches(
  finding: ValidationFinding,
  expected: PipelineCase['expect']['findings'][number],
): boolean {
  if (finding.validator !== expected.validator) return false;
  if (finding.severity !== expected.severity) return false;
  if (expected.obligationId && finding.obligationId !== expected.obligationId) return false;
  if (expected.messageIncludes && !finding.message.includes(expected.messageIncludes)) return false;
  return true;
}

async function runPipelineCase(
  benchCase: PipelineCase,
  tallies: Map<string, CheckTally>,
): Promise<CaseOutcome> {
  const failures: string[] = [];
  const graph = await buildGraph(benchCase.graph);
  const pipeline = new CompliancePipeline([
    new ClaimCoverageValidator(),
    new EvidenceBackedComplianceValidator(),
    new ConstraintEvaluator(graph as never),
    new CitationVerifier(graph as never),
    new RegulatoryContradictionDetector(graph as never),
  ]);

  const obligations = await graph.getObligationsForProcess(
    benchCase.processType,
    benchCase.jurisdiction,
  );
  const report = await pipeline.validate(benchCase.output, obligations, {
    processType: benchCase.processType,
    jurisdiction: benchCase.jurisdiction,
    processInstanceId: `bench-${benchCase.id}`,
    agentId: 'validation-bench',
  });

  if (report.status !== benchCase.expect.status) {
    failures.push(`status: expected ${benchCase.expect.status}, got ${report.status}`);
  }
  if (
    benchCase.expect.passedHardChecks !== undefined &&
    report.passedHardChecks !== benchCase.expect.passedHardChecks
  ) {
    failures.push(
      `passedHardChecks: expected ${benchCase.expect.passedHardChecks}, got ${report.passedHardChecks}`,
    );
  }

  for (const expected of benchCase.expect.findings) {
    const tally = tallies.get(expected.validator)!;
    tally.positives++;
    if (report.findings.some((f) => findingMatches(f, expected))) {
      tally.truePositives++;
    } else {
      failures.push(
        `missing finding: ${expected.validator}/${expected.severity}` +
          (expected.obligationId ? ` for ${expected.obligationId}` : '') +
          (expected.messageIncludes ? ` (~"${expected.messageIncludes}")` : ''),
      );
    }
  }

  for (const validator of benchCase.expect.mustNotFire) {
    const tally = tallies.get(validator)!;
    tally.falseAlarmCandidates++;
    const fired = report.findings.filter(
      (f) => f.validator === validator && (SEVERITY_RANK[f.severity] ?? 0) >= 1,
    );
    if (fired.length > 0) {
      tally.falseAlarms++;
      failures.push(
        `false alarm: ${validator} fired ${fired.map((f) => `${f.severity}:"${f.message}"`).join('; ')}`,
      );
    }
  }

  return { id: benchCase.id, suite: '', passed: failures.length === 0, failures };
}

async function runQualificationCase(
  benchCase: QualificationCase,
  tallies: Map<string, CheckTally>,
): Promise<CaseOutcome> {
  const failures: string[] = [];
  const graph = await buildGraph(benchCase.graph);
  const gate = new QualificationGate(graph as never);

  const result = await gate.check({
    processType: benchCase.input.processType,
    jurisdiction: benchCase.input.jurisdiction,
    availableEvidence: benchCase.input.availableEvidence,
    requiredObligations: benchCase.input.requiredObligations,
  });

  const tally = tallies.get(GATE_CHECK)!;
  const expectsIntervention = benchCase.expect.status !== 'QUALIFIED';
  if (expectsIntervention) {
    tally.positives++;
    if (result.status === benchCase.expect.status) tally.truePositives++;
  } else {
    tally.falseAlarmCandidates++;
    if (result.status !== 'QUALIFIED') tally.falseAlarms++;
  }

  if (result.status !== benchCase.expect.status) {
    failures.push(`status: expected ${benchCase.expect.status}, got ${result.status}`);
  }
  for (const evidence of benchCase.expect.missingEvidenceIncludes) {
    if (!result.missingEvidence.includes(evidence)) {
      failures.push(`missingEvidence should include "${evidence}"`);
    }
  }
  if (
    benchCase.expect.coverageScore !== undefined &&
    Math.abs(result.coverageScore - benchCase.expect.coverageScore) > 0.001
  ) {
    failures.push(
      `coverageScore: expected ${benchCase.expect.coverageScore}, got ${result.coverageScore.toFixed(3)}`,
    );
  }
  if (
    benchCase.expect.canProceedWithHumanApproval !== undefined &&
    result.canProceedWithHumanApproval !== benchCase.expect.canProceedWithHumanApproval
  ) {
    failures.push(
      `canProceedWithHumanApproval: expected ${benchCase.expect.canProceedWithHumanApproval}, got ${result.canProceedWithHumanApproval}`,
    );
  }

  return { id: benchCase.id, suite: '', passed: failures.length === 0, failures };
}

// ── Scoring + gating ────────────────────────────────────────────────────────

function toScore(tally: CheckTally): CheckScore {
  return {
    positives: tally.positives,
    truePositives: tally.truePositives,
    recall: tally.positives === 0 ? 1 : tally.truePositives / tally.positives,
    falseAlarmCandidates: tally.falseAlarmCandidates,
    falseAlarms: tally.falseAlarms,
    precision:
      tally.truePositives + tally.falseAlarms === 0
        ? 1
        : tally.truePositives / (tally.truePositives + tally.falseAlarms),
  };
}

function compareToBaseline(
  baseline: Baseline,
  caseCount: number,
  overallAccuracy: number,
  checks: Record<string, CheckScore>,
): string[] {
  const regressions: string[] = [];
  if (caseCount < baseline.caseCount) {
    regressions.push(
      `case count dropped: ${caseCount} < baseline ${baseline.caseCount} — removing cases cannot improve the score`,
    );
  }
  if (overallAccuracy < baseline.overallAccuracy - EPSILON) {
    regressions.push(
      `overall accuracy regressed: ${(overallAccuracy * 100).toFixed(1)}% < baseline ${(baseline.overallAccuracy * 100).toFixed(1)}%`,
    );
  }
  for (const [name, baseScore] of Object.entries(baseline.checks)) {
    const current = checks[name];
    if (!current) {
      regressions.push(`check "${name}" missing from current run (present in baseline)`);
      continue;
    }
    if (current.recall < baseScore.recall - EPSILON) {
      regressions.push(
        `${name} recall regressed: ${(current.recall * 100).toFixed(1)}% < baseline ${(baseScore.recall * 100).toFixed(1)}%`,
      );
    }
    if (current.precision < baseScore.precision - EPSILON) {
      regressions.push(
        `${name} precision regressed: ${(current.precision * 100).toFixed(1)}% < baseline ${(baseScore.precision * 100).toFixed(1)}%`,
      );
    }
  }
  return regressions;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const updateBaseline = argv.includes('--update-baseline');
  const outArg = argv.find((a) => a.startsWith('--out='));

  console.log('Compliance Validation Benchmark (baseline-gated)');
  console.log('='.repeat(52));

  // Load + validate all case files.
  const entries = (await readdir(CASES_DIR)).filter((f) => /\.ya?ml$/i.test(f)).sort();
  if (entries.length === 0) {
    console.error(`No case files found in ${CASES_DIR}`);
    process.exit(1);
  }

  const tallies = new Map<string, CheckTally>();
  for (const v of VALIDATOR_NAMES) tallies.set(v, newTally());
  tallies.set(GATE_CHECK, newTally());

  const outcomes: CaseOutcome[] = [];
  const seenIds = new Set<string>();

  for (const file of entries) {
    const raw = await readFile(join(CASES_DIR, file), 'utf-8');
    const caseFile = BenchCaseFileSchema.parse(parse(raw));
    console.log(`\nSuite: ${caseFile.suite} — ${caseFile.cases.length} cases`);

    for (const benchCase of caseFile.cases as BenchCase[]) {
      if (seenIds.has(benchCase.id)) {
        console.error(`Duplicate case id: ${benchCase.id}`);
        process.exit(1);
      }
      seenIds.add(benchCase.id);

      const outcome =
        benchCase.target === 'pipeline'
          ? await runPipelineCase(benchCase, tallies)
          : await runQualificationCase(benchCase, tallies);
      outcome.suite = caseFile.suite;
      outcomes.push(outcome);
      console.log(
        `  ${outcome.passed ? 'PASS' : 'FAIL'}  ${benchCase.id}` +
          (outcome.passed ? '' : `\n        ${outcome.failures.join('\n        ')}`),
      );
    }
  }

  const caseCount = outcomes.length;
  const passedCases = outcomes.filter((o) => o.passed).length;
  const overallAccuracy = passedCases / caseCount;
  const checks: Record<string, CheckScore> = {};
  for (const [name, tally] of tallies) checks[name] = toScore(tally);

  console.log('\n' + '-'.repeat(52));
  console.log(`Cases: ${passedCases}/${caseCount} passed (accuracy ${(overallAccuracy * 100).toFixed(1)}%)`);
  for (const [name, score] of Object.entries(checks)) {
    console.log(
      `  ${name}: recall ${(score.recall * 100).toFixed(0)}% (${score.truePositives}/${score.positives}), ` +
        `precision ${(score.precision * 100).toFixed(0)}% (${score.falseAlarms} false alarms)`,
    );
  }

  // Write the results artifact.
  const artifact = {
    generatedAt: new Date().toISOString(),
    caseCount,
    passedCases,
    overallAccuracy,
    checks,
    failures: outcomes
      .filter((o) => !o.passed)
      .map((o) => ({ suite: o.suite, id: o.id, failures: o.failures })),
  };
  await mkdir(REPORTS_DIR, { recursive: true });
  const artifactPath = outArg
    ? outArg.slice('--out='.length)
    : join(REPORTS_DIR, 'validation-bench-latest.json');
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf-8');
  console.log(`\nResults artifact: ${artifactPath}`);

  // Update or gate against the baseline.
  if (updateBaseline) {
    const baseline: Baseline = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      caseCount,
      overallAccuracy,
      checks,
    };
    await writeFile(BASELINE_PATH, JSON.stringify(baseline, null, 2), 'utf-8');
    console.log(`Baseline updated: ${BASELINE_PATH}`);
    if (overallAccuracy < 1) {
      console.warn('WARNING: baseline written with failing cases — fix them before relying on the gate.');
    }
    return;
  }

  let baseline: Baseline;
  try {
    baseline = BaselineSchema.parse(JSON.parse(await readFile(BASELINE_PATH, 'utf-8')));
  } catch (err) {
    console.error(
      `\nNo valid baseline at ${BASELINE_PATH}. ` +
        'Run with --update-baseline to create one (review the scores first).',
    );
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const regressions = compareToBaseline(baseline, caseCount, overallAccuracy, checks);
  if (regressions.length > 0) {
    console.error('\nREGRESSION GATE FAILED:');
    for (const r of regressions) console.error(`  ✗ ${r}`);
    console.error('\nIf the new scores are intentional improvements to the cases themselves,');
    console.error('rerun with --update-baseline and commit the new baseline.');
    process.exit(1);
  }

  console.log(`\nGate passed — no regression vs baseline (${baseline.updatedAt}).`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
