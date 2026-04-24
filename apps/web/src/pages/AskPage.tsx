import { useState } from 'react';
import { api } from '../lib/queryClient.js';

interface ObligationSummary {
  obligationId: string;
  title: string;
  sourceCitation: string;
  text: string;
  mandatory: boolean;
  requiredEvidenceTypes: string[];
  jurisdiction: string;
}

interface DiscoverResult {
  obligations: ObligationSummary[];
  constraints: unknown[];
  definitions: unknown[];
  evidenceTypes: string[];
  summary: string;
}

const PROCESS_TYPES = [
  'CAPA',
  'COMPLAINT',
  'NONCONFORMANCE',
  'TREND_REPORTING',
  'CHANGE_CONTROL',
  'AUDIT',
  'PMS',
  'PSUR',
];

const JURISDICTIONS = [
  { value: 'EU_MDR', label: 'EU MDR' },
  { value: 'FDA', label: '21 CFR 820' },
  { value: 'ISO_13485', label: 'ISO 13485' },
  { value: 'ISO_14971', label: 'ISO 14971' },
  { value: 'UK_MDR', label: 'UK MDR' },
  { value: 'IMDRF', label: 'IMDRF' },
  { value: 'GLOBAL', label: 'Global' },
];

export function AskPage() {
  const [processType, setProcessType] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');
  const [freeText, setFreeText] = useState('');
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [searchResults, setSearchResults] = useState<ObligationSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDiscover = async () => {
    if (!processType || !jurisdiction) return;
    setLoading(true);
    setSearchResults(null);
    try {
      const res = await api<{ obligations: ObligationSummary[] }>(
        `/api/graph/obligations?processType=${encodeURIComponent(processType)}&jurisdiction=${encodeURIComponent(jurisdiction)}`,
      );
      setResult({
        obligations: res.obligations,
        constraints: [],
        definitions: [],
        evidenceTypes: [],
        summary: `Found ${res.obligations.length} obligations for ${processType} in ${jurisdiction}`,
      });
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!freeText.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await api<{ obligations: ObligationSummary[] }>(
        `/api/graph/search?q=${encodeURIComponent(freeText)}`,
      );
      setSearchResults(res.obligations ?? []);
    } catch {
      setSearchResults(null);
    } finally {
      setLoading(false);
    }
  };

  const obligations = result?.obligations ?? searchResults ?? [];
  const mandatoryCount = obligations.filter((o) => o.mandatory).length;

  return (
    <div style={{ padding: '32px 32px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div className="rise" style={{ marginBottom: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
          Ask the Graph
        </div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'clamp(28px, 3.4vw, 44px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          What obligations apply?
        </h1>
        <p style={{ marginTop: 12, color: 'var(--ink-2)', fontSize: 15, maxWidth: 640 }}>
          Pick a process and jurisdiction to discover all applicable obligations,
          or search by keyword across the entire graph.
        </p>
      </div>

      {/* Interactive widget */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 12,
          alignItems: 'end',
          marginBottom: 12,
          padding: '20px',
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
        }}
      >
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 6, fontSize: 10 }}>
            Process
          </label>
          <select
            value={processType}
            onChange={(e) => setProcessType(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-1)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          >
            <option value="">Select process...</option>
            {PROCESS_TYPES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 6, fontSize: 10 }}>
            Jurisdiction
          </label>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-1)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          >
            <option value="">Select jurisdiction...</option>
            {JURISDICTIONS.map((j) => (
              <option key={j.value} value={j.value}>{j.label}</option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-orange"
          onClick={handleDiscover}
          disabled={loading || !processType || !jurisdiction}
          style={{ whiteSpace: 'nowrap' }}
        >
          Discover
        </button>
      </div>

      {/* Free-text search */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 12,
          alignItems: 'end',
          marginBottom: 24,
          padding: '16px 20px',
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
        }}
      >
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 6, fontSize: 10 }}>
            Or search by keyword
          </label>
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. risk management, CAPA, post-market surveillance..."
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-1)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          />
        </div>
        <button
          className="btn btn-ghost"
          onClick={handleSearch}
          disabled={loading || !freeText.trim()}
        >
          Search
        </button>
      </div>

      {/* Connect to Claude/Cursor callout */}
      {obligations.length > 0 && (
        <div
          style={{
            padding: '12px 20px',
            marginBottom: 20,
            background: 'var(--paper-deep)',
            border: '1px solid var(--orange)',
            borderRadius: 'var(--r-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
              {obligations.length} obligations found
              {mandatoryCount > 0 && ` (${mandatoryCount} mandatory)`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              Connect this graph to your AI agent via MCP
            </div>
          </div>
          <a
            href="/app/api-access"
            className="btn btn-ghost"
            style={{ fontSize: 12, textDecoration: 'none' }}
          >
            Connect to Claude / Cursor
          </a>
        </div>
      )}

      {/* Results */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)' }}>
          Querying the obligation graph...
        </div>
      )}

      {obligations.length > 0 && (
        <div
          style={{
            border: '1px solid var(--rule)',
            borderRadius: 'var(--r-2)',
            overflow: 'hidden',
          }}
        >
          {obligations.map((obl) => {
            const isExpanded = expandedId === obl.obligationId;
            return (
              <div
                key={obl.obligationId}
                style={{
                  borderBottom: '1px solid var(--rule)',
                }}
              >
                <button
                  onClick={() =>
                    setExpandedId(isExpanded ? null : obl.obligationId)
                  }
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--ink)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5 }}>{obl.title}</div>
                    <div
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        marginTop: 2,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {obl.obligationId} · {obl.sourceCitation}
                      {obl.mandatory && (
                        <span style={{ color: 'var(--orange)', marginLeft: 8 }}>
                          MANDATORY
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.15s',
                    }}
                  >
                    <path
                      d="M3 5l3 3 3-3"
                      stroke="var(--ink-3)"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {isExpanded && (
                  <div
                    style={{
                      padding: '0 20px 16px',
                      fontSize: 13,
                      color: 'var(--ink-2)',
                      lineHeight: 1.6,
                    }}
                  >
                    <p style={{ margin: '0 0 10px' }}>{obl.text}</p>
                    {obl.requiredEvidenceTypes.length > 0 && (
                      <div>
                        <span
                          className="eyebrow"
                          style={{ fontSize: 9, color: 'var(--ink-4)' }}
                        >
                          Required evidence
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            flexWrap: 'wrap',
                            marginTop: 4,
                          }}
                        >
                          {obl.requiredEvidenceTypes.map((et) => (
                            <span
                              key={et}
                              style={{
                                padding: '2px 8px',
                                border: '1px solid var(--rule)',
                                borderRadius: 'var(--r-1)',
                                fontFamily: 'var(--mono)',
                                fontSize: 10,
                                color: 'var(--ink-3)',
                              }}
                            >
                              {et}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AskPage;
