/**
 * Command Center — live cockpit for the regulatory ground.
 *
 * Four sections, all real data:
 *   1. Regulations on the ground   → GET /api/graph/stats
 *   2. QMS processes you can run   → GET /api/builder/processes (sandbox tasks)
 *   3. Your agents                 → GET /api/builder/agents + /api/sandbox/runs/recent
 *   4. Usage & limits              → GET /api/usage/summary
 */

import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '../lib/queryClient.js';

/* ── Types ─────────────────────────────────────────────────────────── */

type GraphStats = {
  regulations: number;
  obligations: number;
  evidenceTypes: number;
  jurisdictions: Array<{ jurisdiction: string | null; count: number }>;
  processTypes: Array<{ processType: string | null; count: number }>;
};

type TaskCatalogEntry = {
  id: string;
  name: string;
  oneLiner: string;
  regulation: string;
  jurisdiction: string;
  obligationCount: number;
};

type ProcessesPayload = {
  total: number;
  tasks: TaskCatalogEntry[];
  byRegulation: Array<{ regulation: string; count: number; tasks: TaskCatalogEntry[] }>;
};

type SavedAgent = {
  id: string;
  name: string;
  jobTitle: string;
  taskId: string | null;
  riskBand: 'low' | 'medium' | 'high';
  updatedAt: string;
};

type RecentRun = {
  runId: string;
  taskId: string;
  taskName: string;
  mode: string;
  createdAtIso: string;
  withGraph?: { obligationsBound?: number; sealedAt?: string };
  withoutGraph?: { obligationsBound?: number; sealedAt?: string };
};

type UsageSummary = {
  windowDays: number;
  totals: {
    requests30d: number;
    requests7d: number;
    requestsToday: number;
    ok: number;
    errors: number;
    errorRate: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
    tokensIn: number;
    tokensOut: number;
  };
  byTool: Array<{
    toolName: string;
    count: number;
    errors: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
  }>;
  quota: {
    monthlyRequestLimit: number;
    currentMonthRequests: number;
    monthlyTokenLimit: number;
    currentMonthTokens: number;
    periodStart: string;
    utilizationPct: number;
  };
};

/* ── Helpers ───────────────────────────────────────────────────────── */

const PILL: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 8px',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ink-2)',
  border: '1px solid var(--rule-strong)',
  borderRadius: 11,
};

