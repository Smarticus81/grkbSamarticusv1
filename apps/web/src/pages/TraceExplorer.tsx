import { useState, useEffect } from 'react';
import { RegulatorCompactStrip } from '../components/ui/RegulatorAssets.js';
import { api } from '../lib/queryClient.js';
import { shortHash } from '../lib/utils.js';

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

/* ─── Friendly event type labels ─── */
function friendlyEvent(eventType: string): { label: string; color: string } {
  const lower = eventType.toLowerCase();
  if (lower.includes('qualif') || lower.includes('gate')) return { label: 'Readiness check passed', color: '#0E8CC2' };
  if (lower.includes('valid') || lower.includes('compliance')) return { label: 'Validation check', color: '#8b5cf6' };
  if (lower.includes('decision') || lower.includes('trace')) return { label: 'Decision trail recorded', color: '#90CB62' };
  if (lower.includes('start') || lower.includes('init')) return { label: 'Process started', color: '#5CC3C9' };
  if (lower.includes('complete') || lower.includes('end')) return { label: 'Process completed', color: '#6FA646' };
  if (lower.includes('reject') || lower.includes('fail')) return { label: 'Requirement not satisfied', color: '#F96746' };
  if (lower.includes('correct') || lower.includes('retry')) return { label: 'Correction applied', color: '#FFA901' };
  return { label: eventType, color: 'var(--text-tertiary)' };
}

