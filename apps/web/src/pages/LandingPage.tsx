import { useLocation } from 'wouter';
import { RegulatorHeroRail } from '../components/ui/RegulatorAssets.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';
import { SmarticusWordmark, SmarticusMark, SmarticusByThinkertonsLockup } from '../components/ui/logos.js';
import { REGULATIONS, REG_COUNT, OBLIGATION_COUNT } from '../lib/coverage.js';

/* ── Featured product rows (Mistral-style alternating showcase) ── */
const PRODUCTS: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  cta: { label: string; to: string };
  visual: 'psur' | 'complaints' | 'imdrf' | 'graph';
  before: string;
  after: string;
}[] = [
  {
    eyebrow: 'Authoring',
    title: 'PSUR Compiler.',
    body: 'A full PSUR draft under MDCG 2022-21 in about ten minutes. Sections, required data, citations, and a coverage matrix.',
    bullets: [
      'MDCG 2022-21 section structure',
      'Cross-references to EU MDR Articles 85 and 86',
      'Required data pulled from your QMS, never stored by us',
      'Citations on every claim',
    ],
    cta: { label: 'Open in sandbox', to: '/app' },
    visual: 'psur',
    before: 'A PSUR draft with unsupported claims and manual citation cleanup.',
    after: 'A PSUR draft structured to MDCG 2022-21, checked against EU MDR Articles 83\u201386, with required data coverage and traceable citations.',
  },
  {
    eyebrow: 'Vigilance',
    title: 'Complaint Scheduler.',
    body: 'Triage incoming complaints against the timelines that actually apply to them. EU MDR, 21 CFR 820, and ISO 13485 in one queue.',
    bullets: [
      'EU MDR Article 87 reporting clocks',
      '21 CFR 803 MDR decisioning',
      'ISO 13485 \u00a78.2.2 required data trail',
      'Auto-coded with IMDRF Annex A through G',
    ],
    cta: { label: 'Open in sandbox', to: '/app' },
    visual: 'complaints',
    before: 'A spreadsheet triage with deadlines tracked manually across three regulations.',
    after: 'A single queue with SLA clocks mapped to EU MDR Art. 87, 21 CFR 803, and ISO 13485 \u00a78.2.2, with coded rationale.',
  },
  {
    eyebrow: 'Coding',
    title: 'IMDRF Auto-Coder.',
    body: 'Adverse-event narratives in. IMDRF codes out. Annexes A through G, with rationale and confidence on every code.',
    bullets: [
      'Annex A through G coverage',
      'Rationale and confidence per code',
      'Reviewable in the sandbox before connecting to production',
      'Versioned against IMDRF terminology releases',
    ],
    cta: { label: 'Open in sandbox', to: '/app' },
    visual: 'imdrf',
    before: 'Manual IMDRF coding with inconsistent annex coverage and no confidence scores.',
    after: 'Automated codes across Annexes A\u2013G with rationale, confidence, and version-locked terminology.',
  },
  {
    eyebrow: 'The requirements engine',
    title: 'One map. Eight regulations. Every relationship.',
    body: 'Your agents query Smarticus instead of re-reading the regulation. The requirements engine holds the requirements, the cross-references, the required data types, and the constraints \u2014 versioned, citable, and replayable.',
    bullets: [
      `${OBLIGATION_COUNT} requirements across ${REG_COUNT} regulations and standards`,
      'Walks chains like ISO 13485 \u00a78.5.2 \u2192 820.100 \u2192 EU MDR Annex IX',
      'Versioned to the source date so an audit can be replayed',
      'Smarticus never sees your proprietary data',
    ],
    cta: { label: 'Browse the requirements', to: '/app/requirements' },
    visual: 'graph',
    before: 'Agents that parse PDF regulations at runtime with no cross-reference awareness.',
    after: 'Requirement-aware agents that query a versioned map of requirements, constraints, required data types, and cross-references in milliseconds.',
  },
];

