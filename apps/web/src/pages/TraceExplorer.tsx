/**
 * Decision Trails — Smarticus
 *
 * An audit trail isn't a database — it's a story your future self tells an
 * inspector. It is NOT a log of every step the system took. It is the
 * record of every *decision* the system made:
 *
 *   WHY  — the reason for the decision
 *   WHO  — the agent that made it
 *   WHEN — when it was made
 *   REG  — the granular regulation or standard it came from
 *
 * Steps (queries, thinking, internal plumbing) are intentionally hidden.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuthenticatedApi } from '../auth/useApi.js';
import { shortHash } from '../lib/utils.js';
import { PageHeader } from '../components/ui/PageHeader.js';
import { EmptyState } from '../components/ui/EmptyState.js';

interface TraceEntry {
  id: string;
  sequenceNumber: number;
  eventType: string;
  actor: string;
  currentHash: string;
  previousHash: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

interface Verification {
  valid: boolean;
  verifiedEntries: number;
  totalEntries: number;
  signatureHash: string;
  brokenAt?: number;
}

interface Props {
  initialId?: string;
}

type Verdict = 'identified' | 'satisfied' | 'missed' | 'gated' | 'other';

interface Decision {
  id: string;
  sequenceNumber: number;
  verdict: Verdict;
  headline: string;
  why: string;
  agent: string;
  timestamp: string;
  obligationId?: string;
  citation?: string;
  regulation?: string;
  currentHash: string;
  previousHash: string;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toDecision(entry: TraceEntry): Decision | null {
  const p = entry.payload ?? {};
  const obligationId = str(p['obligationId']);
  const citation = str(p['citation']);
  const regulation = str(p['regulation']);
  const summary = str(p['summary']);
  const reason = str(p['reason']) ?? str(p['message']);

  const lower = entry.eventType.toLowerCase();

  if (lower === 'graph.cite' || lower.endsWith('.cite')) {
    return {
      id: entry.id,
      sequenceNumber: entry.sequenceNumber,
      verdict: 'identified',
      headline: 'Identified as applicable',
      why: summary ?? reason ?? 'This requirement applies to the inputs provided.',
      agent: entry.actor,
      timestamp: entry.timestamp,
      obligationId,
      citation,
      regulation,
      currentHash: entry.currentHash,
      previousHash: entry.previousHash,
    };
  }

  if (lower === 'obligation.satisfied' || lower.endsWith('.satisfied')) {
    return {
      id: entry.id,
      sequenceNumber: entry.sequenceNumber,
      verdict: 'satisfied',
      headline: 'Decided satisfied',
      why: reason ?? 'The output addressed this requirement.',
      agent: entry.actor,
      timestamp: entry.timestamp,
      obligationId,
      citation,
      regulation,
      currentHash: entry.currentHash,
      previousHash: entry.previousHash,
    };
  }

  if (lower === 'obligation.missed' || lower.endsWith('.missed') || lower.endsWith('.failed')) {
    return {
      id: entry.id,
      sequenceNumber: entry.sequenceNumber,
      verdict: 'missed',
      headline: 'Decided not satisfied',
      why: reason ?? 'The output did not address this requirement.',
      agent: entry.actor,
      timestamp: entry.timestamp,
      obligationId,
      citation,
      regulation,
      currentHash: entry.currentHash,
      previousHash: entry.previousHash,
    };
  }

  if (lower === 'output.gated' || lower.includes('strict') || lower.includes('gate')) {
    const passed = p['passed'];
    const ok = passed === true || passed === 'true';
    return {
      id: entry.id,
      sequenceNumber: entry.sequenceNumber,
      verdict: 'gated',
      headline: ok ? 'Output released' : 'Output blocked',
      why: reason ?? (ok
        ? 'Output passed every applicable requirement and the strict schema check.'
        : 'Output did not pass every applicable requirement and was withheld.'),
      agent: entry.actor,
      timestamp: entry.timestamp,
      obligationId,
      citation,
      regulation,
      currentHash: entry.currentHash,
      previousHash: entry.previousHash,
    };
  }

  return null;
}

function verdictColor(v: Verdict): string {
  switch (v) {
    case 'satisfied': return 'var(--ok)';
    case 'missed':    return 'var(--err)';
    case 'gated':     return 'var(--orange)';
    case 'identified':return 'var(--ink-2)';
    case 'other':     return 'var(--ink-3)';
  }
}

function verdictLabel(v: Verdict): string {
  switch (v) {
    case 'satisfied': return 'Satisfied';
    case 'missed':    return 'Not satisfied';
    case 'gated':     return 'Gate';
    case 'identified':return 'Applicable';
    case 'other':     return 'Decision';
  }
}

export function TraceExplorer({ initialId }: Props) {
  const { api } = useAuthenticatedApi();

  const [pid, setPid] = useState(initialId ?? '');
  const [chain, setChain] = useState<TraceEntry[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function load() {
    if (!pid.trim()) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const id = pid.trim();
      const tracePath = id.startsWith('run_')
        ? `/api/sandbox/runs/${id}/trace`
        : `/api/traces/${id}`;
      const verifyPath = id.startsWith('run_')
        ? `/api/sandbox/runs/${id}/trace/verify`
        : `/api/traces/${id}/verify`;
      const [traceData, verifyData] = await Promise.all([
        api<TraceEntry[]>(tracePath),
        api<Verification>(verifyPath),
      ]);
      setChain(traceData);
      setVerification(verifyData);
      if (traceData.length === 0) {
        setError(`No decision trail found for "${pid}". Run a process in the Sandbox to generate one.`);
      }
    } catch (err) {
      setChain([]);
      setVerification(null);
      setError(err instanceof Error ? err.message : 'Could not load decision trail.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setChain([]);
    setVerification(null);
    setPid('');
    setExpanded(null);
    setError(null);
    setHasSearched(false);
  }

  useEffect(() => {
    if (initialId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const showEmpty = !loading && chain.length === 0 && !hasSearched;
  const showError = !loading && chain.length === 0 && hasSearched;

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <PageHeader
        eyebrow="Decision Trails"
        title="Every decision, hash-chained."
        subtitle="Each Smarticus run records what was decided, why, and which requirement supported it. The chain is tamper-evident — this is the audit trail you hand to your notified body or FDA inspector."
        actions={
          chain.length > 0 ? (
            <button className="btn btn-ghost" onClick={reset} style={{ fontSize: 13 }}>
              Load another trail
            </button>
          ) : undefined
        }
        meta={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', maxWidth: 560 }}>
            <input
              placeholder="Process instance ID — e.g. pi_2026_04_..."
              value={pid}
              onChange={(e) => { setPid(e.target.value); setError(null); }}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13 }}
            />
            <button
              onClick={load}
              disabled={loading || !pid.trim()}
              className={pid.trim() ? 'btn btn-orange' : 'btn btn-ghost'}
              style={{ opacity: pid.trim() ? 1 : 0.5 }}
            >
              {loading ? 'Loading…' : 'Open trail'}
            </button>
          </div>
        }
      />

      <div style={{ padding: '32px 40px 80px', maxWidth: 980, margin: '0 auto' }}>
        {showError && error && (
          <div
            className="ground-card"
            style={{
              borderLeft: '3px solid var(--err)',
              padding: '14px 18px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span className="dot-err" />
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{error}</span>
          </div>
        )}

        {showEmpty && (
          <EmptyState
            eyebrow="No trail loaded"
            title="Paste a process ID, or run one in the Sandbox."
            body="Every process executed in Smarticus produces a hash-chained decision trail. When you have one, paste its ID above to inspect it — or open the Sandbox to generate your first."
            primaryAction={{ label: 'Open Sandbox', href: '/app/sandbox' }}
            secondaryAction={{ label: 'See how trails work', href: '/' }}
          />
        )}

        {verification && (
          <div
            style={{
              marginBottom: 32,
              padding: '20px 24px',
              border: `1px solid ${verification.valid ? 'var(--ok)' : 'var(--err)'}`,
              background: verification.valid ? '#0E6B3A0A' : '#B5241B0A',
              borderRadius: 'var(--r-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
            className="rise"
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: verification.valid ? 'var(--ok)' : 'var(--err)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {verification.valid ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10.5l4 3.5L16 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>
                Hash chain {verification.valid ? 'verified' : 'broken'}
              </div>
              <div style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                {verification.valid
                  ? `${verification.verifiedEntries} of ${verification.totalEntries} entries verified`
                  : `Chain broken at entry #${verification.brokenAt}`}
              </div>
              {verification.signatureHash && (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    letterSpacing: '0.04em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  signature {shortHash(verification.signatureHash)}
                </div>
              )}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => navigator.clipboard.writeText(verification.signatureHash).catch(() => {})}
              style={{ fontSize: 12, flexShrink: 0 }}
            >
              Copy signature
            </button>
          </div>
        )}

        {chain.length > 0 && (
          <DecisionsList
            chain={chain}
            expanded={expanded}
            onToggle={(id) => setExpanded(expanded === id ? null : id)}
          />
        )}
      </div>
    </div>
  );
}

function DecisionsList({
  chain,
  expanded,
  onToggle,
}: {
  chain: TraceEntry[];
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  const decisions = useMemo(
    () => chain.map(toDecision).filter((d): d is Decision => d !== null),
    [chain]
  );

  if (decisions.length === 0) {
    return (
      <div
        className="ground-card"
        style={{ padding: '20px 22px', color: 'var(--ink-3)', fontSize: 13.5 }}
      >
        This run completed without recording any regulation-bound decisions.
      </div>
    );
  }

  return (
    <div className="rise-1">
      <div className="eyebrow" style={{ marginBottom: 16 }}>
        Decisions · {decisions.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {decisions.map((d) => (
          <DecisionCard
            key={d.id}
            decision={d}
            open={expanded === d.id}
            onToggle={() => onToggle(d.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  open,
  onToggle,
}: {
  decision: Decision;
  open: boolean;
  onToggle: () => void;
}) {
  const color = verdictColor(decision.verdict);
  const label = verdictLabel(decision.verdict);
  const time = new Date(decision.timestamp);
  const agent = decision.agent.replace(/[-_]/g, ' ');

  return (
    <div
      style={{
        border: `1px solid var(--rule)`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--r-2)',
        background: 'var(--paper)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '16px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 999,
                border: `1px solid ${color}`,
                color,
              }}
            >
              {label}
            </span>
            {decision.citation && (
              <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500, letterSpacing: '-0.005em' }}>
                {decision.citation}
              </span>
            )}
            {decision.regulation && (
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  textTransform: 'uppercase',
                }}
              >
                {decision.regulation.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <span style={{ color: 'var(--ink-4)', fontSize: 16, flexShrink: 0 }}>{open ? '−' : '+'}</span>
        </div>

        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {decision.why}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            letterSpacing: '0.04em',
          }}
        >
          <span>by {agent}</span>
          <span>
            {time.toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
          {decision.obligationId && <span>{decision.obligationId}</span>}
        </div>
      </button>

      {open && (
        <div
          style={{
            padding: '12px 20px 14px',
            borderTop: '1px solid var(--rule)',
            background: 'var(--paper-deep)',
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-4)',
            letterSpacing: '0.04em',
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span>hash {shortHash(decision.currentHash)}</span>
          <span>← prev {shortHash(decision.previousHash)}</span>
        </div>
      )}
    </div>
  );
}

export default TraceExplorer;
