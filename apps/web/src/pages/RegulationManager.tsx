import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/queryClient.js';

/* ─── Types ─── */
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

/* ─── Friendly regulation names (Neo4j-inspired palette) ─── */
const REG_META: Record<string, { label: string; color: string }> = {
  'EU_MDR':       { label: 'EU MDR 2017/745', color: '#0E8CC2' },
  'ISO_13485':    { label: 'ISO 13485:2016', color: '#8b5cf6' },
  'ISO_14971':    { label: 'ISO 14971:2019', color: '#6366f1' },
  'CFR_820':      { label: '21 CFR Part 820', color: '#F96746' },
  'UK_MDR':       { label: 'UK MDR 2002', color: '#5CC3C9' },
  'MDCG_2022_21': { label: 'MDCG 2022-21', color: '#FFA901' },
  'IMDRF_AE':     { label: 'IMDRF Adverse Events', color: '#90CB62' },
  'IMDRF_CODING': { label: 'IMDRF Coding', color: '#6FA646' },
};

/* ─── Common process types with friendly labels ─── */
const COMMON_PROCESS_TYPES = [
  { key: 'PSUR', label: 'PSUR Generation' },
  { key: 'CAPA', label: 'CAPA Management' },
  { key: 'CLINICAL_EVALUATION', label: 'Clinical Evaluation' },
  { key: 'RISK_MANAGEMENT', label: 'Risk Management' },
  { key: 'COMPLAINT', label: 'Complaint Handling' },
  { key: 'DOCUMENT_CONTROL', label: 'Document Control' },
  { key: 'DESIGN_CONTROL', label: 'Design Controls' },
  { key: 'VIGILANCE', label: 'Vigilance Reporting' },
  { key: 'INTERNAL_AUDIT', label: 'Internal Audits' },
  { key: 'PURCHASING', label: 'Supplier Management' },
  { key: 'PMS', label: 'Post-Market Surveillance' },
  { key: 'LABELING', label: 'Technical Documentation' },
];

/* ─── Competent Authorities hierarchy ─── */
interface CompetentAuthority {
  name: string;
  regulations: string[];
}

const COMPETENT_AUTHORITIES: CompetentAuthority[] = [
  { name: 'U.S. FDA', regulations: ['CFR_820'] },
  { name: 'European Commission', regulations: ['EU_MDR', 'MDCG_2022_21'] },
  { name: 'ISO', regulations: ['ISO_13485', 'ISO_14971'] },
  { name: 'UK MHRA', regulations: ['UK_MDR'] },
  { name: 'IMDRF', regulations: ['IMDRF_AE', 'IMDRF_CODING'] },
];

function regLabel(key: string): string {
  return REG_META[key]?.label ?? key.replace(/_/g, ' ');
}
function regColor(key: string): string {
  return REG_META[key]?.color ?? 'var(--text-tertiary)';
}

/* ─── Process type badge colors (Neo4j palette) ─── */
const PROCESS_COLORS: Record<string, string> = {
  CAPA: '#F96746', COMPLAINT: '#FFA901', RISK_MANAGEMENT: '#8b5cf6',
  DESIGN_CONTROL: '#0E8CC2', CLINICAL_EVALUATION: '#6366f1', PMS: '#5CC3C9',
  VIGILANCE: '#F96746', INTERNAL_AUDIT: '#90CB62', DOCUMENT_CONTROL: '#5CC3C9',
  MANAGEMENT_REVIEW: '#8b5cf6', PRODUCTION: '#FFA901', PURCHASING: '#6FA646',
  PSUR: '#FFA901', LABELING: '#6B8A99', NONCONFORMANCE: '#F96746',
  TREND_REPORTING: '#0E8CC2', CHANGE_CONTROL: '#8b5cf6',
};

function processColor(pt: string): string {
  return PROCESS_COLORS[pt] ?? 'var(--text-tertiary)';
}

