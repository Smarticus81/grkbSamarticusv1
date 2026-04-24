import { useState } from 'react';
import { api } from '../lib/queryClient.js';

interface ValidationFinding {
  validator: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  obligationId?: string;
  constraintId?: string;
  message: string;
  remediation?: string;
}

interface DraftValidationResult {
  status: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL' | 'REQUIRES_REVIEW';
  severityCounts: Record<string, number>;
  findings: ValidationFinding[];
  passedHardChecks: boolean;
  requiresHumanReview: boolean;
  traceBundle?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#d32f2f',
  error: '#e65100',
  warning: '#f9a825',
  info: 'var(--ink-3)',
};

const SEVERITY_ORDER = ['critical', 'error', 'warning', 'info'];

const PROCESS_OPTIONS = [
  'CAPA',
  'COMPLAINT',
  'NONCONFORMANCE',
  'TREND_REPORTING',
  'CHANGE_CONTROL',
  'AUDIT',
  'PMS',
  'PSUR',
];

const JURISDICTION_OPTIONS = [
  { value: 'EU_MDR', label: 'EU MDR' },
  { value: 'FDA', label: '21 CFR 820 (FDA)' },
  { value: 'ISO_13485', label: 'ISO 13485' },
  { value: 'ISO_14971', label: 'ISO 14971' },
  { value: 'UK_MDR', label: 'UK MDR' },
  { value: 'IMDRF', label: 'IMDRF' },
  { value: 'GLOBAL', label: 'All (Global)' },
];

export function DraftCheck() {
  const [draftText, setDraftText] = useState('');
  const [processType, setProcessType] = useState('CAPA');
  const [jurisdictions, setJurisdictions] = useState<string[]>(['EU_MDR', 'FDA', 'ISO_13485']);
  const [result, setResult] = useState<DraftValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleJurisdiction = (j: string) => {
    setJurisdictions((prev) =>
      prev.includes(j) ? prev.filter((x) => x !== j) : [...prev, j],
    );
  };

  const handleValidate = async () => {
    if (!draftText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<DraftValidationResult>('/api/validate-draft', {
        method: 'POST',
        body: JSON.stringify({ draftText, processType, jurisdictions }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTrace = () => {
    if (!result?.traceBundle) return;
    const blob = new Blob([result.traceBundle], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace-bundle-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedFindings = result?.findings
    ? [...result.findings].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
      )
    : [];

  return (
    <div style={{ padding: '32px 32px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div className="rise" style={{ marginBottom: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
          Validate Draft
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
          Check your draft against the regulations.
        </h1>
        <p style={{ marginTop: 12, color: 'var(--ink-2)', fontSize: 15, maxWidth: 640 }}>
          Paste a draft CAPA, complaint report, or any QMS document. The compliance
          pipeline checks it against EU MDR, 21 CFR 820, ISO 13485 and more.
        </p>
      </div>

      {/* Config bar */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          marginBottom: 20,
          padding: '16px 20px',
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
        }}
      >
        <div>
          <label
            className="eyebrow"
            style={{ display: 'block', marginBottom: 6, fontSize: 10 }}
          >
            Process type
          </label>
          <select
            value={processType}
            onChange={(e) => setProcessType(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-1)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontSize: 12,
            }}
          >
            {PROCESS_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            className="eyebrow"
            style={{ display: 'block', marginBottom: 6, fontSize: 10 }}
          >
            Jurisdictions
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {JURISDICTION_OPTIONS.map((j) => (
              <button
                key={j.value}
                onClick={() => toggleJurisdiction(j.value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--r-1)',
                  border: `1px solid ${jurisdictions.includes(j.value) ? 'var(--orange)' : 'var(--rule)'}`,
                  background: jurisdictions.includes(j.value) ? 'var(--orange)' : 'var(--paper)',
                  color: jurisdictions.includes(j.value) ? '#fff' : 'var(--ink-3)',
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                {j.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Text area + results */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: result ? '1fr 1fr' : '1fr',
          gap: 24,
          transition: 'grid-template-columns 0.3s ease',
        }}
      >
        {/* Input */}
        <div>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Paste your draft CAPA, complaint report, PSUR section, or any QMS document here..."
            style={{
              width: '100%',
              minHeight: 400,
              padding: 16,
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-2)',
              background: 'var(--paper)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              fontSize: 13,
              lineHeight: 1.6,
              resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <button
              className="btn btn-orange"
              onClick={handleValidate}
              disabled={loading || !draftText.trim() || jurisdictions.length === 0}
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Validating...' : 'Validate draft'}
              {!loading && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M3 6h6m-3-3 3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            {result?.traceBundle && (
              <button className="btn btn-ghost" onClick={handleDownloadTrace}>
                Download trace bundle
              </button>
            )}
          </div>
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: '#fff3f0',
                border: '1px solid #ffccbc',
                borderRadius: 'var(--r-1)',
                color: '#d32f2f',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Results panel */}
        {result && (
          <div
            style={{
              border: '1px solid var(--rule)',
              borderRadius: 'var(--r-2)',
              overflow: 'hidden',
            }}
          >
            {/* Status header */}
            <div
              style={{
                padding: '16px 20px',
                background:
                  result.status === 'PASS'
                    ? '#e8f5e9'
                    : result.status === 'PASS_WITH_WARNINGS'
                      ? '#fff8e1'
                      : '#ffebee',
                borderBottom: '1px solid var(--rule)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  className="eyebrow"
                  style={{
                    color:
                      result.status === 'PASS'
                        ? '#2e7d32'
                        : result.status === 'PASS_WITH_WARNINGS'
                          ? '#f57f17'
                          : '#c62828',
                    marginBottom: 4,
                  }}
                >
                  {result.status.replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {result.findings.length} finding{result.findings.length !== 1 ? 's' : ''}
                  {result.requiresHumanReview && ' \u00b7 Human review required'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {SEVERITY_ORDER.map((sev) => {
                  const count = result.severityCounts[sev] ?? 0;
                  if (count === 0) return null;
                  return (
                    <div
                      key={sev}
                      style={{
                        textAlign: 'center',
                        fontFamily: 'var(--mono)',
                        fontSize: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 500,
                          color: SEVERITY_COLORS[sev],
                        }}
                      >
                        {count}
                      </div>
                      <div
                        style={{
                          letterSpacing: '0.1em',
                          color: SEVERITY_COLORS[sev],
                          opacity: 0.8,
                        }}
                      >
                        {sev.toUpperCase()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Findings list */}
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {sortedFindings.map((f, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 20px',
                    borderBottom: '1px solid var(--rule)',
                    display: 'grid',
                    gridTemplateColumns: '6px 1fr',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: SEVERITY_COLORS[f.severity],
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>{f.message}</div>
                    {f.obligationId && (
                      <div
                        style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          color: 'var(--ink-3)',
                          marginTop: 4,
                          letterSpacing: '0.06em',
                        }}
                      >
                        {f.obligationId}
                        {f.constraintId ? ` / ${f.constraintId}` : ''}
                        {' \u00b7 '}
                        {f.validator}
                      </div>
                    )}
                    {f.remediation && (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '6px 10px',
                          background: 'var(--paper-deep)',
                          borderRadius: 'var(--r-1)',
                          fontSize: 12,
                          color: 'var(--ink-2)',
                        }}
                      >
                        {f.remediation}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sortedFindings.length === 0 && (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: 'var(--ink-3)',
                    fontSize: 14,
                  }}
                >
                  No findings. Your draft looks compliant.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DraftCheck;
