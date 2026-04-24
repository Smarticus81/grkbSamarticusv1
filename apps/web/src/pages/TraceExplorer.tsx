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

/* ─── Demo trace data ─── */
const DEMO_TRACE: TraceEntry[] = [
  {
    id: 'demo-1', sequenceNumber: 1, eventType: 'PROCESS_INITIATED',
    actor: 'psur-generation-agent', currentHash: 'a1b2c3d4e5f6...', previousHash: '0000000000...',
    timestamp: '2026-04-10T09:14:22Z',
    payload: { process: 'psur-generation', device: 'CardioSense Pro', markets: ['EU'], regulation: 'MDCG 2022-21' },
  },
  {
    id: 'demo-2', sequenceNumber: 2, eventType: 'QUALIFICATION_GATE',
    actor: 'smarticus-api', currentHash: 'b2c3d4e5f6a1...', previousHash: 'a1b2c3d4e5f6...',
    timestamp: '2026-04-10T09:14:23Z',
    payload: {
      result: 'QUALIFIED', requirements_found: 23,
      prerequisites_checked: ['complaint_database', 'pms_report_2025', 'prior_psur_2025_h1'],
      prerequisites_status: 'all_present',
    },
  },
  {
    id: 'demo-3', sequenceNumber: 3, eventType: 'COMPLIANCE_VALIDATION',
    actor: 'smarticus-api', currentHash: 'c3d4e5f6a1b2...', previousHash: 'b2c3d4e5f6a1...',
    timestamp: '2026-04-10T09:15:47Z',
    payload: {
      section: 'Section 4: Complaint Trend Analysis',
      result: 'FAILED', checked_requirements: 5,
      passed: ['MDCG2022-21.4.1', 'MDCG2022-21.4.2', 'MDCG2022-21.4.3', 'MDCG2022-21.4.4'],
      failed: ['MDCG2022-21.4.5'],
      reason: 'Missing: statistical trend comparison to prior reporting period',
    },
  },
  {
    id: 'demo-4', sequenceNumber: 4, eventType: 'CORRECTION_APPLIED',
    actor: 'psur-generation-agent', currentHash: 'd4e5f6a1b2c3...', previousHash: 'c3d4e5f6a1b2...',
    timestamp: '2026-04-10T09:16:12Z',
    payload: {
      section: 'Section 4: Complaint Trend Analysis',
      correction: 'Added 3-period statistical comparison with confidence intervals',
      triggered_by: 'MDCG2022-21.4.5 validation failure',
    },
  },
  {
    id: 'demo-5', sequenceNumber: 5, eventType: 'COMPLIANCE_VALIDATION',
    actor: 'smarticus-api', currentHash: 'e5f6a1b2c3d4...', previousHash: 'd4e5f6a1b2c3...',
    timestamp: '2026-04-10T09:16:14Z',
    payload: {
      section: 'Section 4: Complaint Trend Analysis',
      result: 'PASSED', checked_requirements: 5,
      passed: ['MDCG2022-21.4.1', 'MDCG2022-21.4.2', 'MDCG2022-21.4.3', 'MDCG2022-21.4.4', 'MDCG2022-21.4.5'],
    },
  },
  {
    id: 'demo-6', sequenceNumber: 6, eventType: 'DECISION_TRACED',
    actor: 'psur-generation-agent', currentHash: 'f6a1b2c3d4e5...', previousHash: 'e5f6a1b2c3d4...',
    timestamp: '2026-04-10T09:16:15Z',
    payload: {
      decision: 'Complaint trend classified as stable',
      reasoning: 'Complaint rates across 3 reporting periods (2.1/10k, 2.3/10k, 2.0/10k) are within the ±15% threshold defined in the PMS plan. No statistical anomaly detected.',
      regulatory_basis: ['MDCG 2022-21 §4.5', 'EU MDR Annex VII §4.8'],
      evidence: 'Complaint rates: H1-2025 2.1/10k, H2-2025 2.3/10k, H1-2026 2.0/10k',
    },
  },
  {
    id: 'demo-7', sequenceNumber: 7, eventType: 'PROCESS_COMPLETED',
    actor: 'psur-generation-agent', currentHash: 'a7b8c9d0e1f2...', previousHash: 'f6a1b2c3d4e5...',
    timestamp: '2026-04-10T09:22:41Z',
    payload: {
      result: 'COMPLIANT', total_requirements_checked: 23, all_passed: true,
      sections_validated: 8, decisions_traced: 12,
      ready_for: 'Human review',
    },
  },
];

const DEMO_VERIFICATION: Verification = {
  valid: true, verifiedEntries: 7, totalEntries: 7,
  signatureHash: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
};

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
  const [showDemo, setShowDemo] = useState(false);
  const [popoverNode, setPopoverNode] = useState<string | null>(null);

  async function load() {
    if (!pid.trim()) return;
    setLoading(true);
    setShowDemo(false);
    try {
      const [traceData, verifyData] = await Promise.all([
        api<TraceEntry[]>(`/api/traces/${pid}`),
        api<Verification>(`/api/traces/${pid}/verify`),
      ]);
      setChain(traceData);
      setVerification(verifyData);
    } catch {
      setChain([]);
      setVerification(null);
    } finally {
      setLoading(false);
    }
  }

  function loadDemo() {
    setShowDemo(true);
    setChain(DEMO_TRACE);
    setVerification(DEMO_VERIFICATION);
    setPid('demo-psur-2026-q1-cardiosense');
  }

  function clearTrace() {
    setChain([]);
    setVerification(null);
    setPid('');
    setShowDemo(false);
    setExpandedEntry(null);
    setPopoverNode(null);
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
            value={showDemo ? 'demo-psur-2026-q1-cardiosense' : pid}
            onChange={(e) => { setPid(e.target.value); setShowDemo(false); }}
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

      {/* Demo banner */}
      {showDemo && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 24,
          background: 'var(--accent-muted)', border: '1px solid var(--accent)' + '50',
          fontSize: 12, color: 'var(--accent-bright)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-bright)', boxShadow: '0 0 8px rgba(14,140,194,0.5)' }} />
          Example — This is the decision trail from an AI-generated PSUR for a Class IIb cardiac device.
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
      {!loading && activeChain.length === 0 && !showDemo && (
        <div style={{
          textAlign: 'center',
          padding: '72px 48px',
          background: 'var(--bg-root)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          maxWidth: '520px',
          margin: '0 auto',
        }}>
          {/* Animated graph nodes */}
          <FloatingNodes />

          <div style={{ fontSize: 18, color: 'var(--text-primary)', marginBottom: 8, fontWeight: 700, marginTop: 16 }}>
            {pid && verification === null ? 'No decision trail found' : 'No decision trail loaded'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 28, lineHeight: 1.6 }}>
            Enter a document ID above to load its audit trail, or view an example to see what Smarticus records.
          </div>
          <button
            onClick={loadDemo}
            style={{
              padding: '11px 24px', fontSize: 13, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)', background: 'transparent',
              color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600,
              transition: 'all 0.2s', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)';
              e.currentTarget.style.borderColor = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            View example decision trail
          </button>
        </div>
      )}

      {/* "Your traces will appear here" section */}
      {activeChain.length > 0 && showDemo && (
        <div style={{
          marginTop: 48, paddingTop: 28, borderTop: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            textAlign: 'center', padding: '56px 48px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            maxWidth: '520px', margin: '0 auto',
          }}>
            <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 600 }}>
              Your audit trails will appear here
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Once Smarticus is connected to your workflow, every AI-generated document will have a full audit trail here — ready for your next inspection.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