function friendlyProcess(pt: string): string {
  return pt.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/* ─── Graph node decorative background SVG ─── */
function GraphNodeBg() {
  return (
    <svg
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', opacity: 0.03,
      }}
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Animated graph edges */}
      <g stroke="var(--neo-cyan)" strokeWidth="1" fill="none">
        <line x1="100" y1="150" x2="250" y2="180" />
        <line x1="250" y1="180" x2="400" y2="120" />
        <line x1="400" y1="120" x2="550" y2="200" />
        <line x1="550" y1="200" x2="700" y2="140" />
        <line x1="200" y1="400" x2="350" y2="380" />
        <line x1="350" y1="380" x2="500" y2="450" />
        <line x1="500" y1="450" x2="650" y2="400" />
        <line x1="150" y1="650" x2="300" y2="620" />
        <line x1="300" y1="620" x2="450" y2="700" />
      </g>
      {/* Nodes */}
      <g fill="var(--neo-cyan)">
        <circle cx="100" cy="150" r="3" />
        <circle cx="250" cy="180" r="3" />
        <circle cx="400" cy="120" r="3" />
        <circle cx="550" cy="200" r="3" />
        <circle cx="700" cy="140" r="3" />
        <circle cx="200" cy="400" r="3" />
        <circle cx="350" cy="380" r="3" />
        <circle cx="500" cy="450" r="3" />
        <circle cx="650" cy="400" r="3" />
        <circle cx="150" cy="650" r="3" />
        <circle cx="300" cy="620" r="3" />
        <circle cx="450" cy="700" r="3" />
      </g>
    </svg>
  );
}

