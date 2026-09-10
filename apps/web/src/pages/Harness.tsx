/**
 * Agent Harness - run every shipped agent through its sealed lifecycle
 * (qualification gate -> execute -> strict gate -> compliance -> trace) against
 * the regulation catalog, without touching Neo4j, Postgres or a model provider.
 *
 * Layout
 *   Header  : verdict banner + "Run all" action
 *   Left    : suites grouped by process, each runnable on its own
 *   Right   : scenario results for the selected suite, filterable, with the
 *             exact failed assertion under each red row
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthenticatedApi } from '../auth/useApi.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/EmptyState.js';
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
  type HarnessSuiteInfo,
  type ResultFilter,
  type ScenarioResult,
  type SuiteResult,
} from '../lib/harnessReport.js';

type SuiteListResponse = {
  suites: HarnessSuiteInfo[];
  totals: { suites: number; scenarios: number; agents: number };
};

type RecentRun = {
  runId: string;
  startedAtIso: string;
  durationMs: number;
  summary: HarnessRun['summary'];
  requestedSuiteIds: string[] | null;
};

const FILTERS: { key: ResultFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'failed', label: 'Failed' },
  { key: 'passed', label: 'Passed' },
  { key: 'blocked', label: 'Gate refusals' },
];

export function Harness() {
  const { api } = useAuthenticatedApi();

  const [suites, setSuites] = useState<HarnessSuiteInfo[] | null>(null);
  const [totals, setTotals] = useState<SuiteListResponse['totals'] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [run, setRun] = useState<HarnessRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState<'all' | string | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);

  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadSuites = useCallback(async () => {
    try {
      const body = await api<SuiteListResponse>('/api/sandbox/harness/suites');
      setSuites(body.suites);
      setTotals(body.totals);
      setLoadError(null);
      setSelectedSuiteId((cur) => cur ?? body.suites[0]?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load harness suites.');
      setSuites([]);
    }
  }, [api]);

  const loadRecent = useCallback(async () => {
    try {
      const body = await api<{ runs: RecentRun[] }>('/api/sandbox/harness/runs/recent?limit=8');
      setRecent(body.runs);
    } catch {
      setRecent([]);
    }
  }, [api]);

  useEffect(() => {
    void loadSuites();
    void loadRecent();
  }, [loadSuites, loadRecent]);

  const execute = useCallback(
    async (suiteIds: string[] | null) => {
      setRunning(suiteIds ? suiteIds[0] ?? 'all' : 'all');
      setRunError(null);
      try {
        const body = await api<HarnessRun>('/api/sandbox/harness/run', {
          method: 'POST',
          body: JSON.stringify(suiteIds ? { suites: suiteIds } : {}),
        });
        setRun(body);
        setFilter(body.summary.failed > 0 ? 'failed' : 'all');
        const firstFailed = failedSuiteIds(body)[0];
        setSelectedSuiteId(firstFailed ?? suiteIds?.[0] ?? body.suites[0]?.id ?? null);
        setExpanded(null);
        void loadRecent();
      } catch (err) {
        setRunError(err instanceof Error ? err.message : 'Harness run failed.');
      } finally {
        setRunning(null);
      }
    },
    [api, loadRecent],
  );

  const grouped = useMemo(() => groupSuitesByProcess(suites ?? []), [suites]);
  const resultBySuite = useMemo(() => {
    const map = new Map<string, SuiteResult>();
    for (const s of run?.suites ?? []) map.set(s.id, s);
    return map;
  }, [run]);
  const selectedInfo = suites?.find((s) => s.id === selectedSuiteId) ?? null;
  const selectedResult = selectedSuiteId ? resultBySuite.get(selectedSuiteId) ?? null : null;
  const visibleResults = useMemo(
    () => (selectedResult ? filterResults(selectedResult.results, filter) : []),
    [selectedResult, filter],
  );
  const headline = runHeadline(run);
  const agentRollup = useMemo(() => (run ? rollupByAgent(run) : []), [run]);

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="Agent Harness"
        title="Prove every agent refuses, cites, and traces before it ships."
        subtitle="Each scenario runs a real agent through the sealed lifecycle against obligations seeded from the regulation catalog. No graph database, no model calls - deterministic and repeatable."
        actions={
          <button
            className="btn"
            onClick={() => void execute(null)}
            disabled={running !== null || !suites?.length}
            style={{ fontSize: 13 }}
          >
            {running === 'all' ? 'Running…' : 'Run all suites'}
          </button>
        }
        meta={
          totals ? (
            <div className="eyebrow" style={{ display: 'flex', gap: 18 }}>
              <span>{totals.suites} suites</span>
              <span>{totals.scenarios} scenarios</span>
              <span>{totals.agents} agents</span>
            </div>
          ) : undefined
        }
      />

      <div style={{ padding: '20px 32px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <VerdictBanner tone={headline.tone} title={headline.title} detail={headline.detail} error={runError} />

        {loadError && (
          <div className="ground-card" style={{ borderColor: 'var(--err-edge)', color: 'var(--err-ink)', fontSize: 13 }}>
            {loadError}
          </div>
        )}

        {suites && suites.length === 0 && !loadError && (
          <EmptyState
            eyebrow="No suites"
            title="No scenario suites were found."
            body="Add harness/<process>-scenarios.yaml to a process folder under packages/sandbox/src/processes and rebuild."
          />
        )}

        {suites && suites.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)',
              gap: 18,
              alignItems: 'start',
            }}
          >
            {/* ── Left: suites ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {grouped.map((group) => (
                <section key={group.process}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>
                    {processTitle(group.process, group.suites[0]?.processName)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.suites.map((suite) => (
                      <SuiteCard
                        key={suite.id}
                        suite={suite}
                        result={resultBySuite.get(suite.id) ?? null}
                        active={suite.id === selectedSuiteId}
                        running={running === suite.id}
                        disabled={running !== null}
                        onSelect={() => {
                          setSelectedSuiteId(suite.id);
                          setExpanded(null);
                        }}
                        onRun={() => void execute([suite.id])}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {recent.length > 0 && (
                <section>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Recent runs</div>
                  <div className="ground-card" style={{ padding: 0 }}>
                    {recent.map((r, i) => (
                      <div
                        key={r.runId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '8px 12px',
                          fontSize: 12,
                          borderTop: i === 0 ? 'none' : '1px solid var(--rule)',
                          color: 'var(--ink-2)',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <span className={r.summary.ok ? 'dot-ok' : 'dot-err'} />
                          {r.summary.passed}/{r.summary.total}
                          <span style={{ color: 'var(--ink-3)' }}>
                            {r.requestedSuiteIds ? r.requestedSuiteIds.map((id) => id.split('/')[0]).join(', ') : 'all suites'}
                          </span>
                        </span>
                        <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(r.startedAtIso).toLocaleTimeString()} · {formatDuration(r.durationMs)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* ── Right: scenario results ──────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {selectedInfo && (
                <div className="ground-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div className="eyebrow">{selectedInfo.id}</div>
                      <h2 className="serif" style={{ margin: '4px 0 6px', fontSize: 20 }}>{selectedInfo.name}</h2>
                      {selectedInfo.description && (
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', maxWidth: 640 }}>{selectedInfo.description}</p>
                      )}
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 12, color: 'var(--ink-3)', flexShrink: 0 }}>
                      <div>{selectedInfo.scenarioCount} scenarios</div>
                      <div>{selectedInfo.agents.join(' · ')}</div>
                    </div>
                  </div>
                  {selectedInfo.error && (
                    <pre className="mono" style={{ marginTop: 12, fontSize: 12, color: 'var(--err-ink)', whiteSpace: 'pre-wrap' }}>
                      {selectedInfo.error}
                    </pre>
                  )}
                </div>
              )}

              {!selectedResult && selectedInfo && !selectedInfo.error && (
                <EmptyState
                  eyebrow="Not run yet"
                  title="This suite has no results in the current run."
                  body="Run it on its own or run every suite to see each scenario's verdict, qualification status and compliance score."
                  primaryAction={{ label: running ? 'Running…' : 'Run this suite', onClick: () => void execute([selectedInfo.id]) }}
                />
              )}

              {selectedResult && (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {FILTERS.map((f) => {
                      const count = filterResults(selectedResult.results, f.key).length;
                      const active = filter === f.key;
                      return (
                        <button
                          key={f.key}
                          className="btn btn-ghost"
                          onClick={() => setFilter(f.key)}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderColor: active ? 'var(--ink)' : undefined,
                            color: active ? 'var(--ink)' : undefined,
                          }}
                        >
                          {f.label} <span style={{ color: 'var(--ink-3)' }}>{count}</span>
                        </button>
                      );
                    })}
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
                      {selectedResult.passed}/{selectedResult.total} passed · {formatDuration(selectedResult.durationMs)}
                    </span>
                  </div>

                  {visibleResults.length === 0 ? (
                    <div className="ground-card" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                      No scenarios match this filter.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {visibleResults.map((r) => (
                        <ScenarioRow
                          key={r.name}
                          result={r}
                          open={expanded === r.name}
                          onToggle={() => setExpanded((cur) => (cur === r.name ? null : r.name))}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {run && agentRollup.length > 0 && (
                <section>
                  <div className="eyebrow" style={{ margin: '6px 0 8px' }}>Agents in this run</div>
                  <div className="ground-card" style={{ padding: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr style={{ color: 'var(--ink-3)', textAlign: 'left' }}>
                          <th style={th}>Agent</th>
                          <th style={th}>Scenarios</th>
                          <th style={th}>Passed</th>
                          <th style={th}>Failed</th>
                          <th style={th}>Suites</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentRollup.map((a) => (
                          <tr key={a.agent} style={{ borderTop: '1px solid var(--rule)' }}>
                            <td style={td}>
                              <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
                                <span className={a.failed ? 'dot-err' : 'dot-ok'} />
                                <span className="mono">{a.agent}</span>
                              </span>
                            </td>
                            <td style={td}>{a.total}</td>
                            <td style={td}>{a.passed}</td>
                            <td style={{ ...td, color: a.failed ? 'var(--err-ink)' : undefined }}>{a.failed}</td>
                            <td style={{ ...td, color: 'var(--ink-3)' }}>{a.suites.map((s) => s.split('/')[0]).join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' };
const td: React.CSSProperties = { padding: '8px 12px', fontVariantNumeric: 'tabular-nums' };

/* ── Pieces ─────────────────────────────────────────────────────────── */

