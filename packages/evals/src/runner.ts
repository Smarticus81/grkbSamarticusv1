#!/usr/bin/env node
/**
 * Eval runner for Regulatory Ground.
 *
 * Usage:
 *   tsx src/runner.ts                          # run all suites
 *   tsx src/runner.ts --suite=capa             # run a specific suite
 *   tsx src/runner.ts --suite=all              # explicitly run all suites
 *   tsx src/runner.ts --suite=capa --model=gpt # tag the report with a model name
 *   tsx src/runner.ts --out=report.json        # write JSON report to file
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import { EvalSuiteSchema, type EvalReport, type EvalResult, type EvalSuite } from './types.js';
import { evaluatePrompt } from './evaluator.js';
import { loadGraphSnapshot, type GraphSnapshot } from './graph-client.js';

// ── Path resolution ─────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..');
const SUITES_DIR = join(PACKAGE_ROOT, 'suites');
const MONOREPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const REGULATIONS_DIR = join(MONOREPO_ROOT, 'packages', 'core', 'regulations');
const REPORTS_DIR = join(PACKAGE_ROOT, 'reports');

// ── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { suite: string; model: string; out: string | null } {
  let suite = 'all';
  let model = 'graph-snapshot';
  let out: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith('--suite=')) {
      suite = arg.slice('--suite='.length);
    } else if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    }
  }

  return { suite, model, out };
}

// ── Suite loading ───────────────────────────────────────────────────────────

async function loadSuite(filePath: string): Promise<EvalSuite> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = parse(raw);
  return EvalSuiteSchema.parse(parsed);
}

async function loadSuites(suiteName: string): Promise<EvalSuite[]> {
  const entries = await readdir(SUITES_DIR);
  const yamlFiles = entries.filter((f) => /\.ya?ml$/i.test(f));

  if (suiteName !== 'all') {
    const match = yamlFiles.find(
      (f) => basename(f, '.yaml') === suiteName || basename(f, '.yml') === suiteName,
    );
    if (!match) {
      console.error(`Suite "${suiteName}" not found in ${SUITES_DIR}`);
      console.error(`Available suites: ${yamlFiles.map((f) => basename(f, '.yaml')).join(', ')}`);
      process.exit(1);
    }
    return [await loadSuite(join(SUITES_DIR, match))];
  }

  return Promise.all(yamlFiles.map((f) => loadSuite(join(SUITES_DIR, f))));
}

// ── Reporting ───────────────────────────────────────────────────────────────

function computeSummary(results: EvalResult[]) {
  const totalPrompts = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = totalPrompts - passed;

  const avg = (vals: number[]) =>
    vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  return {
    totalPrompts,
    passed,
    failed,
    avgObligationRecall: avg(results.map((r) => r.metrics.obligationRecallAtK)),
    avgCitationAccuracy: avg(results.map((r) => r.metrics.citationAccuracy)),
    avgMandatoryMissRate: avg(results.map((r) => r.metrics.mandatoryMissRate)),
    avgLatencyMs: avg(results.map((r) => r.latencyMs)),
  };
}

function formatMarkdownReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push(`# Eval Report: ${report.suite}`);
  lines.push('');
  lines.push(`**Model:** ${report.model}`);
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total prompts | ${report.summary.totalPrompts} |`);
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(
    `| Avg obligation recall | ${(report.summary.avgObligationRecall * 100).toFixed(1)}% |`,
  );
  lines.push(
    `| Avg citation accuracy | ${(report.summary.avgCitationAccuracy * 100).toFixed(1)}% |`,
  );
  lines.push(
    `| Avg mandatory miss rate | ${(report.summary.avgMandatoryMissRate * 100).toFixed(1)}% |`,
  );
  lines.push(`| Avg latency | ${report.summary.avgLatencyMs.toFixed(0)}ms |`);
  lines.push('');
  lines.push('## Results');
  lines.push('');

  for (const result of report.results) {
    const icon = result.passed ? 'PASS' : 'FAIL';
    lines.push(`### [${icon}] ${result.promptId}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(
      `| Obligation recall | ${(result.metrics.obligationRecallAtK * 100).toFixed(1)}% |`,
    );
    lines.push(`| Citation accuracy | ${(result.metrics.citationAccuracy * 100).toFixed(1)}% |`);
    lines.push(
      `| Mandatory miss rate | ${(result.metrics.mandatoryMissRate * 100).toFixed(1)}% |`,
    );
    lines.push(`| False claim rate | ${(result.metrics.falseClaimRate * 100).toFixed(1)}% |`);
    lines.push(
      `| Evidence completeness | ${(result.metrics.evidenceCompleteness * 100).toFixed(1)}% |`,
    );
    if (result.metrics.refusalCorrectness !== null) {
      lines.push(
        `| Refusal correctness | ${(result.metrics.refusalCorrectness * 100).toFixed(1)}% |`,
      );
    }
    lines.push(`| Latency | ${result.latencyMs}ms |`);
    lines.push('');

    if (result.details.length > 0) {
      lines.push('**Details:**');
      for (const d of result.details) {
        lines.push(`- ${d}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('Regulatory Ground Eval Harness');
  console.log('='.repeat(50));
  console.log(`Suite:  ${args.suite}`);
  console.log(`Model:  ${args.model}`);
  console.log('');

  // Load the graph snapshot
  console.log('Loading graph snapshot from regulation YAMLs...');
  let snapshot: GraphSnapshot;
  try {
    snapshot = await loadGraphSnapshot(REGULATIONS_DIR);
  } catch (err) {
    console.error('Failed to load graph snapshot:', err);
    process.exit(1);
  }
  console.log(
    `  Loaded ${snapshot.obligations.size} obligations, ` +
      `${snapshot.constraints.size} constraints, ` +
      `${snapshot.regulations.size} regulations\n`,
  );

  // Load suites
  const suites = await loadSuites(args.suite);
  console.log(`Running ${suites.length} suite(s)...\n`);

  const allReports: EvalReport[] = [];

  for (const suite of suites) {
    console.log(`--- Suite: ${suite.name} ---`);
    console.log(`  ${suite.description}`);
    console.log(`  ${suite.prompts.length} prompts\n`);

    const results: EvalResult[] = [];

    for (const prompt of suite.prompts) {
      process.stdout.write(`  Evaluating ${prompt.id}... `);
      const result = await evaluatePrompt(prompt, args.model, snapshot);
      results.push(result);
      console.log(result.passed ? 'PASS' : `FAIL (${result.details.filter((d) => d !== 'All checks passed').join('; ')})`);
    }

    const report: EvalReport = {
      suite: suite.name,
      model: args.model,
      timestamp: new Date().toISOString(),
      results,
      summary: computeSummary(results),
    };

    allReports.push(report);

    console.log('');
    console.log(`  Summary: ${report.summary.passed}/${report.summary.totalPrompts} passed`);
    console.log(
      `  Avg recall: ${(report.summary.avgObligationRecall * 100).toFixed(1)}%`,
    );
    console.log('');
  }

  // Write reports
  await mkdir(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  for (const report of allReports) {
    const jsonPath =
      args.out ?? join(REPORTS_DIR, `${report.suite}-${timestamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');

    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    await writeFile(mdPath, formatMarkdownReport(report), 'utf-8');
    console.log(`Report written: ${jsonPath}`);
  }

  // Exit with failure if any suite has failures
  const totalFailed = allReports.reduce((sum, r) => sum + r.summary.failed, 0);
  if (totalFailed > 0) {
    console.log(`\n${totalFailed} prompt(s) failed across all suites.`);
    process.exit(1);
  } else {
    console.log('\nAll evaluations passed.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
