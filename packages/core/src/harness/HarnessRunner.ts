import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { TestHarness } from './TestHarness.js';
import type { BaseGroundedAgent } from '../agents/BaseGroundedAgent.js';
import type { ObligationNode } from '../graph/types.js';
import type { ObligationCatalog } from './ObligationCatalog.js';
import type {
  HarnessResult,
  HarnessSummary,
  ScenarioRunResult,
  ScenarioSuiteResult,
} from './types.js';

const QualificationStatusSchema = z.enum([
  'QUALIFIED',
  'QUALIFIED_WITH_WARNINGS',
  'NEEDS_HUMAN_REVIEW',
  'BLOCKED',
  'OUT_OF_SCOPE',
]);

const MockLLMSchema = z.array(z.object({ pattern: z.string(), response: z.string() })).default([]);

const ContextSchema = z
  .object({
    processType: z.string().optional(),
    jurisdiction: z.string().optional(),
    /** Process-first scope. Defaults to `harness:<agent>` so the mock graph binds obligations to it. */
    processId: z.string().optional(),
    workspaceId: z.string().optional(),
    /** Overrides the evidence derived from the seeded obligations. Use `[]` to force a BLOCKED qualification. */
    availableEvidenceTypes: z.array(z.string()).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .default({});

const AssertionsSchema = z
  .object({
    traceChainValid: z.boolean().optional(),
    obligationsCovered: z.array(z.string()).optional(),
    confidenceAbove: z.number().optional(),
    llmCalls: z.number().int().nonnegative().optional(),
    /** Expected lifecycle outcome. Defaults to `true` unless `qualificationStatus` expects a blocking status. */
    success: z.boolean().optional(),
    qualificationStatus: QualificationStatusSchema.optional(),
    noComplianceGaps: z.boolean().optional(),
    complianceScoreAbove: z.number().optional(),
    hasEvents: z.array(z.string()).optional(),
    noEvents: z.array(z.string()).optional(),
    /** Deep-subset match against the agent output. */
    output: z.record(z.unknown()).optional(),
    /** Regex the failure message must match (only meaningful with `success: false`). */
    errorMatches: z.string().optional(),
  })
  .default({});

const ScenarioSchema = z.object({
  name: z.string(),
  agent: z.string(),
  input: z.record(z.unknown()),
  context: ContextSchema,
  mockObligations: z.array(z.string()).optional(),
  mockLLM: MockLLMSchema,
  mockEvidence: z
    .array(z.object({ atomId: z.string(), evidenceType: z.string(), data: z.record(z.unknown()).default({}) }))
    .default([]),
  assertions: AssertionsSchema,
});

const DefaultsSchema = z
  .object({
    processType: z.string().optional(),
    jurisdiction: z.string().optional(),
    processId: z.string().optional(),
    mockObligations: z.array(z.string()).optional(),
    availableEvidenceTypes: z.array(z.string()).optional(),
    mockLLM: MockLLMSchema,
  })
  .default({});

export const ScenarioFileSchema = z.object({
  /** Suite name shown in reports. Defaults to the file name. */
  name: z.string().optional(),
  description: z.string().optional(),
  /** Applied to every scenario unless the scenario overrides the field. */
  defaults: DefaultsSchema,
  scenarios: z.array(ScenarioSchema).min(1),
});

export type ScenarioFile = z.infer<typeof ScenarioFileSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type AgentLookup = (name: string) => BaseGroundedAgent<any, any>;

export interface HarnessRunnerOptions {
  /**
   * Resolves `mockObligations` ids to real nodes. Without a catalog the runner
   * synthesises placeholder obligations (mandatory, no evidence requirements).
   */
  catalog?: ObligationCatalog;
  /**
   * Fallback obligation set for a scenario that names none (e.g. the process
   * definition's ids). When absent the agent's own declared obligations are used.
   */
  defaultObligationsFor?: (agentName: string) => string[] | undefined;
  /** Fallback process type; when absent the agent's first registered process type is used. */
  defaultProcessTypeFor?: (agentName: string) => string | undefined;
}

const BLOCKING_STATUSES = new Set(['BLOCKED', 'OUT_OF_SCOPE', 'NEEDS_HUMAN_REVIEW']);

/**
 * Executes YAML scenario files against agents through `TestHarness`. Every
 * scenario is isolated: the mock graph is re-seeded, the LLM canned responses
 * are replaced, and trace chains are cleared before each run.
 */
export class HarnessRunner {
  constructor(
    private readonly harness: TestHarness,
    private readonly lookup: AgentLookup,
    private readonly options: HarnessRunnerOptions = {},
  ) {}

  /** Parse a YAML document into a validated scenario file. Throws on schema errors. */
  static parse(yamlText: string): ScenarioFile {
    return ScenarioFileSchema.parse(parseYaml(yamlText));
  }

  async runFile(filePath: string): Promise<ScenarioSuiteResult> {
    const file = HarnessRunner.parse(readFileSync(filePath, 'utf8'));
    const suite = await this.runScenarios(file, file.name ?? basename(filePath));
    return { ...suite, file: filePath };
  }

  async runFiles(filePaths: string[]): Promise<ScenarioSuiteResult[]> {
    const out: ScenarioSuiteResult[] = [];
    for (const p of filePaths) out.push(await this.runFile(p));
    return out;
  }

  async runYaml(yamlText: string, name = 'inline'): Promise<ScenarioSuiteResult> {
    const file = HarnessRunner.parse(yamlText);
    return this.runScenarios(file, file.name ?? name);
  }

  async runScenarios(file: ScenarioFile, name: string): Promise<ScenarioSuiteResult> {
    const started = performance.now();
    const results: ScenarioRunResult[] = [];
    for (const scenario of file.scenarios) results.push(await this.runScenario(scenario, file.defaults));
    const passed = results.filter((r) => r.ok).length;
    return {
      name,
      results,
      total: results.length,
      passed,
      failed: results.length - passed,
      durationMs: performance.now() - started,
    };
  }

  async runScenario(scenario: Scenario, defaults: ScenarioFile['defaults'] = DefaultsSchema.parse({})): Promise<ScenarioRunResult> {
    const started = performance.now();
    const failures: string[] = [];
    const base: Omit<ScenarioRunResult, 'ok' | 'durationMs' | 'failures'> = {
      name: scenario.name,
      agent: scenario.agent,
      llmCalls: 0,
      traceEvents: 0,
      obligationsSeeded: [],
    };
    const finish = (extra: Partial<ScenarioRunResult> = {}): ScenarioRunResult => ({
      ...base,
      ...extra,
      failures,
      ok: failures.length === 0,
      error: failures.length ? failures.join('\n') : undefined,
      durationMs: performance.now() - started,
    });

    // 1. Isolate.
    this.harness.reset();
    this.harness.withMockLLM([...defaults.mockLLM, ...scenario.mockLLM], { replace: true });
    this.harness.withMockEvidence(scenario.mockEvidence);

    // 2. Look the agent up first: its declared obligations and process types
    //    are the fallbacks for everything the scenario leaves unspecified.
    let agent: BaseGroundedAgent<any, any>;
    try {
      agent = this.lookup(scenario.agent);
    } catch (e) {
      failures.push(`Agent lookup failed: ${e instanceof Error ? e.message : String(e)}`);
      return finish();
    }

    // 3. Seed the graph with the scenario's obligations.
    const obligationIds =
      scenario.mockObligations ??
      defaults.mockObligations ??
      this.options.defaultObligationsFor?.(scenario.agent) ??
      agent.declaredObligations;
    const seeded: ObligationNode[] = [];
    for (const id of obligationIds) {
      const node = this.resolveObligation(id, scenario, defaults);
      if (!node) {
        failures.push(`Unknown obligation "${id}" — not present in the regulation catalog`);
        continue;
      }
      seeded.push(node);
    }
    base.obligationsSeeded = seeded.map((n) => n.obligationId);
    if (failures.length) return finish();

    const graph = this.harness.mockGraph;
    if (!graph) {
      failures.push('HarnessRunner requires the harness to use a MockGraph');
      return finish();
    }
    graph.clear().seed(seeded);
    const processId = scenario.context.processId ?? defaults.processId ?? `harness:${scenario.agent}`;
    graph.registerProcess(processId, base.obligationsSeeded);

    // 4. Resolve the run context.
    const processType =
      scenario.context.processType ??
      defaults.processType ??
      this.options.defaultProcessTypeFor?.(scenario.agent) ??
      agent.processTypes[0] ??
      seeded[0]?.processType ??
      'GENERIC';
    const jurisdiction = scenario.context.jurisdiction ?? defaults.jurisdiction ?? seeded[0]?.jurisdiction ?? 'GLOBAL';
    const availableEvidenceTypes =
      scenario.context.availableEvidenceTypes ??
      defaults.availableEvidenceTypes ??
      Array.from(
        new Set([
          ...seeded.flatMap((n) => n.requiredEvidenceTypes),
          ...scenario.mockEvidence.map((a) => a.evidenceType),
        ]),
      );

    // 5. Run.
    let result: HarnessResult;
    try {
      result = await this.harness.runAgent(agent, scenario.input, {
        processId,
        processType,
        jurisdiction,
        availableEvidenceTypes,
        workspaceId: scenario.context.workspaceId,
        metadata: scenario.context.metadata,
        processInstanceId: `pi-${slug(scenario.name)}`,
      });
    } catch (e) {
      failures.push(`Agent threw: ${e instanceof Error ? e.message : String(e)}`);
      return finish();
    }

    const observed: Partial<ScenarioRunResult> = {
      success: result.agentResult.success,
      qualificationStatus: result.agentResult.qualification?.status,
      complianceScore: result.agentResult.compliance?.score,
      confidence: result.agentResult.confidence,
      llmCalls: result.mockLLMCallLog.length,
      traceEvents: result.traceChain.length,
    };

    // 6. Assert. Collect every failure rather than stopping at the first.
    const a = scenario.assertions;
    const expectSuccess =
      a.success ?? !(a.qualificationStatus && BLOCKING_STATUSES.has(a.qualificationStatus));
    const check = (label: string, fn: () => void) => {
      try {
        fn();
      } catch (e) {
        failures.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    check('success', () => (expectSuccess ? this.harness.assertSuccess(result) : this.harness.assertFailed(result, a.errorMatches)));
    if (a.qualificationStatus) check('qualificationStatus', () => this.harness.assertQualificationStatus(result, a.qualificationStatus!));
    if (a.traceChainValid) check('traceChainValid', () => this.harness.assertTraceChainValid(result));
    if (a.obligationsCovered) check('obligationsCovered', () => this.harness.assertObligationsCovered(result, a.obligationsCovered!));
    if (a.noComplianceGaps) check('noComplianceGaps', () => this.harness.assertNoComplianceGaps(result));
    if (typeof a.complianceScoreAbove === 'number') {
      check('complianceScoreAbove', () => this.harness.assertComplianceScoreAbove(result, a.complianceScoreAbove!));
    }
    if (typeof a.confidenceAbove === 'number') check('confidenceAbove', () => this.harness.assertConfidenceAbove(result, a.confidenceAbove!));
    if (typeof a.llmCalls === 'number') check('llmCalls', () => this.harness.assertLLMCallCount(a.llmCalls!));
    for (const ev of a.hasEvents ?? []) check(`hasEvents(${ev})`, () => this.harness.assertHasEvent(result, ev));
    for (const ev of a.noEvents ?? []) check(`noEvents(${ev})`, () => this.harness.assertNoEvent(result, ev));
    if (a.output) check('output', () => this.harness.assertOutputMatches(result, a.output!));
    if (a.errorMatches && expectSuccess) failures.push('errorMatches: only meaningful together with `success: false`');

    return finish(observed);
  }

  private resolveObligation(id: string, scenario: Scenario, defaults: ScenarioFile['defaults']): ObligationNode | undefined {
    const fromCatalog = this.options.catalog?.get(id);
    if (fromCatalog) return fromCatalog;
    if (this.options.catalog) return undefined;
    // No catalog: synthesise a placeholder so simple runners still work.
    return {
      obligationId: id,
      jurisdiction: scenario.context.jurisdiction ?? defaults.jurisdiction ?? 'GLOBAL',
      artifactType: 'GENERIC',
      processType: scenario.context.processType ?? defaults.processType ?? 'GENERIC',
      kind: 'obligation',
      title: id,
      text: `Synthetic harness obligation ${id}`,
      sourceCitation: `harness:${id}`,
      version: '0.0.0',
      mandatory: true,
      requiredEvidenceTypes: [],
      applicability: {},
      metadata: { synthetic: true },
    };
  }
}

export function summarizeSuites(suites: ScenarioSuiteResult[]): HarnessSummary {
  const total = suites.reduce((n, s) => n + s.total, 0);
  const passed = suites.reduce((n, s) => n + s.passed, 0);
  return {
    suites: suites.length,
    total,
    passed,
    failed: total - passed,
    durationMs: suites.reduce((n, s) => n + s.durationMs, 0),
    ok: total === passed,
  };
}

/** Plain-text report in the spirit of a test runner's output. */
export function formatHarnessReport(suites: ScenarioSuiteResult[]): string {
  const lines: string[] = [];
  for (const suite of suites) {
    lines.push(`${suite.failed === 0 ? '✓' : '✗'} ${suite.name} (${suite.passed}/${suite.total}, ${suite.durationMs.toFixed(0)}ms)`);
    for (const r of suite.results) {
      const status = r.ok ? '  ✓' : '  ✗';
      const meta = [r.qualificationStatus, r.complianceScore !== undefined ? `score ${r.complianceScore.toFixed(2)}` : null]
        .filter(Boolean)
        .join(', ');
      lines.push(`${status} ${r.name} [${r.agent}]${meta ? ` — ${meta}` : ''}`);
      for (const f of r.failures) lines.push(`      ${f}`);
    }
  }
  const s = summarizeSuites(suites);
  lines.push('');
  lines.push(`${s.passed}/${s.total} scenarios passed across ${s.suites} suite${s.suites === 1 ? '' : 's'} in ${s.durationMs.toFixed(0)}ms`);
  return lines.join('\n');
}

function slug(value: string): string {
  // Bound the input first, then collapse non-alphanumerics to single dashes.
  // After collapsing there is at most one leading and one trailing dash, so a
  // single-character trim is enough (and stays linear for CodeQL's ReDoS check).
  let out = value.slice(0, 96).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (out.startsWith('-')) out = out.slice(1);
  if (out.endsWith('-')) out = out.slice(0, -1);
  return out.slice(0, 48) || 'scenario';
}