/* ── SVG visuals (paper-and-ink with orange accent) ── */
function VisualPSUR() {
  return (
    <svg viewBox="0 0 480 320" width="100%" height="100%" fill="none">
      <rect width="480" height="320" fill="var(--paper)" />
      <rect x="40" y="32" width="240" height="256" rx="4" stroke="var(--ink)" strokeWidth="1.2" fill="var(--paper)" />
      <rect x="56" y="52" width="160" height="10" fill="var(--ink)" />
      <rect x="56" y="74" width="120" height="6" fill="var(--ink-3)" />
      {[100, 116, 132, 148, 164, 180, 196].map((y) => (
        <rect key={y} x="56" y={y} width="208" height="4" fill="var(--ink-4)" rx="1" />
      ))}
      <rect x="56" y="216" width="80" height="36" rx="2" fill="var(--orange)" />
      <text x="96" y="239" textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="#fff" letterSpacing="0.1em">SECTION 7</text>
      <rect x="300" y="60" width="148" height="20" rx="2" stroke="var(--ink)" strokeWidth="1" />
      <text x="312" y="74" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.12em">MDCG 2022-21 \u00a76.4</text>
      <rect x="300" y="92" width="148" height="20" rx="2" stroke="var(--ink)" strokeWidth="1" />
      <text x="312" y="106" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.12em">EU MDR ART. 86</text>
      <rect x="300" y="124" width="148" height="20" rx="2" fill="var(--orange)" />
      <text x="312" y="138" fontFamily="var(--mono)" fontSize="9" fill="#fff" letterSpacing="0.12em">VALIDATED \u2713</text>
      <line x1="300" y1="180" x2="448" y2="180" stroke="var(--rule-strong)" />
      <text x="300" y="200" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-2)" letterSpacing="0.08em">10 MIN TO DRAFT</text>
      <text x="300" y="220" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">28 sections</text>
      <text x="300" y="238" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">142 data refs</text>
      <text x="300" y="256" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">100% citation coverage</text>
    </svg>
  );
}

function VisualComplaints() {
  return (
    <svg viewBox="0 0 480 320" width="100%" height="100%" fill="none">
      <rect width="480" height="320" fill="var(--paper)" />
      {[
        { y: 50,  reg: 'EU MDR Art. 87', sla: '15 days', state: 'on track' },
        { y: 110, reg: '21 CFR 803.50',  sla: '30 days', state: 'on track' },
        { y: 170, reg: 'EU MDR Art. 87', sla: '2 days',  state: 'urgent', urgent: true },
        { y: 230, reg: 'ISO 13485 \u00a78.2.2', sla: '5 days', state: 'on track' },
      ].map((row, i) => (
        <g key={i}>
          <rect x="40" y={row.y} width="400" height="44" rx="2" stroke={row.urgent ? 'var(--orange)' : 'var(--ink)'} strokeWidth="1.2" fill={row.urgent ? 'var(--orange)' : 'var(--paper)'} />
          <circle cx="60" cy={row.y + 22} r="5" fill={row.urgent ? '#fff' : 'var(--orange)'} />
          <text x="80" y={row.y + 19} fontFamily="var(--sans)" fontSize="12" fill={row.urgent ? '#fff' : 'var(--ink)'}>Complaint #{1041 + i}</text>
          <text x="80" y={row.y + 34} fontFamily="var(--mono)" fontSize="10" fill={row.urgent ? '#fff' : 'var(--ink-3)'} letterSpacing="0.06em">{row.reg}</text>
          <text x="320" y={row.y + 19} fontFamily="var(--sans)" fontSize="11" fill={row.urgent ? '#fff' : 'var(--ink-2)'}>SLA {row.sla}</text>
          <text x="320" y={row.y + 34} fontFamily="var(--mono)" fontSize="9.5" fill={row.urgent ? '#fff' : 'var(--ink-3)'} letterSpacing="0.1em">{row.state.toUpperCase()}</text>
        </g>
      ))}
    </svg>
  );
}