/* ─── Main component ─── */
export function RegulationManager() {
  const data = useQuery({
    queryKey: ['obligations-by-regulation'],
    queryFn: () => api<RegulationData>('/api/graph/obligations-by-regulation'),
  });

  const [expandedReg, setExpandedReg] = useState<string | null>(null);
  const [expandedOb, setExpandedOb] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [processFilter, setProcessFilter] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<string | null>(null);

  const rawRegs = data.data?.regulations ?? {};
  const total = data.data?.total ?? 0;

  /* ── Derive regulation key from citation + jurisdiction ── */
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

  /* ── Regroup obligations by regulation (for authority hierarchy) ── */
  const regs = useMemo(() => {
    const allObligations = Object.values(rawRegs).flat();
    const grouped: Record<string, Obligation[]> = {};
    for (const o of allObligations) {
      const key = deriveRegKey(o);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(o);
    }
    return grouped;
  }, [rawRegs]);

  /* ── Collect all process types across all regulations ── */
  const allProcessTypes = useMemo(() => {
    const set = new Set<string>();
    Object.values(regs).forEach(list => list.forEach(o => { if (o.processType) set.add(o.processType); }));
    return [...set].sort();
  }, [regs]);

  /* ── Count requirements per process type ── */
  const requirementsPerProcessType = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(regs).forEach(list =>
      list.forEach(o => {
        if (o.processType) {
          counts[o.processType] = (counts[o.processType] ?? 0) + 1;
        }
      })
    );
    return counts;
  }, [regs]);

  /* ── Filter logic ── */
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
    const list = regs[key] ?? [];
    return list.filter(matchesObligation);
  }

  /* ── Build filtered authorities and regulations ── */
  const filteredAuthorities = useMemo(() => {
    return COMPETENT_AUTHORITIES.map(authority => {
      const regulationsInAuth = authority.regulations.filter(regKey => {
        const obligations = filteredObligations(regKey);
        if (obligations.length === 0) return false;
        if (!processFilter && lowerFilter && !regLabel(regKey).toLowerCase().includes(lowerFilter)) {
          return true;
        }
        return true;
      });

      return {
        ...authority,
        regulations: regulationsInAuth,
        hasContent: regulationsInAuth.length > 0,
      };
    }).filter(auth => auth.hasContent);
  }, [regs, lowerFilter, processFilter]);

  /* ── Stats ── */
  const mandatoryCount = useMemo(() => {
    let count = 0;
    Object.values(regs).forEach(list => list.forEach(o => { if (o.mandatory) count++; }));
    return count;
  }, [regs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative' }}>

      {/* ── Decorative graph background ── */}
      <GraphNodeBg />

      {/* ── Header ── */}
      <div style={{
        padding: '24px 32px 20px', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-root)', flexShrink: 0,
        position: 'relative', zIndex: 10,
      }}>
        {/* Accent top line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--neo-cyan), var(--accent-bright), var(--neo-green))',
          boxShadow: '0 0 24px rgba(14,140,194,0.3)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Requirements
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>
              Every requirement your AI-generated documents are checked against.
            </p>
          </div>

          {/* Stats with glowing animation */}
          {total > 0 && (
            <div style={{ display: 'flex', gap: 28 }}>
              {[
                { value: total, label: 'requirements', color: 'var(--neo-cyan)' },
                { value: Object.keys(regs).length, label: 'regulations', color: 'var(--neo-green)' },
                { value: mandatoryCount, label: 'mandatory', color: 'var(--neo-hibiscus)' },
                { value: allProcessTypes.length, label: 'process types', color: 'var(--neo-marigold)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontSize: 32, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4,
                    textShadow: `0 0 16px ${s.color}40`,
                    animation: 'pulse-glow 3s ease-in-out infinite',
                  }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search + process filter */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search requirements, citations, or regulations…"
            style={{
              flex: 1, maxWidth: 420,
              padding: '10px 16px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
              color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
          />
          {allProcessTypes.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={() => setProcessFilter(null)}
                style={{
                  padding: '4px 12px', fontSize: 11, borderRadius: 6,
                  border: processFilter === null ? '1px solid var(--text-primary)' : '1px solid var(--border-subtle)',
                  background: processFilter === null ? 'var(--text-primary)' : 'transparent',
                  color: processFilter === null ? 'var(--bg-root)' : 'var(--text-muted)',
                  cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: processFilter === null ? 600 : 400,
                  transition: 'all 0.2s',
                }}
              >All</button>
              {allProcessTypes.slice(0, 7).map(pt => (
                <button
                  key={pt}
                  onClick={() => setProcessFilter(processFilter === pt ? null : pt)}
                  style={{
                    padding: '4px 12px', fontSize: 11, borderRadius: 6,
                    border: processFilter === pt ? `1px solid ${processColor(pt)}` : '1px solid var(--border-subtle)',
                    background: processFilter === pt ? processColor(pt) + '18' : 'transparent',
                    color: processFilter === pt ? processColor(pt) : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: processFilter === pt ? 600 : 400,
                    transition: 'all 0.2s',
                  }}
                >{friendlyProcess(pt)}</button>
              ))}
              {allProcessTypes.length > 7 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px' }}>
                  +{allProcessTypes.length - 7}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content + Drawer Layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 5 }}>

        {/* ── Main Content ── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>

          {data.isLoading && (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading requirements…</div>
            </div>
          )}

          {data.isError && (
            <div style={{
              padding: '12px 16px', marginBottom: 16, borderRadius: 8,
              background: '#ef444410', border: '1px solid #ef444430',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#ef4444' }}>
                Not connected to the requirement database — showing available process types. Connect your database to see live data.
              </span>
            </div>
          )}

          {/* ── Guided entry point: "What is your agent doing?" — RADIAL/HONEYCOMB ── */}
          {!data.isLoading && !processFilter && !filter && (
            <div style={{ marginBottom: 48 }}>
              <div style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                  What document are you generating?
                </h2>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  Select a QMS process to see which requirements Smarticus checks for that document type.
                </p>
              </div>

              {/* Honeycomb-inspired layout with radial arrangement */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 16,
                maxWidth: '1000px',
              }}>
                {COMMON_PROCESS_TYPES.map(({ key, label }) => {
                  const count = requirementsPerProcessType[key] ?? 0;
                  const isAvailable = count > 0;
                  const color = processColor(key);

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (isAvailable) {
                          setProcessFilter(key);
                          setFilter('');
                          setExpandedReg(null);
                          setExpandedOb(null);
                          setDrawerOpen(null);
                        }
                      }}
                      disabled={!isAvailable}
                      style={{
                        padding: '20px 16px',
                        borderRadius: '12px',
                        border: isAvailable ? `2px solid ${color}40` : '2px solid var(--border-subtle)',
                        background: isAvailable ? `${color}08` : 'var(--bg-root)',
                        cursor: isAvailable ? 'pointer' : 'not-allowed',
                        fontFamily: 'var(--font-sans)',
                        textAlign: 'center',
                        transition: 'all 0.25s',
                        opacity: isAvailable ? 1 : 0.4,
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                      onMouseEnter={(e) => {
                        if (isAvailable) {
                          e.currentTarget.style.background = `${color}12`;
                          e.currentTarget.style.borderColor = color;
                          e.currentTarget.style.boxShadow = `0 0 20px ${color}20`;
                          e.currentTarget.style.transform = 'scale(1.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isAvailable) {
                          e.currentTarget.style.background = `${color}08`;
                          e.currentTarget.style.borderColor = `${color}40`;
                          e.currentTarget.style.boxShadow = 'none';
                          e.currentTarget.style.transform = 'scale(1)';
                        }
                      }}
                    >
                      {/* Glow indicator dot */}
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', margin: '0 auto 12px',
                        background: color, boxShadow: `0 0 12px ${color}60`,
                      }} />
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isAvailable ? 'var(--text-primary)' : 'var(--text-muted)',
                        marginBottom: 6,
                        lineHeight: 1.3,
                      }}>
                        {label}
                      </div>
                      <div style={{
                        fontSize: 10,
                        color: isAvailable ? color : 'var(--text-muted)',
                        fontWeight: 500,
                      }}>
                        {count} req{count !== 1 ? 's' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{
                marginTop: 28,
                paddingTop: 24,
                borderTop: '1px solid var(--border-subtle)',
              }}>
                <button
                  onClick={() => {
                    setFilter('');
                    setProcessFilter(null);
                    setExpandedReg(null);
                    setExpandedOb(null);
                    setDrawerOpen(null);
                  }}
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    textDecoration: 'underline',
                    padding: 0,
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  {total > 0 ? `Show all ${total} requirements` : 'Browse all requirements'}
                </button>
              </div>
            </div>
          )}

          {filteredAuthorities.length === 0 && !data.isLoading && !data.isError && (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                {filter || processFilter ? 'No requirements match your search.' : 'No requirements in the knowledge base yet.'}
              </div>
            </div>
          )}

          {/* ── Process filter context ── */}
          {processFilter && !data.isLoading && filteredAuthorities.length > 0 && (
            <div style={{
              marginBottom: 28,
              padding: '14px 18px',
              borderRadius: 8,
              background: `${processColor(processFilter)}08`,
              border: `1px solid ${processColor(processFilter)}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Showing <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {Object.values(regs).flat().filter(o => o.processType === processFilter).length} requirements
                </strong> for <strong style={{ color: processColor(processFilter), fontWeight: 600 }}>
                  {friendlyProcess(processFilter)}
                </strong>
              </div>
              <button
                onClick={() => {
                  setProcessFilter(null);
                  setFilter('');
                  setExpandedReg(null);
                  setExpandedOb(null);
                  setDrawerOpen(null);
                }}
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Clear filter
              </button>
            </div>
          )}

          {/* ── Competent Authorities sections ── */}
          {filteredAuthorities.map((authority) => (
            <div key={authority.name} style={{ marginBottom: 40 }}>
              {/* Authority header with node indicator */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--neo-cyan)',
                marginBottom: 18, paddingBottom: 12,
                borderBottom: '1px solid var(--border-subtle)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: 'var(--neo-cyan)', boxShadow: '0 0 12px rgba(92,195,201,0.5)',
                }} />
                {authority.name}
              </div>

              {/* Regulations grid — hexagonal/node style */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: 18,
              }}>
                {authority.regulations.map((regKey) => {
                  const obligations = filteredObligations(regKey);
                  const isExpanded = expandedReg === regKey;
                  const color = regColor(regKey);
                  const mandCount = obligations.filter(o => o.mandatory).length;

                  return (
                    <div
                      key={regKey}
                      style={{
                        borderRadius: 'var(--radius-lg)',
                        border: `1px solid ${color}30`,
                        background: `${color}05`,
                        overflow: 'hidden',
                        transition: 'all 0.3s',
                        position: 'relative',
                        boxShadow: `0 0 24px ${color}08`,
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.borderColor = `${color}60`;
                        el.style.boxShadow = `0 0 32px ${color}15`;
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.borderColor = `${color}30`;
                        el.style.boxShadow = `0 0 24px ${color}08`;
                      }}
                    >
                      {/* Accent glow top bar */}
                      <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                        background: color, boxShadow: `0 0 12px ${color}80`,
                      }} />

                      {/* Regulation card header */}
                      <button
                        onClick={() => { setExpandedReg(isExpanded ? null : regKey); setExpandedOb(null); setDrawerOpen(null); }}
                        style={{
                          display: 'flex', alignItems: 'center', width: '100%',
                          padding: '18px 18px', gap: 14,
                          background: 'transparent',
                          border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                          textAlign: 'left', transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Node indicator — hexagonal/circular glow */}
                        <div style={{
                          width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                          background: color, boxShadow: `0 0 12px ${color}70, inset 0 0 8px ${color}40`,
                        }} />

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                            {regLabel(regKey)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {obligations.length} requirement{obligations.length !== 1 ? 's' : ''}
                            {mandCount > 0 && ` · ${mandCount} mandatory`}
                          </div>
                        </div>

                        <span style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          transform: isExpanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.2s', flexShrink: 0,
                        }}>▶</span>
                      </button>

                      {/* Process type badges */}
                      <div style={{
                        display: 'flex', gap: 4, flexWrap: 'wrap',
                        padding: '0 18px 14px',
                      }}>
                        {[...new Set(obligations.map(o => o.processType).filter(Boolean))].slice(0, 3).map(pt => (
                          <span key={pt} style={{
                            fontSize: 9, padding: '3px 8px', borderRadius: 4,
                            background: processColor(pt) + '20',
                            color: processColor(pt), fontWeight: 500,
                          }}>{friendlyProcess(pt)}</span>
                        ))}
                      </div>

                      {/* ── Expanded: requirements list ── */}
                      {isExpanded && obligations.length > 0 && (
                        <div style={{
                          borderTop: `1px solid ${color}20`,
                          background: 'var(--bg-root)',
                          maxHeight: '320px',
                          overflowY: 'auto',
                        }}>
                          {obligations.map((o, idx) => {
                            const isOpen = expandedOb === o.id;

                            return (
                              <div
                                key={o.id}
                                style={{
                                  borderTop: idx > 0 ? `1px solid var(--border-subtle)` : 'none',
                                }}
                              >
                                <button
                                  onClick={() => { setExpandedOb(isOpen ? null : o.id); setDrawerOpen(isOpen ? null : o.id); }}
                                  style={{
                                    display: 'flex', alignItems: 'flex-start', width: '100%',
                                    padding: '12px 16px', gap: 10,
                                    background: isOpen ? 'var(--bg-active)' : 'transparent',
                                    border: 'none', cursor: 'pointer',
                                    fontFamily: 'var(--font-sans)', textAlign: 'left',
                                    transition: 'background 0.1s',
                                  }}
                                >
                                  {/* Mandatory indicator */}
                                  <span style={{
                                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 6,
                                    background: o.mandatory ? 'var(--neo-hibiscus)' : 'var(--border-default)',
                                    boxShadow: o.mandatory ? '0 0 8px rgba(249,103,70,0.5)' : 'none',
                                  }} title={o.mandatory ? 'Mandatory' : 'Optional'} />

                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>
                                      {o.title || o.id}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                      {o.citation && <span>{o.citation}</span>}
                                      {o.processType && (
                                        <span style={{
                                          fontSize: 9, padding: '1px 5px', borderRadius: 2,
                                          background: processColor(o.processType) + '14',
                                          color: processColor(o.processType), fontWeight: 500,
                                        }}>{friendlyProcess(o.processType)}</span>
                                      )}
                                    </div>
                                  </div>

                                  <code style={{
                                    fontSize: 9, fontFamily: 'var(--font-mono)',
                                    color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap',
                                  }}>{o.id}</code>
                                </button>

                                {/* Expanded detail — shown inline briefly, then in drawer for details */}
                                {isOpen && (
                                  <div style={{
                                    padding: '12px 16px 16px',
                                    background: 'var(--bg-elevated)',
                                  }}>
                                    {/* Requirement text */}
                                    <div style={{
                                      fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
                                      padding: '10px 12px', borderRadius: 4,
                                      background: 'var(--bg-root)', border: '1px solid var(--border-subtle)',
                                      whiteSpace: 'pre-wrap', marginBottom: 10,
                                    }}>
                                      {o.text}
                                    </div>

                                    {/* Metadata */}
                                    <div style={{
                                      display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px',
                                      fontSize: 11,
                                    }}>
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>ID</span>
                                      <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', fontSize: 10 }}>{o.id}</code>

                                      {o.citation && <>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Citation</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{o.citation}</span>
                                      </>}

                                      {o.jurisdiction && <>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Market</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{o.jurisdiction}</span>
                                      </>}

                                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Status</span>
                                      <span style={{ color: o.mandatory ? '#ef4444' : 'var(--text-secondary)', fontWeight: o.mandatory ? 600 : 400 }}>
                                        {o.mandatory ? 'Mandatory' : 'Optional'}
                                      </span>

                                      {o.processType && <>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Process</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{friendlyProcess(o.processType)}</span>
                                      </>}

                                      {o.kind && <>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Kind</span>
                                        <span style={{ color: 'var(--text-secondary)' }}>{o.kind}</span>
                                      </>}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Right Drawer Overlay (Glassmorphism) ── */}
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.3)', zIndex: 1000,
                animation: 'fade-in 0.2s',
              }}
              onClick={() => setDrawerOpen(null)}
            />

            {/* Drawer panel */}
            <div
              style={{
                position: 'absolute', top: 0, right: 0, bottom: 0, width: '360px',
                background: 'rgba(8,30,43,0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-subtle)',
                borderLeft: '1px solid rgba(92,195,201,0.2)',
                zIndex: 1001,
                display: 'flex', flexDirection: 'column',
                boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
                animation: 'slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                  Requirement details for: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--neo-cyan)' }}>{drawerOpen}</code>
                </p>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Full obligation details would render here in a zen-like minimalist layout with enhanced readability.
                </div>
              </div>

              <button
                onClick={() => setDrawerOpen(null)}
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                Close ×
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── CSS Animations (injected via style tag) ── */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { text-shadow: 0 0 16px rgba(14, 140, 194, 0.4); }
          50% { text-shadow: 0 0 24px rgba(14, 140, 194, 0.8); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
