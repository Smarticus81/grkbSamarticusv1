import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuthenticatedApi } from '../auth/useApi.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import {
  summarizePsurWorkspace,
  psurWorkspaceScopeKey,
  psurWorkspaceBuilderPath,
  statusBadge,
  verificationBadge,
  type PsurArtifact,
  type PsurRunSummary,
  type TraceVerification,
  type VerificationState,
} from '../lib/psurWorkspace.js';

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function PsurBuilder() {
  const { api, blob, orgId, userId } = useAuthenticatedApi();
  const [, navigate] = useLocation();
  const [runs, setRuns] = useState<PsurRunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [verifications, setVerifications] = useState<Record<string, VerificationState>>({});

  const workspaceScopeKey = psurWorkspaceScopeKey({ orgId, userId });

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const body = await api<{ runs?: PsurRunSummary[] }>('/api/psur/runs');
      setRuns(body.runs ?? []);
    } catch (e) {
      setRuns([]);
      setError(e instanceof Error ? e.message : 'Could not load PSUR runs.');
    }
  }, [api]);

  useEffect(() => {
    setRuns(null);
    setVerifications({});
    setBusy(null);
    void refresh();
  }, [refresh, workspaceScopeKey]);

  useEffect(() => {
    if (!runs) return;
    const missing = runs.filter((run) => run.status === 'completed' && verifications[run.runId] === undefined);
    if (missing.length === 0) return;

    let cancelled = false;
    setVerifications((prev) => ({
      ...prev,
      ...Object.fromEntries(missing.map((run) => [run.runId, 'loading' as const])),
    }));

    void Promise.all(
      missing.map(async (run): Promise<[string, VerificationState]> => {
        try {
          const body = await api<{ verification?: TraceVerification }>(
            `/api/psur/runs/${encodeURIComponent(run.runId)}/verification`,
          );
          return [run.runId, body.verification ?? 'unavailable'];
        } catch {
          return [run.runId, 'unavailable'];
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setVerifications((prev) => ({ ...prev, ...Object.fromEntries(results) }));
    });

    return () => {
      cancelled = true;
    };
  }, [api, runs, verifications]);

  function saveBlob(file: Blob, filename: string): void {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadArtifact(run: PsurRunSummary, artifact: PsurArtifact) {
    const key = `${run.runId}:${artifact.name}`;
    setBusy(key);
    setError(null);
    try {
      const response = await blob(
        `/api/psur/runs/${encodeURIComponent(run.runId)}/artifacts/${encodeURIComponent(artifact.name)}`,
      );
      saveBlob(response.blob, response.filename ?? artifact.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download artifact.');
    } finally {
      setBusy(null);
    }
  }

  async function downloadAuditPack(run: PsurRunSummary) {
    const key = `${run.runId}:audit-pack`;
    setBusy(key);
    setError(null);
    try {
      const response = await blob(
        `/api/traces/${encodeURIComponent(run.processInstanceId)}/audit-pack?format=markdown&download=1`,
      );
      saveBlob(response.blob, response.filename ?? `audit-pack-${run.processInstanceId}.md`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export audit pack.');
    } finally {
      setBusy(null);
    }
  }

  function openRun(run: PsurRunSummary): void {
    navigate(psurWorkspaceBuilderPath(run.runId));
  }

  const summary = summarizePsurWorkspace(runs ?? []);

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="PSUR Builder"
        title="Generate post-market reports."
        subtitle="Runs, outputs, validation status, and audit trail for each report."
        actions={
          <button className="btn btn-orange" onClick={() => navigate(psurWorkspaceBuilderPath())} style={{ fontSize: 13 }}>
            Open builder
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        }
        meta={<div style={{ color: 'var(--ink-3)', fontSize: 13 }}>{runs ? `${runs.length} run${runs.length === 1 ? '' : 's'}` : 'Loading'}</div>}
      />

      <div style={{ padding: '28px 40px 80px', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <SummaryCard
            label="Runs"
            value={runs ? `${summary.completedRuns}/${summary.totalRuns}` : 'Loading'}
            body={`${summary.runningRuns} running, ${summary.failedRuns} failed. This list is workspace-restricted.`}
          />
          <SummaryCard
            label="Outputs"
            value={runs ? `${summary.artifactCount}` : 'Loading'}
            body={summary.latestCompletedRun
              ? `Latest completed report: ${summary.latestCompletedRun.deviceName ?? summary.latestCompletedRun.runId}.`
              : 'Completed runs keep drafts, audit trail JSON, and validation outputs.'}
          />
          <SummaryCard
            label="Validation"
            value={runs ? `${summary.validatedRuns} verified` : 'Loading'}
            body={`${summary.needsReviewRuns} completed run${summary.needsReviewRuns === 1 ? '' : 's'} need review. Audit trails are workspace-restricted and tamper-evident.`}
          />
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              marginBottom: 18,
              border: '1px solid var(--err-edge)',
              background: 'var(--err-soft)',
              borderRadius: 'var(--r-2)',
              color: 'var(--err)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {runs === null && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading PSUR workspace...</div>}

        {runs !== null && runs.length === 0 && (
          <EmptyState
            eyebrow="No PSUR runs yet"
            title="Start with the builder."
            body="Run the default data pack, edit inputs, then reopen outputs and audit trails."
            primaryAction={{ label: 'Open PSUR Builder', href: psurWorkspaceBuilderPath() }}
          />
        )}

        {runs !== null && runs.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {runs.map((run) => {
              const badge = statusBadge(run);
              const traceBadge = run.status === 'completed' ? verificationBadge(verifications[run.runId]) : null;
              return (
                <div
                  key={run.runId}
                  style={{
                    display: 'grid',
                    width: '100%',
                    textAlign: 'left',
                    padding: '15px 16px',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--r-3)',
                    background: 'var(--surface)',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16, alignItems: 'start' }}>
                    <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
                        {run.deviceName ?? 'PSUR run'} {run.reportType ? `(${run.reportType})` : ''}
                      </div>
                      <span className={badge.className}>{badge.label}</span>
                      {traceBadge && (
                        <span className={traceBadge.className} title={traceBadge.title}>
                          {traceBadge.label}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 13, color: 'var(--ink-3)' }}>
                      {run.periodStart} to {run.periodEnd} | {relTime(run.createdAt)} | {run.artifacts.length} output{run.artifacts.length === 1 ? '' : 's'}
                    </div>
                    <div style={{ marginTop: 4, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)' }}>
                      {run.runId} | audit trail {run.processInstanceId}
                    </div>
                  </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => navigate(`/app/trails/${run.processInstanceId}`)}
                        style={{ fontSize: 12, padding: '7px 11px' }}
                      >
                        Audit trail
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={run.status !== 'completed'}
                        onClick={() => openRun(run)}
                        style={{ fontSize: 12, padding: '7px 11px' }}
                      >
                        Open report
                      </button>
                      <button
                        className="btn btn-ghost"
                        disabled={run.status === 'running' || busy === `${run.runId}:audit-pack`}
                        onClick={() => void downloadAuditPack(run)}
                        style={{ fontSize: 12, padding: '7px 11px' }}
                      >
                        {busy === `${run.runId}:audit-pack` ? 'Exporting...' : 'Audit pack'}
                      </button>
                      <button
                        className="btn btn-orange"
                        onClick={() => navigate(psurWorkspaceBuilderPath())}
                        style={{ fontSize: 12, padding: '7px 11px' }}
                      >
                        New run
                      </button>
                    </div>
                  </div>

                  {run.artifacts.length > 0 && (
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--rule)' }}>
                      {run.artifacts.map((artifact) => (
                        <button
                          key={artifact.name}
                          className="btn btn-ghost"
                          disabled={busy === `${run.runId}:${artifact.name}`}
                          onClick={() => void downloadArtifact(run, artifact)}
                          title={`${artifact.content_type} | ${artifact.size_bytes.toLocaleString()} bytes`}
                          style={{ fontSize: 12, padding: '7px 10px' }}
                        >
                          {busy === `${run.runId}:${artifact.name}` ? 'Downloading...' : artifact.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {run.error && (
                    <div style={{ marginTop: 10, color: 'var(--err)', fontSize: 13 }}>
                      {run.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, body }: { label: string; value: string; body: string }) {
  return (
    <div style={{ padding: 18, border: '1px solid var(--rule)', borderRadius: 'var(--r-3)', background: 'var(--surface)' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.035em', color: 'var(--ink)' }}>{value}</div>
      <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.45, color: 'var(--ink-3)' }}>{body}</p>
    </div>
  );
}

export default PsurBuilder;
