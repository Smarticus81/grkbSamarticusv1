import { describe, expect, it } from 'vitest';
import {
  failedSuiteIds,
  filterResults,
  formatDuration,
  formatScore,
  groupSuitesByProcess,
  isGateScenario,
  processTitle,
  qualificationLabel,
  rollupByAgent,
  runHeadline,
  splitFailure,
  type HarnessRun,
  type ScenarioResult,
} from './harnessReport.js';

function scenario(over: Partial<ScenarioResult>): ScenarioResult {
  return {
    name: 'scenario',
    agent: 'AgentA',
    ok: true,
    failures: [],
    durationMs: 1,
    llmCalls: 0,
    success: true,
    qualificationStatus: 'QUALIFIED',
    complianceScore: 1,
    confidence: 1,
    traceEvents: 4,
    obligationsSeeded: ['O1'],
    ...over,
  };
}

const run: HarnessRun = {
  runId: 'r1',
  startedAtIso: '2026-09-10T00:00:00.000Z',
  finishedAtIso: '2026-09-10T00:00:00.400Z',
  durationMs: 400,
  summary: { suites: 2, total: 4, passed: 3, failed: 1, durationMs: 400, ok: false },
  catalog: { obligations: 680, files: 20, errors: 0, dir: '/regs' },
  suites: [
    {
      id: 'capa/capa-scenarios',
      process: 'capa',
      name: 'CAPA lifecycle',
      total: 3,
      passed: 2,
      failed: 1,
      durationMs: 300,
      results: [
        scenario({ name: 'happy' }),
        scenario({ name: 'blocked', ok: true, success: false, qualificationStatus: 'BLOCKED', complianceScore: undefined }),
        scenario({ name: 'broken', agent: 'AgentB', ok: false, failures: ['output: Output mismatch: x', 'llmCalls: Expected 1 LLM calls, got 0'], error: 'x' }),
      ],
    },
    {
      id: 'audit/audit-scenarios',
      process: 'audit',
      name: 'Internal audit',
      total: 1,
      passed: 1,
      failed: 0,
      durationMs: 100,
      results: [scenario({ name: 'plan', agent: 'AgentB' })],
    },
  ],
};

describe('harnessReport helpers', () => {
  it('formats durations and scores for humans', () => {
    expect(formatDuration(0.4)).toBe('<1 ms');
    expect(formatDuration(42.6)).toBe('43 ms');
    expect(formatDuration(1500)).toBe('1.5 s');
    expect(formatDuration(12_000)).toBe('12 s');
    expect(formatDuration(-1)).toBe('—');
    expect(formatScore(undefined)).toBe('—');
    expect(formatScore(0.666)).toBe('67%');
  });

  it('labels qualification statuses', () => {
    expect(qualificationLabel('QUALIFIED')).toBe('Qualified');
    expect(qualificationLabel('OUT_OF_SCOPE')).toBe('Out of scope');
    expect(qualificationLabel(undefined)).toBe('Not evaluated');
    expect(isGateScenario(scenario({ qualificationStatus: 'BLOCKED' }))).toBe(true);
    expect(isGateScenario(scenario({}))).toBe(false);
  });

  it('filters results by verdict', () => {
    const all = run.suites[0]!.results;
    expect(filterResults(all, 'all')).toHaveLength(3);
    expect(filterResults(all, 'failed').map((r) => r.name)).toEqual(['broken']);
    expect(filterResults(all, 'passed').map((r) => r.name)).toEqual(['happy', 'blocked']);
    expect(filterResults(all, 'blocked').map((r) => r.name)).toEqual(['blocked']);
  });

  it('produces a headline for each run state', () => {
    expect(runHeadline(null).tone).toBe('idle');
    expect(runHeadline(run)).toMatchObject({ tone: 'err', title: '1 of 4 scenarios failed' });
    expect(runHeadline(run).detail).toContain('1 suite affected');
    const green: HarnessRun = { ...run, summary: { ...run.summary, failed: 0, passed: 4, ok: true } };
    expect(runHeadline(green)).toMatchObject({ tone: 'ok', title: 'All 4 scenarios passed' });
    expect(runHeadline(green).detail).toContain('680 catalog obligations');
    const empty: HarnessRun = { ...run, summary: { ...run.summary, total: 0, passed: 0, failed: 0, ok: true } };
    expect(runHeadline(empty).tone).toBe('warn');
  });

  it('rolls up per agent with failures first', () => {
    expect(failedSuiteIds(run)).toEqual(['capa/capa-scenarios']);
    expect(rollupByAgent(run)).toEqual([
      { agent: 'AgentB', total: 2, passed: 1, failed: 1, suites: ['capa/capa-scenarios', 'audit/audit-scenarios'] },
      { agent: 'AgentA', total: 2, passed: 2, failed: 0, suites: ['capa/capa-scenarios'] },
    ]);
  });

  it('splits failure lines and groups suites', () => {
    expect(splitFailure('output: Output mismatch: x')).toEqual({ label: 'output', message: 'Output mismatch: x' });
    expect(splitFailure('boom')).toEqual({ label: 'error', message: 'boom' });
    expect(groupSuitesByProcess(run.suites).map((g) => g.process)).toEqual(['capa', 'audit']);
    expect(processTitle('change-control')).toBe('Change control');
    expect(processTitle('capa', 'CAPA Process')).toBe('CAPA Process');
  });
});
