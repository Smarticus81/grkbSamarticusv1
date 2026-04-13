import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';
import { SmarticusLogo, ThinkertonLogo } from '../components/ui/logos.js';

/* ---- Regulatory body badges for the ribbon ---- */
/* Each entry uses a recognizable SVG icon representing the issuing body */
function RegBadge({ body }: { body: typeof REGULATORY_BODIES[number] }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      {body.shape === 'eu-stars' && (
        /* EU flag stars circle */
        <>
          <circle cx="18" cy="18" r="16" stroke={body.color} strokeWidth="1.5" fill={`${body.color}10`} />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 - 90) * Math.PI / 180;
            const cx = 18 + 11 * Math.cos(angle);
            const cy = 18 + 11 * Math.sin(angle);
            return <circle key={i} cx={cx} cy={cy} r="1.5" fill={body.color} />;
          })}
          <text x="18" y="21" textAnchor="middle" fontSize="8" fontWeight="700" fill={body.color} fontFamily="var(--font-sans)">EU</text>
        </>
      )}
      {body.shape === 'iso-globe' && (
        /* ISO globe/ring mark */
        <>
          <circle cx="18" cy="18" r="14" stroke={body.color} strokeWidth="1.5" fill="none" />
          <ellipse cx="18" cy="18" rx="8" ry="14" stroke={body.color} strokeWidth="1" fill="none" opacity="0.5" />
          <line x1="4" y1="18" x2="32" y2="18" stroke={body.color} strokeWidth="1" opacity="0.4" />
          <text x="18" y="21" textAnchor="middle" fontSize="7" fontWeight="700" fill={body.color} fontFamily="var(--font-mono)">ISO</text>
        </>
      )}
      {body.shape === 'fda-shield' && (
        /* FDA shield */
        <>
          <path d="M18 3L4 9v9c0 8.4 5.95 16.2 14 18.6 8.05-2.4 14-10.2 14-18.6V9L18 3Z" stroke={body.color} strokeWidth="1.5" fill={`${body.color}10`} />
          <text x="18" y="22" textAnchor="middle" fontSize="8" fontWeight="800" fill={body.color} fontFamily="var(--font-sans)">FDA</text>
        </>
      )}
      {body.shape === 'uk-crown' && (
        /* UK crown simplified */
        <>
          <circle cx="18" cy="18" r="15" stroke={body.color} strokeWidth="1.5" fill={`${body.color}10`} />
          <path d="M11 22L13 13L18 17L23 13L25 22Z" stroke={body.color} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          <circle cx="18" cy="11" r="2" fill={body.color} />
          <text x="18" y="28" textAnchor="middle" fontSize="5" fontWeight="600" fill={body.color} fontFamily="var(--font-sans)">MHRA</text>
        </>
      )}
      {body.shape === 'imdrf-globe' && (
        /* IMDRF interlocking rings */
        <>
          <circle cx="14" cy="18" r="10" stroke={body.color} strokeWidth="1.5" fill="none" />
          <circle cx="22" cy="18" r="10" stroke={body.color} strokeWidth="1.5" fill="none" opacity="0.6" />
          <text x="18" y="21" textAnchor="middle" fontSize="5.5" fontWeight="700" fill={body.color} fontFamily="var(--font-mono)">IMDRF</text>
        </>
      )}
      {body.shape === 'mdcg-hex' && (
        /* MDCG hexagon */
        <>
          <polygon points="18,3 32,10.5 32,25.5 18,33 4,25.5 4,10.5" stroke={body.color} strokeWidth="1.5" fill={`${body.color}10`} />
          <text x="18" y="20" textAnchor="middle" fontSize="6" fontWeight="700" fill={body.color} fontFamily="var(--font-mono)">MDCG</text>
        </>
      )}
      {body.shape === 'iec-bolt' && (
        /* IEC lightning bolt in circle */
        <>
          <circle cx="18" cy="18" r="15" stroke={body.color} strokeWidth="1.5" fill={`${body.color}10`} />
          <path d="M20 6L12 20h6l-2 14 10-16h-6l2-12Z" fill={body.color} opacity="0.7" />
        </>
      )}
    </svg>
  );
}

