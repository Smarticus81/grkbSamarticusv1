/**
 * Decision Trails — Smarticus
 *
 * Hayes Raffle: an audit trail isn't a database — it's a story your future
 * self tells an inspector. The whole page is a story:
 *   1. WHO am I auditing? (the search)
 *   2. IS IT REAL? (verification seal)
 *   3. WHAT HAPPENED? (the timeline)
 *   4. WHY? (per-event payload)
 *
 * Paper, ink, signal. No neon. The seriousness of an audit deserves it.
 */

import { useEffect, useState } from 'react';
import { api } from '../lib/queryClient.js';
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

type Tone = 'ok' | 'warn' | 'err' | 'info';

function friendlyEvent(eventType: string): { label: string; tone: Tone } {
  const lower = eventType.toLowerCase();
  if (lower.includes('qualif') || lower.includes('readiness')) return { label: 'Readiness check', tone: 'info' };
  if (lower.includes('valid') || lower.includes('compliance')) return { label: 'Validation check', tone: 'info' };
  if (lower.includes('start') || lower.includes('init')) return { label: 'Process started', tone: 'info' };
  if (lower.includes('complete') || lower.includes('finish')) return { label: 'Process completed', tone: 'ok' };
  if (lower.includes('reject') || lower.includes('fail') || lower.includes('miss')) return { label: 'Requirement not satisfied', tone: 'err' };
  if (lower.includes('correct') || lower.includes('retry')) return { label: 'Correction applied', tone: 'warn' };
  if (lower.includes('agent')) return { label: 'Agent step', tone: 'info' };
  if (lower.includes('hitl') || lower.includes('approve')) return { label: 'Human review', tone: 'info' };
  if (lower.includes('evidence')) return { label: 'Evidence handled', tone: 'info' };
  return { label: eventType.replace(/_/g, ' ').toLowerCase(), tone: 'info' };
}

function toneColor(t: Tone): string {
  switch (t) {
    case 'ok':   return 'var(--ok)';
    case 'warn': return 'var(--warn)';
    case 'err':  return 'var(--err)';
    case 'info': return 'var(--ink-2)';
  }
}

export function TraceExplorer({ initialId }: Props) {
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
      const [traceData, verifyData] = await Promise.all([
        api<TraceEntry[]>(`/api/traces/${pid}`),
        api<Verification>(`/api/traces/${pid}/verify`),
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
          <div style={{ position: 'relative' }} className="rise-1">
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              Timeline · {chain.length} {chain.length === 1 ? 'entry' : 'entries'}
            </div>

            <div
              style={{
                position: 'absolute',
                left: 17,
                top: 48,
                bottom: 16,
                width: 1,
                background: 'var(--rule-strong)',
              }}
              aria-hidden
            />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {chain.map((entry) => {
                const evt = friendlyEvent(entry.eventType);
                const color = toneColor(evt.tone);
                const isOpen = expanded === entry.id;
                const time = new Date(entry.timestamp);
                return (
                  <div
                    key={entry.id}
                    style={{ position: 'relative', paddingLeft: 52, paddingBottom: 16 }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 6,
                        top: 14,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'var(--paper)',
                        border: `2px solid ${color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        color,
                        zIndex: 1,
                      }}
                    >
                      {entry.sequenceNumber}
                    </div>

                    <button
                      onClick={() => setExpanded(isOpen ? null : entry.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 16px',
                        background: isOpen ? 'var(--paper-deep)' : 'transparent',
                        border: `1px solid ${isOpen ? 'var(--rule-strong)' : 'var(--rule)'}`,
                        borderRadius: 'var(--r-2)',
                        cursor: 'pointer',
                        transition: 'background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isOpen) e.currentTarget.style.borderColor = 'var(--rule-strong)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isOpen) e.currentTarget.style.borderColor = 'var(--rule)';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
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
                              flexShrink: 0,
                            }}
                          >
                            {evt.label}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.actor.replace(/[-_]/g, ' ')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span style={{ color: 'var(--ink-4)', fontSize: 14 }}>{isOpen ? '−' : '+'}</span>
                        </div>
                      </div>

                      {isOpen && (
                        <div
                          style={{
                            marginTop: 14,
                            paddingTop: 14,
                            borderTop: '1px solid var(--rule)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                          }}
                        >
                          {entry.payload && Object.keys(entry.payload).length > 0 ? (
                            <div>
                              <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>
                                What was decided
                              </div>
                              <dl
                                style={{
                                  margin: 0,
                                  display: 'grid',
                                  gridTemplateColumns: '160px 1fr',
                                  gap: '8px 16px',
                                  fontSize: 12.5,
                                }}
                              >
                                {Object.entries(entry.payload).map(([k, v]) => (
                                  <PayloadRow key={k} label={k} value={v} />
                                ))}
                              </dl>
                            </div>
                          ) : (
                            <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                              No payload recorded for this event.
                            </div>
                          )}

                          <div
                            style={{
                              fontFamily: 'var(--mono)',
                              fontSize: 11,
                              color: 'var(--ink-4)',
                              letterSpacing: '0.04em',
                              borderTop: '1px solid var(--rule)',
                              paddingTop: 10,
                              display: 'flex',
                              gap: 12,
                              flexWrap: 'wrap',
                            }}
                          >
                            <span>hash {shortHash(entry.currentHash)}</span>
                            <span>← prev {shortHash(entry.previousHash)}</span>
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PayloadRow({ label, value }: { label: string; value: unknown }) {
  const display = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  return (
    <>
      <dt
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.04em',
          textTransform: 'lowercase',
          color: 'var(--ink-3)',
        }}
      >
        {label.replace(/_/g, ' ')}
      </dt>
      <dd
        style={{
          margin: 0,
          color: 'var(--ink-2)',
          wordBreak: 'break-word',
          fontFamily: typeof value === 'object' ? 'var(--mono)' : 'inherit',
          fontSize: typeof value === 'object' ? 11.5 : 12.5,
        }}
      >
        {display}
      </dd>
    </>
  );
}

export default TraceExplorer;
