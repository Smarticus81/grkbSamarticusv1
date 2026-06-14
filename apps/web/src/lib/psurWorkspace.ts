import { workspaceScopeKey, type WorkspaceAuthScope } from './workspaceScope.js';

export interface PsurArtifact {
  name: string;
  content_type: string;
  size_bytes: number;
}

export interface PsurRunSummary {
  runId: string;
  processInstanceId: string;
  status: 'running' | 'completed' | 'failed';
  deviceName: string | null;
  reportType: string | null;
  periodStart: string;
  periodEnd: string;
  validationPassed: boolean | null;
  errorCount: number | null;
  artifacts: PsurArtifact[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface TraceVerification {
  valid: boolean;
  verifiedEntries: number;
  totalEntries: number;
  brokenAt?: number;
}

export type VerificationState = TraceVerification | 'loading' | 'unavailable';

export interface BadgeModel {
  label: string;
  className: string;
  title?: string;
}

export interface PsurWorkspaceSummary {
  totalRuns: number;
  runningRuns: number;
  completedRuns: number;
  failedRuns: number;
  validatedRuns: number;
  needsReviewRuns: number;
  artifactCount: number;
  latestRun: PsurRunSummary | null;
  latestCompletedRun: PsurRunSummary | null;
}

export const PSUR_PUBLIC_DEMO_PATH = '/demo/psur';
export const PSUR_WORKSPACE_BUILDER_PATH = '/app/psur/build';

export function psurWorkspaceScopeKey(scope: WorkspaceAuthScope): string {
  return workspaceScopeKey(scope);
}

export function psurWorkspaceBuilderPath(runId?: string | null): string {
  if (!runId) return PSUR_WORKSPACE_BUILDER_PATH;
  return `${PSUR_WORKSPACE_BUILDER_PATH}?run=${encodeURIComponent(runId)}`;
}

function createdAtMs(run: PsurRunSummary): number {
  const ms = new Date(run.createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function summarizePsurWorkspace(runs: PsurRunSummary[]): PsurWorkspaceSummary {
  const newestFirst = runs.slice().sort((a, b) => createdAtMs(b) - createdAtMs(a));
  const completed = runs.filter((run) => run.status === 'completed');

  return {
    totalRuns: runs.length,
    runningRuns: runs.filter((run) => run.status === 'running').length,
    completedRuns: completed.length,
    failedRuns: runs.filter((run) => run.status === 'failed').length,
    validatedRuns: completed.filter((run) => run.validationPassed === true).length,
    needsReviewRuns: completed.filter((run) => run.validationPassed !== true).length,
    artifactCount: runs.reduce((sum, run) => sum + run.artifacts.length, 0),
    latestRun: newestFirst[0] ?? null,
    latestCompletedRun: newestFirst.find((run) => run.status === 'completed') ?? null,
  };
}

export function statusBadge(run: PsurRunSummary): BadgeModel {
  if (run.status === 'running') return { label: 'Running', className: 'badge badge-signal' };
  if (run.status === 'failed') return { label: 'Failed', className: 'badge badge-err' };
  if (run.validationPassed) return { label: 'Validated', className: 'badge badge-ok' };
  return { label: 'Needs review', className: 'badge badge-warn' };
}

export function verificationBadge(verification: VerificationState | undefined): BadgeModel {
  if (verification === 'loading' || verification === undefined) {
    return {
      label: 'Trace checking',
      className: 'badge badge-signal',
      title: 'Hash-chain verification is being checked.',
    };
  }
  if (verification === 'unavailable') {
    return {
      label: 'Trace unavailable',
      className: 'badge badge-warn',
      title: 'Trace verification could not be loaded.',
    };
  }
  if (verification.valid) {
    return {
      label: `Trace verified · ${verification.verifiedEntries}`,
      className: 'badge badge-ok',
      title: `${verification.verifiedEntries} of ${verification.totalEntries} trace entries verified.`,
    };
  }
  return {
    label: 'Trace broken',
    className: 'badge badge-err',
    title: verification.brokenAt ? `Hash chain broken at entry ${verification.brokenAt}.` : 'Hash-chain verification failed.',
  };
}