function VisualIMDRF() {
  const codes = [
    { code: 'A040104', label: 'Battery problem' },
    { code: 'B0301',   label: 'Inappropriate use' },
    { code: 'C04',     label: 'Death' },
    { code: 'D0207',   label: 'Manufacturing process' },
    { code: 'E0102',   label: 'Software issue' },
    { code: 'F0203',   label: 'Patient injury' },
  ];
  return (
    <svg viewBox="0 0 480 320" width="100%" height="100%" fill="none">
      <rect width="480" height="320" fill="var(--paper)" />
      <rect x="32" y="36" width="200" height="248" rx="4" stroke="var(--ink)" strokeWidth="1.2" fill="var(--paper)" />
      <text x="44" y="58" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-3)" letterSpacing="0.14em">NARRATIVE INPUT</text>
      {[78, 94, 110, 126, 142, 158, 174, 190, 206, 222].map((y, i) => (
        <rect key={y} x="44" y={y} width={i % 2 === 0 ? 176 : 152} height="4" fill="var(--ink-4)" rx="1" />
      ))}
      <line x1="244" y1="160" x2="288" y2="160" stroke="var(--orange)" strokeWidth="2" markerEnd="url(#arr)" />
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--orange)" />
        </marker>
      </defs>
      {codes.map((c, i) => (
        <g key={c.code}>
          <rect x="296" y={36 + i * 42} width="148" height="34" rx="2" fill={i === 2 ? 'var(--orange)' : 'var(--paper)'} stroke={i === 2 ? 'var(--orange)' : 'var(--ink)'} strokeWidth="1.1" />
          <text x="306" y={56 + i * 42} fontFamily="var(--mono)" fontSize="11" fill={i === 2 ? '#fff' : 'var(--ink)'} letterSpacing="0.05em">{c.code}</text>
          <text x="306" y={68 + i * 42} fontFamily="var(--sans)" fontSize="10" fill={i === 2 ? '#fff' : 'var(--ink-3)'}>{c.label}</text>
        </g>
      ))}
    </svg>
  );
}

function VisualGraph() {
  const nodes = [
    { x: 90, y: 70,  l: 'EU MDR' },
    { x: 240, y: 50, l: 'ISO 13485' },
    { x: 390, y: 80, l: 'ISO 14971' },
    { x: 70, y: 200, l: '21 CFR 820' },
    { x: 240, y: 230, l: 'IMDRF' },
    { x: 410, y: 210, l: 'MDCG 2022-21' },
  ];
  const edges = [
    [0, 1], [1, 2], [0, 3], [1, 3], [3, 4], [4, 5], [1, 5], [0, 5], [2, 4], [1, 4],
  ];
  return (
    <svg viewBox="0 0 480 320" width="100%" height="100%" fill="none">
      <rect width="480" height="320" fill="var(--paper)" />
      {edges.map(([a, b], i) => {
        const n1 = nodes[a as number];
        const n2 = nodes[b as number];
        if (!n1 || !n2) return null;
        return (
          <line
            key={i}
            x1={n1.x} y1={n1.y}
            x2={n2.x} y2={n2.y}
            stroke="var(--rule-strong)" strokeWidth="1"
          />
        );
      })}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="22" fill={i === 1 ? 'var(--orange)' : 'var(--paper)'} stroke={i === 1 ? 'var(--orange)' : 'var(--ink)'} strokeWidth="1.4" />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill={i === 1 ? '#fff' : 'var(--ink)'} letterSpacing="0.06em">{n.l}</text>
        </g>
      ))}
      <text x="240" y="298" textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)" letterSpacing="0.18em">
        REQUIREMENTS \u00b7 DEFINITIONS \u00b7 REQUIRED DATA \u00b7 CONSTRAINTS
      </text>
    </svg>
  );
}

function ProductVisual({ kind }: { kind: 'psur' | 'complaints' | 'imdrf' | 'graph' }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        borderRadius: 'var(--r-3)',
        border: '1px solid var(--rule)',
        background: 'var(--paper-deep)',
        overflow: 'hidden',
      }}
    >
      <div
        className="halftone"
        style={{
          position: 'absolute', inset: 0, opacity: 0.08, pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'absolute', inset: 16 }}>
        {kind === 'psur'       && <VisualPSUR />}
        {kind === 'complaints' && <VisualComplaints />}
        {kind === 'imdrf'      && <VisualIMDRF />}
        {kind === 'graph'      && <VisualGraph />}
      </div>
    </div>
  );
}

