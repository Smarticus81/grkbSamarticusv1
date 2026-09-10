/**
 * Runs every process's `harness/*.yaml` scenario suite through the shared
 * sandbox harness runner (`pnpm test:harness`). A failing scenario prints the
 * full runner report so the offending assertion is visible in CI output.
 */
import { describe, it, expect } from 'vitest';
import { formatHarnessReport } from '@regground/core';
import { ProcessRegistry } from './ProcessRegistry.js';
import { registerAllProcesses } from './registerAll.js';
import { listHarnessSuites, resolveRegulationsDir, runHarnessSuites } from './harnessSuites.js';

describe('sandbox scenario harness', () => {
  it('finds a scenario suite for every registered process', () => {
    const suites = listHarnessSuites();
    const processes = registerAllProcesses(new ProcessRegistry()).list();
    const coveredProcessIds = new Set(suites.map((s) => s.processId));
    const uncovered = processes.filter((p) => !coveredProcessIds.has(p.id)).map((p) => p.id);
    expect(uncovered, `processes without a harness suite: ${uncovered.join(', ')}`).toEqual([]);
    for (const suite of suites) {
      expect(suite.error, `${suite.id}: ${suite.error}`).toBeUndefined();
      expect(suite.scenarioCount).toBeGreaterThanOrEqual(4);
    }
  });

  it('loads the regulation catalog', () => {
    expect(resolveRegulationsDir()).toBeTruthy();
  });

  it('passes every scenario in every suite', async () => {
    const report = await runHarnessSuites();
    expect(report.catalog.obligations).toBeGreaterThan(100);
    expect(report.summary.suites).toBe(listHarnessSuites().length);
    const text = formatHarnessReport(report.suites);
    expect(report.summary.failed, `\n${text}`).toBe(0);
    expect(report.summary.total).toBeGreaterThanOrEqual(50);
  });

  it('runs an individual suite by id and isolates scenarios', async () => {
    const report = await runHarnessSuites({ suiteIds: ['capa/capa-scenarios'] });
    expect(report.suites).toHaveLength(1);
    const suite = report.suites[0]!;
    expect(suite.id).toBe('capa/capa-scenarios');
    const blocked = suite.results.find((r) => r.name.includes('blocked without trigger evidence'));
    expect(blocked?.qualificationStatus).toBe('BLOCKED');
    expect(blocked?.success).toBe(false);
    const happy = suite.results.find((r) => r.name.includes('high severity'));
    expect(happy?.qualificationStatus).toBe('QUALIFIED');
    expect(happy?.complianceScore).toBe(1);
    expect(happy?.obligationsSeeded).toEqual(['ISO13485.8.5.2.OBL.001', 'CFR820.100.OBL.001']);
  });

  it('reports unknown suite ids as an empty run', async () => {
    const report = await runHarnessSuites({ suiteIds: ['nope/none'] });
    expect(report.suites).toEqual([]);
    expect(report.summary.ok).toBe(true);
    expect(report.summary.total).toBe(0);
  });
});
