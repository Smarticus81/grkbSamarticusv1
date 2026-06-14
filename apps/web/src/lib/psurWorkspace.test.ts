import { describe, expect, it } from 'vitest';
import {
  PSUR_PUBLIC_DEMO_PATH,
  PSUR_WORKSPACE_BUILDER_PATH,
  psurWorkspaceBuilderPath,
  psurWorkspaceScopeKey,
  statusBadge,
  summarizePsurWorkspace,
  verificationBadge,
  type PsurRunSummary,
} from './psurWorkspace.js';

const baseRun: PsurRunSummary = {
  runId: 'run-001',
  processInstanceId: 'psur-demo-001',
  status: 'completed',
  deviceName: 'VitaFlow C200',
  reportType: 'PSUR',
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  validationPassed: true,
  errorCount: 0,
  artifacts: [],
  error: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:10:00.000Z',
};

describe('PSUR workspace badges', () => {
  it('keeps signed-in PSUR builder links under the protected workspace route', () => {
    expect(PSUR_PUBLIC_DEMO_PATH).toBe('/demo/psur');
    expect(PSUR_WORKSPACE_BUILDER_PATH).toBe('/app/psur/build');
    expect(psurWorkspaceBuilderPath()).toBe('/app/psur/build');
    expect(psurWorkspaceBuilderPath('run 1/2')).toBe('/app/psur/build?run=run%201%2F2');
  });

  it('keys workspace state by active organization and user', () => {
    expect(psurWorkspaceScopeKey({ orgId: 'org-a', userId: 'user-1' })).toBe('org-a:user-1');
    expect(psurWorkspaceScopeKey({ orgId: 'org-b', userId: 'user-1' })).toBe('org-b:user-1');
    expect(psurWorkspaceScopeKey({ orgId: null, userId: 'user-1' })).toBe('personal:user-1');
    expect(psurWorkspaceScopeKey({ orgId: null, userId: null })).toBe('personal:anonymous');
  });

  it('summarizes a signed-in PSUR workspace from owned run history', () => {
    const runs: PsurRunSummary[] = [
      {
        ...baseRun,
        runId: 'run-newest-running',
        status: 'running',
        validationPassed: null,
        artifacts: [],
        createdAt: '2026-01-04T00:00:00.000Z',
        finishedAt: null,
      },
      {
        ...baseRun,
        runId: 'run-old-valid',
        artifacts: [
          { name: 'psur.pdf', content_type: 'application/pdf', size_bytes: 12_000 },
          { name: 'trace.json', content_type: 'application/json', size_bytes: 3_000 },
        ],
        createdAt: '2026-01-02T00:00:00.000Z',
      },
      {
        ...baseRun,
        runId: 'run-review',
        validationPassed: false,
        errorCount: 2,
        artifacts: [{ name: 'psur.docx', content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 9_000 }],
        createdAt: '2026-01-03T00:00:00.000Z',
      },
      {
        ...baseRun,
        runId: 'run-failed',
        status: 'failed',
        validationPassed: false,
        artifacts: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(summarizePsurWorkspace(runs)).toMatchObject({
      totalRuns: 4,
      runningRuns: 1,
      completedRuns: 2,
      failedRuns: 1,
      validatedRuns: 1,
      needsReviewRuns: 1,
      artifactCount: 3,
      latestRun: expect.objectContaining({ runId: 'run-newest-running' }),
      latestCompletedRun: expect.objectContaining({ runId: 'run-review' }),
    });
  });

  it('maps run validation status into workspace badges', () => {
    expect(statusBadge({ ...baseRun, status: 'running', validationPassed: null })).toEqual({
      label: 'Running',
      className: 'badge badge-signal',
    });
    expect(statusBadge({ ...baseRun, status: 'failed', validationPassed: false })).toEqual({
      label: 'Failed',
      className: 'badge badge-err',
    });
    expect(statusBadge(baseRun)).toEqual({
      label: 'Validated',
      className: 'badge badge-ok',
    });
    expect(statusBadge({ ...baseRun, validationPassed: false, errorCount: 3 })).toEqual({
      label: 'Needs review',
      className: 'badge badge-warn',
    });
  });

  it('maps trace verification states into auditor-facing badges', () => {
    expect(verificationBadge(undefined)).toMatchObject({
      label: 'Trace checking',
      className: 'badge badge-signal',
    });
    expect(verificationBadge('unavailable')).toMatchObject({
      label: 'Trace unavailable',
      className: 'badge badge-warn',
    });
    expect(verificationBadge({ valid: true, verifiedEntries: 14, totalEntries: 14 })).toEqual({
      label: 'Trace verified · 14',
      className: 'badge badge-ok',
      title: '14 of 14 trace entries verified.',
    });
    expect(verificationBadge({ valid: false, verifiedEntries: 7, totalEntries: 14, brokenAt: 8 })).toEqual({
      label: 'Trace broken',
      className: 'badge badge-err',
      title: 'Hash chain broken at entry 8.',
    });
  });
});
