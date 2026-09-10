/**
 * Pure helpers for the Agent Harness page. Kept free of React so the report
 * shaping (grouping, filtering, formatting) is unit-testable.
 */

export type QualificationStatus =
  | 'QUALIFIED'
  | 'QUALIFIED_WITH_WARNINGS'
  | 'NEEDS_HUMAN_REVIEW'
  | 'BLOCKED'
  | 'OUT_OF_SCOPE';

export interface HarnessSuiteInfo {
  id: string;
  name: string;
  description?: string;
  process: string;
  processId?: string;
  processName?: string;
  scenarioCount: number;
  agents: string[];
  error?: string;
}

export interface ScenarioResult {
  name: string;
  agent: string;
  ok: boolean;
  error?: string;
  failures: string[];
  durationMs: number;
  llmCalls: number;
  success?: boolean;
  qualificationStatus?: QualificationStatus;
  complianceScore?: number;
  confidence?: number;
  traceEvents: number;
  obligationsSeeded: string[];
}

export interface SuiteResult {
  id: string;
  process: string;
  name: string;
  file?: string;
  results: ScenarioResult[];
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
}

export interface HarnessSummary {
  suites: number;
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  ok: boolean;
}

export interface HarnessRun {
  runId: string;
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  summary: HarnessSummary;
  suites: SuiteResult[];
  catalog: { obligations: number; files: number; errors: number; dir: string | null };
}

export type ResultFilter = 'all' | 'failed' | 'passed' | 'blocked';

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export function formatScore(score: number | undefined): string {
  if (score === undefined || Number.isNaN(score)) return '—';
  return `${Math.round(score * 100)}%`;
}

/** Plain-language label for a qualification status. */
export function qualificationLabel(status: QualificationStatus | undefined): string {
  switch (status) {
    case 'QUALIFIED':
      return 'Qualified';
    case 'QUALIFIED_WITH_WARNINGS':
      return 'Qualified with warnings';
    case 'NEEDS_HUMAN_REVIEW':
      return 'Needs human review';
    case 'BLOCKED':
      return 'Blocked';
    case 'OUT_OF_SCOPE':
      return 'Out of scope';
    default:
      return 'Not evaluated';
  }
}

/** Whether the scenario deliberately exercised a gate refusal. */
export function isGateScenario(result: ScenarioResult): boolean {
  return result.qualificationStatus === 'BLOCKED' || result.qualificationStatus === 'OUT_OF_SCOPE' || result.qualificationStatus === 'NEEDS_HUMAN_REVIEW';
}

export function filterResults(results: ScenarioResult[], filter: ResultFilter): ScenarioResult[] {
  switch (filter) {
    case 'failed':
      return results.filter((r) => !r.ok);
    case 'passed':
      return results.filter((r) => r.ok);
    case 'blocked':
      return results.filter(isGateScenario);
    default:
      return results;
  }
}

export interface RunHeadline {
  tone: 'ok' | 'warn' | 'err' | 'idle';
  title: string;
  detail: string;
}

/** One-line verdict for the summary banner. */
export function runHeadline(run: HarnessRun | null): RunHeadline {
  if (!run) {
    return { tone: 'idle', title: 'No run yet', detail: 'Run the harness to exercise every agent through its sealed lifecycle.' };
  }
  const { summary } = run;
  if (summary.total === 0) {
    return { tone: 'warn', title: 'Nothing ran', detail: 'No scenarios matched the selected suites.' };
  }
  if (summary.ok) {
    return {
      tone: 'ok',
      title: `All ${summary.total} scenarios passed`,
      detail: `${summary.suites} suite${summary.suites === 1 ? '' : 's'} · ${formatDuration(run.durationMs)} · ${run.catalog.obligations} catalog obligations`,
    };
  }
  return {
    tone: 'err',
    title: `${summary.failed} of ${summary.total} scenarios failed`,
    detail: `${failedSuiteIds(run).length} suite${failedSuiteIds(run).length === 1 ? '' : 's'} affected · ${formatDuration(run.durationMs)}`,
  };
}

export function failedSuiteIds(run: HarnessRun): string[] {
  return run.suites.filter((s) => s.failed > 0).map((s) => s.id);
}

export interface AgentRollup {
  agent: string;
  total: number;
  passed: number;
  failed: number;
  suites: string[];
}

/** Per-agent pass/fail roll-up across every suite in the run. */
export function rollupByAgent(run: HarnessRun): AgentRollup[] {
  const map = new Map<string, AgentRollup>();
  for (const suite of run.suites) {
    for (const r of suite.results) {
      const entry = map.get(r.agent) ?? { agent: r.agent, total: 0, passed: 0, failed: 0, suites: [] };
      entry.total += 1;
      if (r.ok) entry.passed += 1;
      else entry.failed += 1;
      if (!entry.suites.includes(suite.id)) entry.suites.push(suite.id);
      map.set(r.agent, entry);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.failed - a.failed || a.agent.localeCompare(b.agent));
}

/** Split a runner failure line ("label: message") into its parts for display. */
export function splitFailure(line: string): { label: string; message: string } {
  const idx = line.indexOf(': ');
  if (idx === -1) return { label: 'error', message: line };
  return { label: line.slice(0, idx), message: line.slice(idx + 2) };
}

/** Group suites by process folder, preserving the server's order. */
export function groupSuitesByProcess<T extends { process: string }>(suites: T[]): { process: string; suites: T[] }[] {
  const groups: { process: string; suites: T[] }[] = [];
  for (const s of suites) {
    const g = groups.find((x) => x.process === s.process);
    if (g) g.suites.push(s);
    else groups.push({ process: s.process, suites: [s] });
  }
  return groups;
}

/** Human title from a process folder name: `change-control` -> `Change control`. */
export function processTitle(folder: string, processName?: string): string {
  if (processName) return processName;
  const words = folder.split(/[-_]/).filter(Boolean);
  if (!words.length) return folder;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}