function fmtNumber(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return 'just now';
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/* ── Section shell ─────────────────────────────────────────────────── */

function Section({
  label,
  title,
  action,
  children,
}: {
  label: string;
  title: string;
  action?: { href: string; text: string };
  children: React.ReactNode;
}) {
  const [, navigate] = useLocation();
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '24px 0',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            {label}
          </div>
          <h2
            style={{
              margin: '4px 0 0',
              fontFamily: 'var(--sans)',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: 'var(--ink)',
            }}
          >
            {title}
          </h2>
        </div>
        {action && (
          <button
            onClick={() => navigate(action.href)}
            style={{
              background: 'transparent',
              border: '1px solid var(--rule-strong)',
              borderRadius: 6,
              padding: '6px 12px',
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            {action.text} →
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */

export function CommandCenter() {
  const [, navigate] = useLocation();

  const stats = useQuery<GraphStats>({
    queryKey: ['graph-stats'],
    queryFn: () => api<GraphStats>('/api/graph/stats'),
    refetchInterval: 60_000,
  });

  const processes = useQuery<ProcessesPayload>({
    queryKey: ['builder-processes'],
    queryFn: () => api<ProcessesPayload>('/api/builder/processes'),
    refetchInterval: 60_000,
  });

  const agents = useQuery<SavedAgent[]>({
    queryKey: ['builder-agents'],
    queryFn: () => api<SavedAgent[]>('/api/builder/agents'),
    refetchInterval: 30_000,
  });

  const recent = useQuery<{ runs: RecentRun[] }>({
    queryKey: ['runs-recent'],
    queryFn: () => api<{ runs: RecentRun[] }>('/api/sandbox/runs/recent?limit=8'),
    refetchInterval: 15_000,
  });

  const usage = useQuery<UsageSummary>({
    queryKey: ['usage-summary'],
    queryFn: () => api<UsageSummary>('/api/usage/summary'),
    refetchInterval: 30_000,
  });

  return (
    <div
      style={{
        background: 'var(--paper)',
        minHeight: 'calc(100vh - 64px)',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 32px 80px' }}>
        {/* Page header */}
        <header style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
            }}
          >
            Command center
          </div>
          <h1
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--sans)',
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: 'var(--ink)',
            }}
          >
            Your live regulatory ground.
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-3)', fontSize: 14, maxWidth: 640 }}>
            Everything below is live — pulled straight from the obligation graph,
            the sandbox, and your tenant&apos;s usage telemetry.
          </p>
        </header>

        {/* Section 1 — Regulations on the ground */}
        <Section
          label="01 · The ground"
          title="Regulations covered"
          action={{ href: '/app/regulations', text: 'Browse' }}
        >
          {stats.isLoading && <Skeleton lines={2} />}
          {stats.isError && <ErrorLine err={stats.error} />}
          {stats.data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <Stat n={stats.data.regulations} label="regulations" />
                <Stat n={stats.data.obligations} label="obligations" />
                <Stat n={stats.data.evidenceTypes} label="evidence types" />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {stats.data.jurisdictions.slice(0, 12).map((j) => (
                  <span key={String(j.jurisdiction)} style={PILL}>
                    {j.jurisdiction ?? 'unknown'} · {j.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Section 2 — QMS processes runnable */}
        <Section
          label="02 · Runnable today"
          title="QMS processes you can run"
          action={{ href: '/app/builder', text: 'Configure' }}
        >
          {processes.isLoading && <Skeleton lines={3} />}
          {processes.isError && <ErrorLine err={processes.error} />}
          {processes.data && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 8,
              }}
            >
              {processes.data.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/app/sandbox/${t.id}`)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    background: 'var(--paper)',
                    border: '1px solid var(--rule-strong)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>
                    {t.oneLiner}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={PILL}>{t.regulation}</span>
                    <span style={PILL}>{t.obligationCount} obligations</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Section 3 — Your agents */}
        <Section
          label="03 · Your agents"
          title="Saved & active"
          action={{ href: '/app/builder', text: 'New agent' }}
        >
          {agents.isLoading && <Skeleton lines={2} />}
          {agents.isError && <ErrorLine err={agents.error} />}
          {agents.data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    marginBottom: 6,
                  }}
                >
                  Saved configurations ({agents.data.length})
                </div>
                {agents.data.length === 0 ? (
                  <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                    No agents yet — head to the Builder to assemble one.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {agents.data.slice(0, 8).map((a) => (
                      <button
                        key={a.id}
                        onClick={() =>
                          a.taskId ? navigate(`/app/sandbox/${a.taskId}`) : navigate('/app/builder')
                        }
                        style={{
                          textAlign: 'left',
                          padding: 12,
                          background: 'var(--paper)',
                          border: '1px solid var(--rule-strong)',
                          borderRadius: 8,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{a.jobTitle}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          <span style={PILL}>{a.riskBand}</span>
                          {!a.taskId && <span style={PILL}>no runner</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {recent.data && recent.data.runs.length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-3)',
                      marginBottom: 6,
                    }}
                  >
                    Recent runs
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      border: '1px solid var(--rule)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    {recent.data.runs.slice(0, 6).map((r) => (
                      <button
                        key={r.runId}
                        onClick={() => navigate(`/app/traces/${r.runId}`)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderTop: '1px solid var(--rule)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--sans)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                            {r.taskName}
                          </span>
                          <span
                            style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 10,
                              color: 'var(--ink-3)',
                            }}
                          >
                            {r.runId.slice(0, 12)} · {r.mode}
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
                          {fmtRelative(r.createdAtIso)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Section 4 — Usage & limits */}
        <Section
          label="04 · Telemetry"
          title="Usage & limits"
          action={{ href: '/app/api-access', text: 'API access' }}
        >
          {usage.isLoading && <Skeleton lines={3} />}
          {usage.isError && <ErrorLine err={usage.error} />}
          {usage.data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                <Stat n={usage.data.totals.requestsToday} label="requests today" />
                <Stat n={usage.data.totals.requests7d} label="last 7 days" />
                <Stat n={usage.data.totals.requests30d} label="last 30 days" />
                <Stat n={usage.data.totals.latencyP50Ms} label="p50 ms" />
                <Stat n={usage.data.totals.latencyP95Ms} label="p95 ms" />
                <Stat
                  n={Math.round(usage.data.totals.errorRate * 1000) / 10}
                  label="error rate %"
                />
              </div>

              {/* Quota bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <QuotaBar
                  label="Monthly requests"
                  current={usage.data.quota.currentMonthRequests}
                  limit={usage.data.quota.monthlyRequestLimit}
                />
                <QuotaBar
                  label="Monthly tokens"
                  current={usage.data.quota.currentMonthTokens}
                  limit={usage.data.quota.monthlyTokenLimit}
                />
              </div>

              {/* By-tool */}
              {usage.data.byTool.length > 0 && (
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--ink-3)',
                      marginBottom: 6,
                    }}
                  >
                    Top tools (last 30d)
                  </div>
                  <div
                    style={{
                      border: '1px solid var(--rule)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    {usage.data.byTool.map((t) => (
                      <div
                        key={t.toolName}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 80px 80px 80px',
                          gap: 12,
                          padding: '8px 12px',
                          borderTop: '1px solid var(--rule)',
                          fontFamily: 'var(--mono)',
                          fontSize: 11,
                          color: 'var(--ink-2)',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.toolName}
                        </span>
                        <span>{t.count} runs</span>
                        <span>p50 {t.latencyP50Ms}ms</span>
                        <span style={{ color: t.errors > 0 ? 'var(--orange)' : 'var(--ink-3)' }}>
                          {t.errors} err
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {usage.data.totals.requests30d === 0 && (
                <div style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                  No usage in the last 30 days yet — runs will appear here automatically.
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
          lineHeight: 1.05,
        }}
      >
        {typeof n === 'number' ? fmtNumber(n) : n}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function QuotaBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const color = pct > 90 ? 'var(--orange)' : 'var(--ink)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          {fmtNumber(current)} / {fmtNumber(limit)} · {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            transition: 'width 200ms',
          }}
        />
      </div>
    </div>
  );
}

function Skeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${60 + ((i * 17) % 35)}%`,
            background: 'var(--paper-deep)',
            borderRadius: 4,
          }}
        />
      ))}
    </div>
  );
}

function ErrorLine({ err }: { err: unknown }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--orange)',
        padding: '6px 0',
      }}
    >
      {err instanceof Error ? err.message : String(err)}
    </div>
  );
}

export default CommandCenter;