/* ─── Animated floating nodes for empty state ─── */
function FloatingNodes() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100px', overflow: 'hidden' }}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: `var(--neo-cyan)`,
            boxShadow: '0 0 12px rgba(92,195,201,0.6)',
            left: `${20 + i * 20}%`,
            top: '50%',
            animation: `float-node ${2 + i * 0.3}s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes float-node {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.6; }
          50% { transform: translateY(-30px) translateX(10px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function TraceExplorer({ initialId }: Props) {
  const [pid, setPid] = useState(initialId ?? '');
  const [chain, setChain] = useState<TraceEntry[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [popoverNode, setPopoverNode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!pid.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [traceData, verifyData] = await Promise.all([
        api<TraceEntry[]>(`/api/traces/${pid}`),
        api<Verification>(`/api/traces/${pid}/verify`),
      ]);
      setChain(traceData);
      setVerification(verifyData);
      if (traceData.length === 0) {
        setError(`No trail found for "${pid}". Run a process in the Sandbox to generate one.`);
      }
    } catch (err) {
      setChain([]);
      setVerification(null);
      setError(err instanceof Error ? err.message : 'Failed to load trail');
    } finally {
      setLoading(false);
    }
  }

  function clearTrace() {
    setChain([]);
    setVerification(null);
    setPid('');
    setExpandedEntry(null);
    setPopoverNode(null);
    setError(null);
  }

  useEffect(() => {
    if (initialId) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const activeChain = chain;
  const activeVerification = verification;

  return (
    <div style={{ padding: '32px 40px', position: 'relative', minHeight: '100vh' }}>
      {/* Header section */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Decision Trails</h1>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 14, margin: 0, maxWidth: 680, lineHeight: 1.6 }}>
          Every time Smarticus generates a document, it records what was decided, why, and which regulation supports it. This is the audit trail you hand to your notified body or FDA auditor.
        </p>
        <div style={{ marginTop: 16, maxWidth: 420 }}>
          <RegulatorCompactStrip />
        </div>
      </div>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 32, alignItems: 'center', maxWidth: '560px' }}>
        <div style={{ flex: 1 }}>
          <input
            placeholder="Enter a document or process ID..."
            value={pid}
            onChange={(e) => { setPid(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{
              width: '100%',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              padding: '11px 14px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              background: 'var(--bg-root)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--neo-cyan)';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(92,195,201,0.15)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
        <button
          onClick={load}
          disabled={loading || !pid.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: 'var(--radius-md)',
            background: pid.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
            color: pid.trim() ? '#fff' : 'var(--text-muted)',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: pid.trim() ? 'pointer' : 'default',
            fontFamily: 'var(--font-sans)',
            transition: 'all 0.2s',
          }}
        >
          {loading ? 'Loading...' : 'Load'}
        </button>
        {activeChain.length > 0 && (
          <button
            onClick={clearTrace}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--text-secondary)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 24,
          background: 'rgba(249,103,70,0.08)', border: '1px solid var(--danger)',
          fontSize: 12, color: 'var(--danger)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)' }} />
          {error}
        </div>
      )}

      {/* Verification seal — prominent centered element with glow */}
      {activeVerification && (
        <div style={{
          marginBottom: 32,
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            padding: '24px 32px',
            background: activeVerification.valid ? 'rgba(111,166,70,0.08)' : 'rgba(249,103,70,0.08)',
            border: `2px solid ${activeVerification.valid ? 'var(--neo-green)' : 'var(--danger)'}`,
            borderRadius: 'var(--radius-lg)',
            boxShadow: `0 0 32px ${activeVerification.valid ? 'rgba(111,166,70,0.15)' : 'rgba(249,103,70,0.15)'}`,
            position: 'relative',
            minWidth: '320px',
            textAlign: 'center',
          }}>
            {/* Seal ring */}
            <div style={{
              position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
              width: '24px', height: '24px', borderRadius: '50%',
              background: activeVerification.valid ? 'var(--neo-green)' : 'var(--danger)',
              boxShadow: `0 0 20px ${activeVerification.valid ? 'rgba(111,166,70,0.8)' : 'rgba(249,103,70,0.8)'}`,
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{
                fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
              }}>
                {activeVerification.valid ? '✓ Decision Trail Verified' : '✗ Verification Failed'}
              </span>
            </div>
            <span style={{
              fontSize: 11, color: activeVerification.valid ? 'var(--neo-green)' : 'var(--danger)',
              fontWeight: 600, fontFamily: 'var(--font-mono)',
            }}>
              {activeVerification.verifiedEntries}/{activeVerification.totalEntries} entries verified
            </span>
            {!activeVerification.valid && activeVerification.brokenAt !== undefined && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--danger)' }}>
                Decision chain breaks at entry #{activeVerification.brokenAt}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary cards — circular/ring indicators instead of rectangular */}
      {activeChain.length > 0 && activeVerification && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginBottom: 32, maxWidth: '600px' }}>
          {[
            { value: String(activeChain.length), label: 'Entries', color: 'var(--neo-cyan)' },
            { value: String(activeChain[activeChain.length - 1]?.payload?.total_requirements_checked ?? 0), label: 'Requirements', color: 'var(--accent-bright)' },
            { value: String(activeChain[activeChain.length - 1]?.payload?.sections_validated ?? 0), label: 'Sections', color: 'var(--neo-marigold)' },
            { value: String(activeChain[activeChain.length - 1]?.payload?.result ?? 'UNKNOWN'), label: 'Result', color: (activeChain[activeChain.length - 1]?.payload?.result === 'COMPLIANT') ? 'var(--neo-green)' : 'var(--danger)' },
          ].map((card, i) => (
            <div key={i} style={{
              padding: '16px', background: `${card.color}08`, border: `1px solid ${card.color}30`,
              borderRadius: 'var(--radius-lg)', textAlign: 'center',
              position: 'relative', overflow: 'hidden',
              boxShadow: `0 0 16px ${card.color}08`,
            }}>
              <div style={{
                fontSize: 24, fontWeight: 700, color: card.color, marginBottom: 6, lineHeight: 1,
              }}>
                {card.value}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Trace entries — VERTICAL CONNECTED GRAPH */}
      {activeChain.length > 0 && (
        <div style={{
          position: 'relative',
          marginBottom: 32,
        }}>
          {/* Connection line */}
          <div style={{
            position: 'absolute',
            left: '24px',
            top: '0',
            bottom: '0',
            width: '2px',
            background: 'linear-gradient(180deg, var(--neo-cyan), var(--neo-green))',
            boxShadow: '0 0 12px rgba(92,195,201,0.3)',
            pointerEvents: 'none',
          }} />

          {/* Trace nodes */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}>
            {activeChain.map((entry, idx) => {
              const evt = friendlyEvent(entry.eventType);
              const isExpanded = expandedEntry === entry.id;
              const showPopover = popoverNode === entry.id;

              return (
                <div key={entry.id} style={{
                  position: 'relative',
                  marginBottom: idx === activeChain.length - 1 ? 0 : 0,
                  paddingLeft: '64px',
                  minHeight: '60px',
                  display: 'flex',
                  alignItems: 'flex-start',
                }}>
                  {/* Node circle */}
                  <div style={{
                    position: 'absolute',
                    left: '8px',
                    top: '8px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: evt.color,
                    boxShadow: `0 0 16px ${evt.color}60, inset 0 0 12px ${evt.color}30`,
                    border: '2px solid var(--bg-root)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#fff',
                    zIndex: 10,
                  }}>
                    {entry.sequenceNumber}
                  </div>

                  {/* Content card */}
                  <div style={{
                    flex: 1,
                    paddingTop: '4px',
                  }}>
                    <button
                      onClick={() => {
                        setExpandedEntry(isExpanded ? null : entry.id);
                        setPopoverNode(isExpanded ? null : entry.id);
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: isExpanded ? `${evt.color}12` : 'transparent',
                        border: isExpanded ? `1px solid ${evt.color}40` : 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'var(--font-sans)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isExpanded) {
                          e.currentTarget.style.background = `${evt.color}08`;
                          e.currentTarget.style.border = `1px solid ${evt.color}30`;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isExpanded) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.border = 'none';
                        }
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        justifyContent: 'space-between',
                      }}>
                        <div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: evt.color + '18', color: evt.color,
                            display: 'inline-block',
                          }}>
                            {evt.label}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', marginLeft: 12 }}>
                            {entry.actor.replace(/-/g, ' ')}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </button>

                    {/* Glassmorphism popover for payload — appears adjacent to node */}
                    {showPopover && entry.payload && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: '14px 16px',
                          background: 'rgba(8,30,43,0.85)',
                          backdropFilter: 'blur(12px)',
                          border: `1px solid ${evt.color}40`,
                          borderRadius: 'var(--radius-md)',
                          boxShadow: `0 0 16px ${evt.color}15`,
                          fontSize: 11,
                          lineHeight: 1.6,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <div style={{ marginBottom: 8, fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>
                          Payload
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                          {Object.entries(entry.payload).map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', gap: 8 }}>
                              <span style={{ color: 'var(--text-muted)', minWidth: '120px', fontWeight: 500 }}>
                                {key.replace(/_/g, ' ')}
                              </span>
                              <span style={{ color: 'var(--text-secondary)', flex: 1, wordBreak: 'break-word' }}>
                                {typeof value === 'object' ? (
                                  Array.isArray(value) ? value.join(', ') : JSON.stringify(value, null, 2)
                                ) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div style={{
                          marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(92,195,201,0.15)',
                          fontSize: 10, color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {shortHash(entry.currentHash)} ← {shortHash(entry.previousHash)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && activeChain.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '72px 48px',
          background: 'var(--bg-root)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '520px',
          margin: '0 auto',
        }}>
          <FloatingNodes />

          <div style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8, fontWeight: 700, marginTop: 16 }}>
            No decision trail loaded
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 28, lineHeight: 1.6 }}>
            Every process run in the Sandbox produces a hash-chained decision trail. Run a process, then paste its instance ID above — or use the link from the Sandbox results panel.
          </div>
          <a
            href="/app/sandbox"
            style={{
              display: 'inline-block',
              padding: '11px 24px', fontSize: 13, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)', background: 'transparent',
              color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600,
              transition: 'all 0.2s', fontFamily: 'var(--font-sans)',
            }}
          >
            Open Sandbox →
          </a>
        </div>
      )}
    </div>
  );
}