function VerdictBanner({ tone, title, detail, error }: { tone: 'ok' | 'warn' | 'err' | 'idle'; title: string; detail: string; error: string | null }) {
  const palette: Record<typeof tone, { bg: string; edge: string; ink: string; dot: string }> = {
    ok: { bg: 'var(--ok-soft)', edge: 'var(--ok)', ink: 'var(--ok-ink)', dot: 'dot-ok' },
    warn: { bg: 'var(--warn-soft)', edge: 'var(--warn)', ink: 'var(--warn-ink)', dot: 'dot-warn' },
    err: { bg: 'var(--err-soft)', edge: 'var(--err-edge)', ink: 'var(--err-ink)', dot: 'dot-err' },
    idle: { bg: 'var(--surface)', edge: 'var(--rule)', ink: 'var(--ink-2)', dot: 'dot-idle' },
  };
  const p = palette[error ? 'err' : tone];
  return (
    <div
      className="rise-1"
      style={{
        background: p.bg,
        border: `1px solid ${p.edge}`,
        borderLeft: `3px solid ${p.edge}`,
        borderRadius: 'var(--radius)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        color: p.ink,
      }}
    >
      <span className={p.dot} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <strong style={{ fontSize: 14 }}>{error ? 'Harness run failed' : title}</strong>
        <span style={{ fontSize: 12.5, opacity: 0.9 }}>{error ?? detail}</span>
      </div>
    </div>
  );
}

