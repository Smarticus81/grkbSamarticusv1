import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RegulatorCompactStrip } from '../components/ui/RegulatorAssets.js';
import { api } from '../lib/queryClient.js';

/* ── Types ── */
interface Obligation {
  id: string;
  title: string;
  text: string;
  citation: string;
  jurisdiction: string;
  processType: string;
  artifactType: string;
  kind: string;
  mandatory: boolean;
}

interface RegulationData {
  regulations: Record<string, Obligation[]>;
  total: number;
}

/* ── Friendly regulation names ── */
const REG_META: Record<string, { label: string }> = {
  EU_MDR:       { label: 'EU MDR 2017/745' },
  ISO_13485:    { label: 'ISO 13485:2016' },
  ISO_14971:    { label: 'ISO 14971:2019' },
  CFR_820:      { label: '21 CFR Part 820' },
  UK_MDR:       { label: 'UK MDR 2002' },
  MDCG_2022_21: { label: 'MDCG 2022-21' },
  IMDRF_AE:     { label: 'IMDRF Adverse Events' },
  IMDRF_CODING: { label: 'IMDRF Coding' },
};

/* ── Common process types with friendly labels ── */
const COMMON_PROCESS_TYPES = [
  { key: 'PSUR',                label: 'PSUR Generation' },
  { key: 'CAPA',                label: 'CAPA Management' },
  { key: 'CLINICAL_EVALUATION', label: 'Clinical Evaluation' },
  { key: 'RISK_MANAGEMENT',     label: 'Risk Management' },
  { key: 'COMPLAINT',           label: 'Complaint Handling' },
  { key: 'DOCUMENT_CONTROL',    label: 'Document Control' },
  { key: 'DESIGN_CONTROL',      label: 'Design Controls' },
  { key: 'VIGILANCE',           label: 'Vigilance Reporting' },
  { key: 'INTERNAL_AUDIT',      label: 'Internal Audits' },
  { key: 'PURCHASING',          label: 'Supplier Management' },
  { key: 'PMS',                 label: 'Post-Market Surveillance' },
  { key: 'LABELING',            label: 'Technical Documentation' },
];

/* ── Competent authorities ── */
const COMPETENT_AUTHORITIES: { name: string; regulations: string[] }[] = [
  { name: 'European Commission', regulations: ['EU_MDR', 'MDCG_2022_21'] },
  { name: 'U.S. FDA',            regulations: ['CFR_820'] },
  { name: 'ISO',                 regulations: ['ISO_13485', 'ISO_14971'] },
  { name: 'UK MHRA',             regulations: ['UK_MDR'] },
  { name: 'IMDRF',               regulations: ['IMDRF_AE', 'IMDRF_CODING'] },
];