const REGULATORY_BODIES = [
  { abbr: 'EU MDR', name: 'EU Medical Device Regulation', color: '#5CC3C9', shape: 'eu-stars' as const },
  { abbr: 'ISO 13485', name: 'Quality Management Systems', color: '#90CB62', shape: 'iso-globe' as const },
  { abbr: 'ISO 14971', name: 'Risk Management', color: '#FFA901', shape: 'iso-globe' as const },
  { abbr: '21 CFR 820', name: 'FDA Quality System Regulation', color: '#F96746', shape: 'fda-shield' as const },
  { abbr: 'UK MDR', name: 'UK Medical Devices Regulations', color: '#5CC3C9', shape: 'uk-crown' as const },
  { abbr: 'IMDRF', name: 'International Medical Device Regulators Forum', color: '#90CB62', shape: 'imdrf-globe' as const },
  { abbr: 'MDCG', name: 'Medical Device Coordination Group', color: '#FFA901', shape: 'mdcg-hex' as const },
  { abbr: 'IEC 62304', name: 'Medical Device Software Lifecycle', color: '#F96746', shape: 'iec-bolt' as const },
];

/* ---- Modal component ---- */
function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
        background: 'rgba(1, 18, 28, 0.80)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          maxWidth: 720, width: '100%', maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 40px var(--accent-glow)',
          animation: 'fadeIn 0.3s cubic-bezier(.4,0,.2,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1,
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1,
          }}>{String.fromCharCode(0x2715)}</button>
        </div>
        <div style={{ padding: '28px' }}>{children}</div>
      </div>
    </div>
  );
}