function CheckOrange() {
  return (
    <span className="check-orange" aria-hidden="true">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 5.4l2.1 2L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ── Pain card icon: red X ── */
function PainIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <circle cx="14" cy="14" r="13" stroke="var(--err)" strokeWidth="1.2" />
      <path d="M10 10l8 8M18 10l-8 8" stroke="var(--err)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function LandingPage() {
  const [, navigate] = useLocation();

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', color: 'var(--ink)' }}>
      <style>{`
        .nav-link {
          color: var(--ink-3); font-size: 13px; letter-spacing: -0.005em;
          border: 0; background: transparent; cursor: pointer; padding: 6px 2px;
          transition: color var(--t-fast) var(--ease); font-family: var(--sans);
        }
        .nav-link:hover { color: var(--ink); }
        .container { max-width: 1240px; margin: 0 auto; padding-left: 32px; padding-right: 32px; }

        .hero-display {
          font-family: var(--sans);
          font-size: clamp(48px, 8vw, 112px);
          font-weight: 500;
          letter-spacing: -0.045em;
          line-height: 0.96;
          margin: 0;
          color: var(--ink);
        }
        .hero-display .accent { color: var(--orange); }

        .product-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
          padding: 56px 0;
          border-top: 1px solid var(--rule);
        }
        .product-row.flip > .product-visual { order: -1; }

        .check-list { display: grid; gap: 12px; margin-top: 22px; padding: 0; list-style: none; }
        .check-list li { display: flex; gap: 12px; align-items: flex-start; font-size: 14.5px; color: var(--ink-2); line-height: 1.5; }

        .pain-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 32px;
        }

        .pain-card {
          padding: 24px;
          background: var(--paper);
          border: 1px solid var(--rule);
          border-radius: var(--r-2);
        }

        .mcp-tools-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 8px;
          margin-top: 20px;
        }

        @media (max-width: 880px) {
          .product-row { grid-template-columns: 1fr; gap: 28px; padding: 40px 0; }
          .product-row.flip > .product-visual { order: 0; }
          .nav-mid { display: none !important; }
          .pain-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── Nav ── */}
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="container" style={{ padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SmarticusWordmark size={16} tagline={false} />
          <div className="nav-mid" style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <button className="nav-link" onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}>Products</button>
            <button className="nav-link" onClick={() => document.getElementById('graph')?.scrollIntoView({ behavior: 'smooth' })}>Requirements</button>
            <button className="nav-link" onClick={() => document.getElementById('builder')?.scrollIntoView({ behavior: 'smooth' })}>Builder</button>
            <button className="nav-link" onClick={() => navigate('/app/connect')}>Developers</button>
            <ThemeToggle />
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')}>
              Open the sandbox
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Section 1: Hero ── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div
          aria-hidden="true"
          className="halftone"
          style={{
            position: 'absolute', inset: 0, opacity: 0.22,
            maskImage: 'radial-gradient(ellipse 70% 80% at 80% 30%, #000 30%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 80% 30%, #000 30%, transparent 75%)',
            pointerEvents: 'none',
          }}
        />
        <div className="container" style={{ position: 'relative', padding: '92px 32px 48px' }}>
          <div className="eyebrow rise" style={{ marginBottom: 28 }}>
            <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
            Regulatory infrastructure for AI agents
          </div>

          <h1 className="hero-display rise-1" style={{ maxWidth: 1100 }}>
            Regulatory Infrastructure that makes QMS and AI, <span className="accent">consistent and compliant</span>.
          </h1>

          <p
            className="rise-2"
            style={{
              marginTop: 30, maxWidth: 720, fontSize: 18, lineHeight: 1.55,
              color: 'var(--ink-2)',
            }}
          >
            Smarticus enables QMS teams to use AI, to prepare PSUR drafts, complaint assessments, IMDRF coding, perform audits, PMS plans, and provides traceability and auditability.
          </p>

          <div className="rise-3" style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')}>
              Open the sandbox
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/builder')}>
              Build a QMS tool
            </button>
          </div>

          <div className="rise-4" style={{ marginTop: 18 }}>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13.5, maxWidth: 640 }}>
              Smarticus prepares and checks the work. Your QMS team owns final review and release.
            </p>
          </div>
        </div>
      </section>

      {/* ── Regulator strip ── */}
      <section className="container" style={{ padding: '8px 32px 56px' }}>
        <RegulatorHeroRail />
      </section>

      {/* ── Section 2: Pain section ── */}
      <section style={{ background: 'var(--paper-deep)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '64px 0' }}>
        <div className="container">
          <div className="eyebrow" style={{ marginBottom: 14 }}>The problem</div>
          <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 800 }}>
            Generic AI is fast. QMS work has to be <span style={{ color: 'var(--orange)' }}>defensible</span>.
          </h2>

          <div className="pain-grid">
            <div className="pain-card">
              <div style={{ marginBottom: 14 }}><PainIcon /></div>
              <h3 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 8px' }}>Missing requirements</h3>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.55 }}>
                AI outputs that reference rules incorrectly or invent requirements.
              </p>
            </div>
            <div className="pain-card">
              <div style={{ marginBottom: 14 }}><PainIcon /></div>
              <h3 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 8px' }}>Missing required data</h3>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.55 }}>
                AI drafts that sound complete but skip required records.
              </p>
            </div>
            <div className="pain-card">
              <div style={{ marginBottom: 14 }}><PainIcon /></div>
              <h3 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 8px' }}>No decision trail</h3>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.55 }}>
                Decisions that cannot be replayed, defended, or verified.
              </p>
            </div>
          </div>

          <p style={{ marginTop: 32, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 720 }}>
            Smarticus fixes this by grounding every agent action in <strong style={{ color: 'var(--ink)' }}>requirements</strong>, <strong style={{ color: 'var(--ink)' }}>required data</strong>, and <strong style={{ color: 'var(--ink)' }}>decision trails</strong>.
          </p>
        </div>
      </section>

      {/* ── Section 3: Product proof rows ── */}
      <section id="products" className="container" style={{ padding: '48px 32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0 }}>
            Pre-built tools, bound to the rules.
          </h2>
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14, maxWidth: 480 }}>
            Each tool ships pre-bound to the requirements it must satisfy. Outputs
            are checked against those requirements before they leave the agent.
          </p>
        </div>

        {PRODUCTS.map((p, i) => (
          <article key={p.title} className={`product-row ${i % 2 === 1 ? 'flip' : ''}`}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>{p.eyebrow}</div>
              <h3 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>
                {p.title}
              </h3>
              <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
                {p.body}
              </p>
              <ul className="check-list">
                {p.bullets.map((b) => (
                  <li key={b}>
                    <CheckOrange />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              {/* Before / After comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 24 }}>
                <div className="comparison-before">
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-3)' }}>{p.before}</p>
                </div>
                <div className="comparison-after">
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>{p.after}</p>
                </div>
              </div>

              <div style={{ marginTop: 26 }}>
                <button className="btn btn-orange" onClick={() => navigate(p.cta.to)}>
                  {p.cta.label}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
            <div className="product-visual">
              <ProductVisual kind={p.visual} />
            </div>
          </article>
        ))}
      </section>

      {/* ── Section 4: Graph section (emotional center) ── */}
      <section id="graph" className="container" style={{ padding: '64px 32px 48px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>The ground</div>
        <h2 style={{ fontSize: 'clamp(34px, 4.6vw, 60px)', fontWeight: 500, letterSpacing: '-0.035em', margin: 0, lineHeight: 1.04, maxWidth: 980 }}>
          The requirements map your agents can reason from.
        </h2>
        <p style={{ marginTop: 18, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 720 }}>
          One map holds <strong style={{ color: 'var(--ink)' }}>{REG_COUNT} regulations and standards</strong> with all
          the relationships between them. Agents query the requirements map at readiness check
          (before they execute) and at validation (before output leaves the agent).
        </p>

        {/* Stats counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginTop: 36 }}>
          {[
            { label: 'Requirements', value: OBLIGATION_COUNT },
            { label: 'Constraints', value: 98 },
            { label: 'Definitions', value: 55 },
            { label: 'Required data types', value: 347 },
            { label: 'Cross-references', value: '1,200+' },
            { label: 'Jurisdictions', value: REG_COUNT },
          ].map((s) => (
            <div key={s.label} style={{ padding: 16, background: 'var(--paper-deep)', border: '1px solid var(--rule)', borderRadius: 'var(--r-2)' }}>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 36, alignItems: 'center' }}>
          <ProductVisual kind="graph" />
          <div>
            <ul className="check-list" style={{ marginTop: 0 }}>
              {[
                'Cross-references walk chains like ISO 13485 \u00a78.5.2 \u2192 820.100 \u2192 EU MDR Annex IX',
                'Versioned to source \u2014 replay any audit on the date it was conducted',
                'Queryable by process, jurisdiction, required data type, or citation',
                'Smarticus never sees your proprietary data \u2014 agents query the requirements map; payloads stay in your tenant',
              ].map((b) => (
                <li key={b}><CheckOrange /><span>{b}</span></li>
              ))}
            </ul>
            <div style={{ marginTop: 26 }}>
              <button className="btn btn-orange" onClick={() => navigate('/app/requirements')}>
                Browse the requirements
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 5: Builder preview ── */}
      <section id="builder" style={{ background: 'var(--paper-deep)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '64px 0' }}>
        <div className="container">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Agent builder</div>
          <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 800 }}>
            Build by QMS intent, not by prompt.
          </h2>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 640 }}>
            Choose a regulatory job. Smarticus assembles the agent, requirements, required data, and validation path.
          </p>

          <div className="flow-steps" style={{ marginTop: 48, marginBottom: 48 }}>
            {[
              { step: '1', label: 'Choose QMS job' },
              { step: '2', label: 'Select requirements' },
              { step: '3', label: 'Attach required data' },
              { step: '4', label: 'Run sandbox' },
              { step: '5', label: 'Export or connect' },
            ].map((s) => (
              <div key={s.step} className="flow-step">
                <div className="flow-dot">{s.step}</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', letterSpacing: '0.02em', marginTop: 4 }}>{s.label}</span>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/builder')}>
              Open the builder
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </section>

      {/* ── Section 6: Developer / MCP section ── */}
      <section className="container" style={{ padding: '64px 32px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>For developers</div>
        <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 800 }}>
          Connect Smarticus requirement checks to your AI tools.
        </h2>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 640 }}>
          Connect any MCP-compatible agent to the Smarticus requirements engine. Eleven tools, one line to install.
        </p>

        <pre style={{ marginTop: 28, fontSize: 14, padding: '18px 22px', maxWidth: 480 }}>
          <code style={{ background: 'transparent', padding: 0 }}>npx @smarticus/mcp</code>
        </pre>

        <div className="mcp-tools-list">
          {[
            'discover_obligations',
            'check_qualification',
            'validate_compliance',
            'explain_obligation',
            'find_obligation_path',
          ].map((tool) => (
            <div
              key={tool}
              style={{
                padding: '10px 14px',
                background: 'var(--paper-deep)',
                border: '1px solid var(--rule)',
                borderRadius: 'var(--r-2)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                color: 'var(--ink-2)',
                letterSpacing: '0.02em',
              }}
            >
              {tool}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/app/connect')}>
            View developer docs
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </section>

      {/* ── Section 7: Final CTA ── */}
      <section style={{ background: 'var(--ink)', color: 'var(--paper)', position: 'relative', overflow: 'hidden' }}>
        <div
          aria-hidden="true"
          className="halftone halftone-orange"
          style={{
            position: 'absolute', inset: 0, opacity: 0.35,
            maskImage: 'radial-gradient(ellipse 60% 80% at 90% 50%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 90% 50%, #000 20%, transparent 75%)',
            pointerEvents: 'none',
          }}
        />
        <div className="container" style={{ position: 'relative', padding: '88px 32px' }}>
          <h2
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 'clamp(40px, 6vw, 84px)',
              fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.02,
              color: 'var(--paper)', maxWidth: 1100, margin: 0,
            }}
          >
            Give your QMS team an AI co-pilot they can <span style={{ color: 'var(--orange)' }}>trust</span>.
          </h2>

          <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')}>
              Open the sandbox
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--paper)', borderColor: 'var(--ink-3)' }}
              onClick={() => window.location.href = 'mailto:hello@thinkertons.com'}
            >
              Talk to us
            </button>
          </div>

          <p style={{ marginTop: 24, color: 'var(--ink-4)', fontSize: 14, maxWidth: 560 }}>
            Smarticus does not replace QMS judgment. It prepares, checks, and traces the work so your team can review with confidence.
          </p>
        </div>
      </section>

      {/* ── Section 8: Footer ── */}
      <footer
        className="container"
        style={{
          padding: '40px 32px 56px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
          borderTop: '1px solid var(--rule)',
        }}
      >
        <SmarticusByThinkertonsLockup size={20} />
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
            color: 'var(--ink-3)', fontSize: 11, fontFamily: 'var(--mono)', letterSpacing: '0.14em',
            width: '100%', borderTop: '1px solid var(--rule)', paddingTop: 18, textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SmarticusMark size={14} />
            <span>Smarticus \u00b7 Regulatory ground</span>
          </div>
          <span>2026 \u00b7 Built by Thinkertons</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