const regLabel = (k: string) => REG_META[k]?.label ?? k.replace(/_/g, ' ');
const friendlyProcess = (pt: string) =>
  pt.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function RegulationManager() {
  const data = useQuery({
    queryKey: ['obligations-by-regulation'],
    queryFn: () => api<RegulationData>('/api/graph/obligations-by-regulation'),
  });

  const [filter, setFilter] = useState('');
  const [processFilter, setProcessFilter] = useState<string | null>(null);
  const [selectedReg, setSelectedReg] = useState<string | null>(null);
  const [selectedOb, setSelectedOb] = useState<Obligation | null>(null);

  const rawRegs = data.data?.regulations ?? {};
  const total = data.data?.total ?? 0;

  /* Derive regulation key from citation + jurisdiction */
  function deriveRegKey(o: Obligation): string {
    const cit = (o.citation || '').toLowerCase();
    const jur = (o.jurisdiction || '').toUpperCase();
    if (cit.includes('21 cfr') || jur === 'FDA') return 'CFR_820';
    if (cit.includes('mdcg 2022-21')) return 'MDCG_2022_21';
    if (cit.includes('regulation (eu) 2017/745') || jur === 'EU_MDR') return 'EU_MDR';
    if (cit.includes('iso 14971')) return 'ISO_14971';
    if (cit.includes('iso 13485')) return 'ISO_13485';
    if (cit.includes('uk mdr') || jur === 'UK_MHRA') return 'UK_MDR';
    if (cit.includes('imdrf') && (cit.includes('coding') || o.artifactType === 'CODING')) return 'IMDRF_CODING';
    if (cit.includes('imdrf')) return 'IMDRF_AE';
    if (jur === 'EU') return 'EU_MDR';
    return o.artifactType || 'UNKNOWN';
  }

  const regs = useMemo(() => {
    const all = Object.values(rawRegs).flat();
    const grouped: Record<string, Obligation[]> = {};
    for (const o of all) {
      const key = deriveRegKey(o);
      (grouped[key] ||= []).push(o);
    }
    return grouped;
  }, [rawRegs]);

  const allProcessTypes = useMemo(() => {
    const set = new Set<string>();
    Object.values(regs).forEach((list) => list.forEach((o) => o.processType && set.add(o.processType)));
    return [...set].sort();
  }, [regs]);

  const requirementsPerProcessType = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(regs).forEach((list) =>
      list.forEach((o) => {
        if (o.processType) counts[o.processType] = (counts[o.processType] ?? 0) + 1;
      }),
    );
    return counts;
  }, [regs]);

  const lowerFilter = filter.toLowerCase();
  function matchesObligation(o: Obligation): boolean {
    if (processFilter && o.processType !== processFilter) return false;
    if (!lowerFilter) return true;
    return (
      (o.title ?? '').toLowerCase().includes(lowerFilter) ||
      (o.id ?? '').toLowerCase().includes(lowerFilter) ||
      (o.citation ?? '').toLowerCase().includes(lowerFilter) ||
      (o.text ?? '').toLowerCase().includes(lowerFilter) ||
      (o.kind ?? '').toLowerCase().includes(lowerFilter)
    );
  }
  function filteredObligations(key: string): Obligation[] {
    return (regs[key] ?? []).filter(matchesObligation);
  }

  const filteredAuthorities = useMemo(() => {
    return COMPETENT_AUTHORITIES.map((a) => ({
      ...a,
      regulations: a.regulations.filter((r) => filteredObligations(r).length > 0),
    })).filter((a) => a.regulations.length > 0);
  }, [regs, lowerFilter, processFilter]);

  const mandatoryCount = useMemo(() => {
    let count = 0;
    Object.values(regs).forEach((list) => list.forEach((o) => o.mandatory && count++));
    return count;
  }, [regs]);

  const selectedObligations = selectedReg ? filteredObligations(selectedReg) : [];

  const stats = total > 0
    ? [
        { value: total, label: 'requirements' },
        { value: Object.keys(regs).length, label: 'regulations' },
        { value: mandatoryCount, label: 'mandatory' },
        { value: allProcessTypes.length, label: 'process types' },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--paper)', color: 'var(--ink)', overflow: 'hidden' }}>
      <style>{`
        .rm-chip {
          font-family: var(--sans); font-size: 11.5px; padding: 5px 11px;
          border: 1px solid var(--rule-strong); border-radius: 999px;
          background: transparent; color: var(--ink-3); cursor: pointer;
          transition: border-color var(--t-fast) var(--ease), color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
        }
        .rm-chip:hover { color: var(--ink); border-color: var(--ink); }
        .rm-chip.active { background: var(--ink); color: var(--paper); border-color: var(--ink); }
        .rm-tile {
          display: flex; flex-direction: column; padding: 14px; gap: 6px;
          border: 1px solid var(--rule); border-radius: var(--r-2);
          background: var(--paper); cursor: pointer; text-align: left;
          font-family: var(--sans); transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
        }
        .rm-tile:hover:not(:disabled) { border-color: var(--ink); background: var(--paper-deep); }
        .rm-tile:disabled { opacity: 0.4; cursor: not-allowed; }
        .rm-row {
          display: grid; grid-template-columns: 1fr auto auto;
          gap: 16px; align-items: center; padding: 12px 16px;
          border-top: 1px solid var(--rule); cursor: pointer;
          transition: background var(--t-fast) var(--ease);
        }
        .rm-row:hover { background: var(--paper-deep); }
        .rm-row[data-active="true"] { background: var(--paper-deep); }
        .rm-reg {
          display: grid; grid-template-columns: 1fr auto;
          align-items: baseline; padding: 14px 16px; gap: 12px;
          border: 1px solid var(--rule); border-radius: var(--r-2);
          background: var(--paper); cursor: pointer;
          transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
        }
        .rm-reg:hover { border-color: var(--ink); }
        .rm-reg[data-active="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
        .rm-reg[data-active="true"] .rm-reg-sub { color: var(--ink-4); }
        .rm-reg-sub { font-family: var(--mono); font-size: 11px; color: var(--ink-3); letter-spacing: 0.06em; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Requirements Map</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
              Every requirement your agents must satisfy.
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '6px 0 0', maxWidth: 540, lineHeight: 1.5 }}>
              {total > 0
                ? `${total} requirements across ${Object.keys(regs).length} regulations. Filter by process or search by citation.`
                : 'Connect the requirements database to see live requirements.'}
            </p>
            <div style={{ marginTop: 12, maxWidth: 420 }}>
              <RegulatorCompactStrip />
            </div>
          </div>
          {stats.length > 0 && (
            <div style={{ display: 'flex', gap: 24 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 26, fontWeight: 300, letterSpacing: '-0.025em', color: 'var(--ink)', lineHeight: 1 }}>{s.value}</div>
                  <div className="eyebrow" style={{ marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search + chips */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search title, text, or citation..."
            style={{ flex: '1 1 260px', maxWidth: 360 }}
          />
          <button className={`rm-chip ${processFilter === null ? 'active' : ''}`} onClick={() => setProcessFilter(null)}>
            All processes
          </button>
          {allProcessTypes.slice(0, 7).map((pt) => (
            <button
              key={pt}
              className={`rm-chip ${processFilter === pt ? 'active' : ''}`}
              onClick={() => setProcessFilter(processFilter === pt ? null : pt)}
            >
              {friendlyProcess(pt)}
            </button>
          ))}
          {allProcessTypes.length > 7 && (
            <span className="eyebrow" style={{ color: 'var(--ink-4)' }}>+{allProcessTypes.length - 7}</span>
          )}
        </div>
      </div>

      {/* Body: split view */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', flex: 1, overflow: 'hidden' }}>
        {/* Left rail: authorities + regulations */}
        <aside style={{ borderRight: '1px solid var(--rule)', overflowY: 'auto', padding: '20px 20px 32px' }}>
          {data.isLoading && (
            <div style={{ padding: 12, color: 'var(--ink-3)', fontSize: 13 }}>Loading...</div>
          )}
          {data.isError && (
            <div style={{ padding: 12, fontSize: 12.5, color: 'var(--err)', border: '1px solid var(--rule-strong)', borderRadius: 'var(--r-2)' }}>
              Requirements database unreachable. Showing process types only.
            </div>
          )}

          {/* Process selector when nothing is filtered yet */}
          {!data.isLoading && !processFilter && !filter && (
            <div style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Filter by process</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {COMMON_PROCESS_TYPES.map(({ key, label }) => {
                  const count = requirementsPerProcessType[key] ?? 0;
                  const available = count > 0;
                  return (
                    <button
                      key={key}
                      className="rm-tile"
                      disabled={!available}
                      onClick={() => { setProcessFilter(key); setSelectedReg(null); setSelectedOb(null); }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{label}</span>
                      <span className="eyebrow">{count} req{count !== 1 ? 's' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredAuthorities.map((authority) => (
            <div key={authority.name} style={{ marginBottom: 24 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{authority.name}</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {authority.regulations.map((regKey) => {
                  const obligations = filteredObligations(regKey);
                  const mand = obligations.filter((o) => o.mandatory).length;
                  const active = selectedReg === regKey;
                  return (
                    <button
                      key={regKey}
                      className="rm-reg"
                      data-active={active}
                      onClick={() => { setSelectedReg(active ? null : regKey); setSelectedOb(null); }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.005em' }}>{regLabel(regKey)}</div>
                        <div className="rm-reg-sub" style={{ marginTop: 2 }}>
                          {obligations.length} req{obligations.length !== 1 ? 's' : ''}{mand > 0 ? ` / ${mand} mandatory` : ''}
                        </div>
                      </div>
                      <span style={{ fontSize: 14, opacity: 0.6 }}>{active ? '−' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredAuthorities.length === 0 && !data.isLoading && (
            <div style={{ padding: 12, fontSize: 13, color: 'var(--ink-3)' }}>
              No requirements match.{' '}
              <button
                onClick={() => { setFilter(''); setProcessFilter(null); }}
                style={{ background: 'none', border: 0, color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13 }}
              >
                Clear
              </button>
            </div>
          )}
        </aside>

        {/* Right pane: requirements list / detail */}
        <main style={{ overflowY: 'auto', padding: '24px 28px 32px' }}>
          {!selectedReg && (
            <div style={{ maxWidth: 620 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Start with intent</div>
              <h2 style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.025em', margin: 0, lineHeight: 1.15 }}>
                What process are you building for?
              </h2>
              <p style={{ marginTop: 12, color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.6 }}>
                Pick a <strong style={{ color: 'var(--ink-2)' }}>process tile</strong> to see only the requirements that
                apply, or open any <strong style={{ color: 'var(--ink-2)' }}>regulation</strong> to browse it whole.
                Every requirement here is bound to its source citation, jurisdiction, required-data list, and
                cross-references — exactly what your agents query at run time.
              </p>
              <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {[
                  { k: 'Citation-bound',  v: 'Each requirement points to its exact paragraph in the source text.' },
                  { k: 'Versioned',       v: 'Older versions stay queryable so you can replay an audit on its date.' },
                  { k: 'Cross-referenced',v: 'ISO, FDA, EU, UK, and IMDRF cross-references are walkable across the map.' },
                  { k: 'Process-aware',   v: 'Each requirement is tagged with the QMS processes it constrains.' },
                ].map((c) => (
                  <div key={c.k} style={{ padding: 14, border: '1px solid var(--rule)', borderRadius: 'var(--r-2)' }}>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>{c.k}</div>
                    <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.5 }}>{c.v}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedReg && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>{regLabel(selectedReg)}</div>
                  <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
                    {selectedObligations.length} requirement{selectedObligations.length !== 1 ? 's' : ''}
                    {processFilter ? ` for ${friendlyProcess(processFilter)}` : ''}
                  </h2>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setSelectedReg(null); setSelectedOb(null); }}
                >
                  Close
                </button>
              </div>

              <div style={{ border: '1px solid var(--rule-strong)', borderRadius: 'var(--r-2)', background: 'var(--paper)' }}>
                {selectedObligations.map((o, i) => (
                  <div
                    key={o.id}
                    className="rm-row"
                    data-active={selectedOb?.id === o.id}
                    onClick={() => setSelectedOb(o)}
                    style={i === 0 ? { borderTop: 0 } : undefined}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: 'var(--ink)', letterSpacing: '-0.005em' }}>
                        {o.title || o.id}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {o.citation && <span>{o.citation}</span>}
                        {o.processType && <span>/ {friendlyProcess(o.processType)}</span>}
                      </div>
                    </div>
                    <span className="eyebrow" style={{ color: o.mandatory ? 'var(--ink)' : 'var(--ink-4)' }}>
                      {o.mandatory ? 'Mandatory' : 'Optional'}
                    </span>
                    <code style={{ fontSize: 10.5, color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{o.id}</code>
                  </div>
                ))}
                {selectedObligations.length === 0 && (
                  <div style={{ padding: 24, color: 'var(--ink-3)', fontSize: 13.5, textAlign: 'center' }}>
                    No requirements match the current filters.
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Detail modal */}
      {selectedOb && (
        <>
          <div
            onClick={() => setSelectedOb(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.36)',
              backdropFilter: 'blur(2px)', zIndex: 1000,
            }}
          />
          <div
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 92vw)',
              background: 'var(--paper)', borderLeft: '1px solid var(--rule-strong)',
              zIndex: 1001, display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow-2)',
            }}
          >
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {selectedReg ? regLabel(selectedReg) : selectedOb.jurisdiction}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.015em', margin: 0, lineHeight: 1.3 }}>
                  {selectedOb.title || selectedOb.id}
                </h3>
                <code style={{ display: 'inline-block', marginTop: 8, fontSize: 11, color: 'var(--ink-4)' }}>{selectedOb.id}</code>
              </div>
              <button
                onClick={() => setSelectedOb(null)}
                style={{ background: 'none', border: 0, fontSize: 18, color: 'var(--ink-3)', cursor: 'pointer', padding: 4, lineHeight: 1 }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div style={{ overflowY: 'auto', padding: '20px 24px 28px' }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Requirement text</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, padding: 14, background: 'var(--paper-deep)', border: '1px solid var(--rule)' }}>
                {selectedOb.text || '(no text on file)'}
              </pre>

              <div className="eyebrow" style={{ margin: '20px 0 8px' }}>Metadata</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 13 }}>
                {selectedOb.citation && (<>
                  <span style={{ color: 'var(--ink-3)' }}>Citation</span>
                  <span style={{ color: 'var(--ink)' }}>{selectedOb.citation}</span>
                </>)}
                {selectedOb.jurisdiction && (<>
                  <span style={{ color: 'var(--ink-3)' }}>Market</span>
                  <span style={{ color: 'var(--ink)' }}>{selectedOb.jurisdiction}</span>
                </>)}
                <span style={{ color: 'var(--ink-3)' }}>Status</span>
                <span style={{ color: 'var(--ink)' }}>{selectedOb.mandatory ? 'Mandatory' : 'Optional'}</span>
                {selectedOb.processType && (<>
                  <span style={{ color: 'var(--ink-3)' }}>Process</span>
                  <span style={{ color: 'var(--ink)' }}>{friendlyProcess(selectedOb.processType)}</span>
                </>)}
                {selectedOb.kind && (<>
                  <span style={{ color: 'var(--ink-3)' }}>Kind</span>
                  <span style={{ color: 'var(--ink)' }}>{selectedOb.kind}</span>
                </>)}
                {selectedOb.artifactType && (<>
                  <span style={{ color: 'var(--ink-3)' }}>Artifact</span>
                  <span style={{ color: 'var(--ink)' }}>{selectedOb.artifactType}</span>
                </>)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default RegulationManager;