function SuiteCard({
  suite,
  result,
  active,
  running,
  disabled,
  onSelect,
  onRun,
}: {
  suite: HarnessSuiteInfo;
  result: SuiteResult | null;
  active: boolean;
  running: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRun: () => void;
}) {
  const dot = suite.error ? 'dot-err' : !result ? 'dot-idle' : result.failed ? 'dot-err' : 'dot-ok';
  return (
    <div
      className={`ground-card${active ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
      style={{ cursor: 'pointer', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 500, color: 'var(--ink)' }}>
          <span className={dot} />
          {suite.name}
        </span>
        <button
          className="btn btn-ghost"
          onClick={(e) => {
            e.stopPropagation();
            onRun();
          }}
          disabled={disabled || Boolean(suite.error)}
          style={{ fontSize: 11, padding: '3px 8px' }}
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)' }}>
        <span>{suite.scenarioCount} scenarios · {suite.agents.length} agent{suite.agents.length === 1 ? '' : 's'}</span>
        {result && (
          <span style={{ color: result.failed ? 'var(--err-ink)' : 'var(--ok-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {result.passed}/{result.total} · {formatDuration(result.durationMs)}
          </span>
        )}
      </div>
    </div>
  );
}

function ScenarioRow({ result, open, onToggle }: { result: ScenarioResult; open: boolean; onToggle: () => void }) {
  const gate = isGateScenario(result);
  return (
    <div
      className="ground-card"
      style={{
        padding: '10px 14px',
        borderLeft: `3px solid ${result.ok ? 'var(--ok)' : 'var(--err-edge)'}`,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: 12,
          alignItems: 'center',
        }}
        aria-expanded={open}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, color: 'var(--ink)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <span className={result.ok ? 'dot-ok' : 'dot-err'} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.name}</span>
          </span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{result.agent}</span>
        </span>
        <span style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          <span title="Qualification gate" style={{ color: gate ? 'var(--warn-ink)' : undefined }}>
            {qualificationLabel(result.qualificationStatus)}
          </span>
          <span title="Compliance score">{formatScore(result.complianceScore)}</span>
          <span title="Trace events">{result.traceEvents} ev</span>
          <span title="Mock LLM calls">{result.llmCalls} llm</span>
          <span>{formatDuration(result.durationMs)}</span>
        </span>
      </button>

      {!result.ok && result.failures.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {result.failures.map((line) => {
            const { label, message } = splitFailure(line);
            return (
              <li key={line} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                <span className="mono" style={{ color: 'var(--err-ink)', flexShrink: 0 }}>{label}</span>
                <span style={{ color: 'var(--ink-2)', wordBreak: 'break-word' }}>{message}</span>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <dl
          style={{
            margin: '10px 0 0',
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: '4px 14px',
            fontSize: 12,
            color: 'var(--ink-2)',
          }}
        >
          <dt style={{ color: 'var(--ink-3)' }}>Lifecycle</dt>
          <dd style={{ margin: 0 }}>{result.success === undefined ? 'did not start' : result.success ? 'completed' : `refused (${qualificationLabel(result.qualificationStatus)})`}</dd>
          <dt style={{ color: 'var(--ink-3)' }}>Confidence</dt>
          <dd style={{ margin: 0 }}>{formatScore(result.confidence)}</dd>
          <dt style={{ color: 'var(--ink-3)' }}>Obligations seeded</dt>
          <dd style={{ margin: 0 }} className="mono">
            {result.obligationsSeeded.length ? result.obligationsSeeded.join(', ') : 'none (out-of-scope check)'}
          </dd>
        </dl>
      )}
    </div>
  );
}

export default Harness;