/* ---- Modal: How It Works ---- */
function HowItWorksContent() {
  const steps = [
    { title: 'Checks the rules first', desc: 'Before generating anything, Smarticus identifies exactly which regulations and requirements apply to your document, device class, and target market.' },
    { title: 'Generates your document', desc: 'AI writes your QMS document \u2014 PSUR, CAPA, risk analysis, clinical evaluation \u2014 with every applicable requirement built into the process.' },
    { title: 'Validates every section', desc: 'Each section is automatically checked against the specific regulatory requirements it must satisfy. Failed checks are flagged and corrected.' },
    { title: 'Creates your audit trail', desc: 'Every decision the AI made is recorded \u2014 what it decided, why, and which regulation supports it. Hand this to your auditor with confidence.' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {steps.map((step, i) => (
        <div key={i} style={{
          display: 'flex', gap: 16, alignItems: 'flex-start',
          padding: '16px 20px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
            background: 'var(--accent-muted)', border: '1px solid var(--accent-bright)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'var(--accent-bright)',
            fontFamily: 'var(--font-mono)',
          }}>{i + 1}</div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{step.title}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>{step.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Modal: Why Trust It ---- */
function WhyTrustContent() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ padding: '24px', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, color: 'var(--neo-cyan)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{`1. Smarticus checks which regulations apply
   \u2192 EU MDR, MDCG 2022-21, ISO 14971

2. AI generates your PSUR sections
   \u2192 Complaint trends, risk analysis, conclusions

3. Every section is validated against requirements
   \u2192 23 requirements checked, 23 passed \u2713

4. Complete audit trail created automatically
   \u2192 Ready for your Notified Body review`}</pre>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
        PSURs, CAPAs, risk analyses, clinical evaluations — Smarticus generates compliant QMS documents using AI, then automatically checks every section against the applicable regulations.
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
        What used to take your team weeks now takes minutes. And your auditor gets a complete decision trail for every document.
      </p>
    </div>
  );
}

/* ---- Modal: Coverage ---- */
function CoverageContent() {
  const regs = [
    { name: 'EU MDR 2017/745', count: 47, color: 'var(--neo-cyan)' },
    { name: 'ISO 13485:2016', count: 53, color: 'var(--neo-green)' },
    { name: 'ISO 14971:2019', count: 44, color: 'var(--neo-marigold)' },
    { name: '21 CFR Part 820', count: 62, color: 'var(--neo-hibiscus)' },
    { name: 'UK MDR 2002', count: 45, color: 'var(--neo-cyan)' },
    { name: 'IMDRF', count: 28, color: 'var(--neo-green)' },
    { name: 'MDCG 2022-21', count: 18, color: 'var(--neo-marigold)' },
    { name: 'Custom', count: 6, color: 'var(--neo-hibiscus)' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {regs.map(r => (
          <div key={r.name} style={{
            padding: '16px 20px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: r.color }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.count}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '16px 20px', borderRadius: 'var(--radius-md)', background: 'var(--accent-muted)', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--neo-green)', fontFamily: 'var(--font-mono)' }}>8</span>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 8 }}>regulations covered across 5 markets</span>
      </div>
    </div>
  );
}

/* ============ MAIN LANDING PAGE ============ */
function LandingPage() {
  const [, navigate] = useLocation();
  const [modal, setModal] = useState<'how' | 'trust' | 'coverage' | null>(null);
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: 'var(--bg-root)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes linePulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.6; } }
        @keyframes orbFloat { 0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; } 50% { transform: translateY(-30px) scale(1.05); opacity: 0.6; } }
        @keyframes ribbonScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .lp-line { stroke: var(--neo-cyan); stroke-width: 1; opacity: 0.4; animation: linePulse 4s ease-in-out infinite; }
        .lp-line:nth-child(2) { animation-delay: 0.4s; }
        .lp-line:nth-child(3) { animation-delay: 0.8s; }
        .lp-line:nth-child(4) { animation-delay: 1.2s; }
        .lp-line:nth-child(5) { animation-delay: 1.6s; }
        .lp-node1 { animation: orbFloat 8s ease-in-out infinite; }
        .lp-node2 { animation: orbFloat 10s ease-in-out infinite reverse; }
        .lp-node3 { animation: orbFloat 12s ease-in-out infinite; }
        .lp-node4 { animation: orbFloat 9s ease-in-out infinite reverse; }
        .lp-node5 { animation: orbFloat 11s ease-in-out infinite; }
        .lp-btn-primary { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .lp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(14, 140, 194, 0.6); }
        .lp-btn-outline { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .lp-btn-outline:hover { border-color: var(--accent-bright); color: var(--accent-bright); background: rgba(14, 140, 194, 0.08); }
        .lp-nav-btn { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .lp-nav-btn:hover { background: var(--bg-surface); border-color: var(--accent-bright); color: var(--accent-bright); }
        .lp-card { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; }
        .lp-card:hover { border-color: var(--accent-bright); transform: translateY(-4px); box-shadow: 0 8px 32px rgba(14, 140, 194, 0.15); }
        @media (max-width: 768px) {
          .lp-cards { flex-direction: column !important; }
          .lp-cta { flex-direction: column !important; width: 100% !important; }
          .lp-cta button { width: 100%; }
          .lp-stats { flex-wrap: wrap !important; gap: 1rem !important; padding: 1rem !important; }
        }
      `}</style>

      {/* ---- Nav ---- */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 64, zIndex: 1000,
        backdropFilter: 'blur(12px)', background: 'rgba(1, 18, 28, 0.85)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div style={{ width: '100%', height: '100%', maxWidth: 1200, margin: '0 auto', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SmarticusLogo size={28} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Smarticus</span>
              <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>by Thinkertons</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <ThemeToggle />
            <button className="lp-nav-btn" style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/app')}>
              Open Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* ---- Hero ---- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: 84, paddingBottom: 40 }}>
        {/* Background nodes */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <svg style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.3 }} viewBox="0 0 1200 800" preserveAspectRatio="none">
            <line x1="100" y1="100" x2="400" y2="200" className="lp-line" />
            <line x1="400" y1="200" x2="700" y2="150" className="lp-line" />
            <line x1="700" y1="150" x2="900" y2="300" className="lp-line" />
            <line x1="100" y1="600" x2="500" y2="550" className="lp-line" />
            <line x1="500" y1="550" x2="800" y2="600" className="lp-line" />
          </svg>
          <div className="lp-node1" style={{ position: 'absolute', width: 80, height: 80, top: '15%', left: '8%', borderRadius: '50%', border: '2px solid var(--neo-cyan)', opacity: 0.4 }} />
          <div className="lp-node2" style={{ position: 'absolute', width: 120, height: 120, top: '50%', right: '10%', borderRadius: '50%', border: '2px solid var(--neo-green)', opacity: 0.4 }} />
          <div className="lp-node3" style={{ position: 'absolute', width: 60, height: 60, bottom: '20%', left: '12%', borderRadius: '50%', border: '2px solid var(--neo-marigold)', opacity: 0.4 }} />
          <div className="lp-node4" style={{ position: 'absolute', width: 100, height: 100, top: '10%', right: '25%', borderRadius: '50%', border: '2px solid var(--neo-hibiscus)', opacity: 0.4 }} />
          <div className="lp-node5" style={{ position: 'absolute', width: 70, height: 70, bottom: '25%', right: '20%', borderRadius: '50%', border: '2px solid var(--accent-bright)', opacity: 0.4 }} />
        </div>

        {/* Hero text */}
        <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', maxWidth: 700, padding: '0 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 'clamp(36px, 5.5vw, 60px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 1.5rem' }}>
            Generate QMS documents in{' '}
            <span style={{ background: 'linear-gradient(135deg, var(--neo-cyan), var(--accent-bright))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>minutes, not months</span>
            {' \u2014 '}and trust every word.
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 18, color: 'var(--text-secondary)', margin: '0 0 2.5rem', lineHeight: 1.5, maxWidth: 580 }}>
            AI-powered QMS that knows EU MDR, ISO 13485, 21 CFR 820, and 5 more regulations by heart. Every output is validated. Every decision is audit-ready.
          </p>

          {/* CTA */}
          <div className="lp-cta" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            <button className="lp-btn-primary" style={{ padding: '12px 28px', borderRadius: 'var(--radius-md)', border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-bright))', color: 'white', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 16px rgba(14, 140, 194, 0.4)' }} onClick={() => navigate('/app')}>
              Open Dashboard
            </button>
            <button className="lp-btn-outline" style={{ padding: '12px 28px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/app/api-access')}>
              Connect Your Tools
            </button>
          </div>

          {/* Feature cards */}
          <div className="lp-cards" style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 680, marginBottom: '2.5rem' }}>
            {[
              { key: 'how' as const, label: 'How It Works', icon: '\u2B21', desc: '4-step grounded AI pipeline' },
              { key: 'trust' as const, label: 'Why Trust It', icon: '\u25C7', desc: 'Validated & audit-ready' },
              { key: 'coverage' as const, label: 'Coverage', icon: '\u27C1', desc: '8 regulations, 5 markets' },
            ].map(card => (
              <div key={card.key} className="lp-card" style={{ flex: 1, padding: 20, borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', backdropFilter: 'blur(8px)', textAlign: 'left', cursor: 'pointer' }} onClick={() => setModal(card.key)}>
                <div style={{ fontSize: 18, marginBottom: 8, opacity: 0.7, color: 'var(--neo-cyan)' }}>{card.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{card.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{card.desc}</div>
              </div>
            ))}
          </div>

          {/* Stats strip -- now in normal flow, not absolute */}
          <div className="lp-stats" style={{ display: 'flex', gap: '3rem', padding: '1.25rem 2rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', backdropFilter: 'blur(10px)' }}>
            {[
              { value: '8', label: 'Regulations', color: 'var(--neo-cyan)' },
              { value: '5', label: 'Markets', color: 'var(--neo-green)' },
              { value: '303', label: 'Requirements', color: 'var(--text-secondary)' },
              { value: '23', label: 'QMS Processes', color: 'var(--text-secondary)' },
            ].map(stat => (
              <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: stat.color }}>{stat.value}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' as const, color: 'var(--text-muted)' }}>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- Regulatory Body Ribbon ---- */}
      <div style={{ overflow: 'hidden', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', padding: '18px 0', background: 'var(--bg-elevated)' }}>
        <div style={{ display: 'flex', gap: 40, animation: 'ribbonScroll 30s linear infinite', width: 'max-content' }}>
          {[...REGULATORY_BODIES, ...REGULATORY_BODIES].map((body, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, padding: '0 8px' }}>
              <RegBadge body={body} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{body.abbr}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{body.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Footer ---- */}
      <div style={{ padding: '1.5rem 2rem', textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
          <ThinkertonLogo size={18} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)' }}>A Thinkertons Product</span>
        </div>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--text-muted)' }}>{'\u00A9'} 2026 Thinkertons. Smarticus {'\u2014'} compliant AI for medical devices and pharma.</span>
      </div>

      {/* ---- Modals ---- */}
      <Modal open={modal === 'how'} onClose={closeModal} title="How It Works"><HowItWorksContent /></Modal>
      <Modal open={modal === 'trust'} onClose={closeModal} title="Why Trust Smarticus"><WhyTrustContent /></Modal>
      <Modal open={modal === 'coverage'} onClose={closeModal} title="Regulatory Coverage"><CoverageContent /></Modal>
    </div>
  );
}

export { LandingPage };
export default LandingPage;
