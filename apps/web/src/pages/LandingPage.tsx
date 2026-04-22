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
}[] = [
  {
    eyebrow: 'Authoring',
    title: 'PSUR Compiler.',
    body: 'A full PSUR draft under MDCG 2022-21 in about ten minutes. Sections, evidence, citations, and a coverage matrix.',
    bullets: [
      'MDCG 2022-21 section structure',
      'Cross-references to EU MDR Articles 85 and 86',
      'Evidence pulled from your QMS, never stored by us',
      'Citations on every claim',
    ],
    cta: { label: 'Open in sandbox', to: '/app' },
    visual: 'psur',
  },
  {
    eyebrow: 'Vigilance',
    title: 'Complaint Scheduler.',
    body: 'Triage incoming complaints against the timelines that actually apply to them. EU MDR, 21 CFR 820, and ISO 13485 in one queue.',
    bullets: [
      'EU MDR Article 87 reporting clocks',
      '21 CFR 803 MDR decisioning',
      'ISO 13485 §8.2.2 evidence trail',
      'Auto-coded with IMDRF Annex A through G',
    ],
    cta: { label: 'Open in sandbox', to: '/app' },
    visual: 'complaints',
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
  },
  {
    eyebrow: 'The knowledge graph',
    title: 'One graph. Eight regulations. Every relationship.',
    body: 'Your agents query Smarticus instead of re-reading the regulation. The graph holds the obligations, the cross-references, the evidence types, and the constraints — versioned, citable, and replayable.',
    bullets: [
      `${OBLIGATION_COUNT} obligations across ${REG_COUNT} regulations and standards`,
      'Walks chains like ISO 13485 §8.5.2 → 820.100 → EU MDR Annex IX',
      'Versioned to the source date so an audit can be replayed',
      'Smarticus never sees your proprietary data',
    ],
    cta: { label: 'Browse the graph', to: '/app/regulations' },
    visual: 'graph',
  },
];

/* ── Other tools shown as a compact list under the showcase ── */
const TOOLS_MORE: { name: string; one: string; reg: string }[] = [
  { name: 'PMS Plan Builder',    one: 'Schedules PMS activity per Articles 83 to 86.',         reg: 'EU MDR' },
  { name: 'CAPA Evaluator',      one: 'Checks a CAPA file against ISO 13485 and 820.100.',     reg: 'ISO 13485 / 21 CFR 820' },
  { name: 'Risk File Watcher',   one: 'Re-scores a risk file when an input changes.',          reg: 'ISO 14971' },
  { name: 'Internal Audit Pack', one: 'Generates audit plan, checklist, and report scaffold.', reg: 'ISO 13485' },
  { name: 'External DB Search',  one: 'Searches MAUDE, EUDAMED, and recall databases.',        reg: 'Cross-jurisdiction' },
  { name: 'Trending Engine',     one: 'Detects device trends against your reporting threshold.', reg: 'EU MDR / 21 CFR 820' },
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
      <text x="312" y="74" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.12em">MDCG 2022-21 §6.4</text>
      <rect x="300" y="92" width="148" height="20" rx="2" stroke="var(--ink)" strokeWidth="1" />
      <text x="312" y="106" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.12em">EU MDR ART. 86</text>
      <rect x="300" y="124" width="148" height="20" rx="2" fill="var(--orange)" />
      <text x="312" y="138" fontFamily="var(--mono)" fontSize="9" fill="#fff" letterSpacing="0.12em">VALIDATED ✓</text>
      <line x1="300" y1="180" x2="448" y2="180" stroke="var(--rule-strong)" />
      <text x="300" y="200" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-2)" letterSpacing="0.08em">10 MIN TO DRAFT</text>
      <text x="300" y="220" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">28 sections</text>
      <text x="300" y="238" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">142 evidence refs</text>
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
        { y: 230, reg: 'ISO 13485 §8.2.2', sla: '5 days', state: 'on track' },
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
        OBLIGATIONS · DEFINITIONS · EVIDENCE · CONSTRAINTS
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
          font-size: clamp(56px, 9vw, 132px);
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

        .more-tool {
          display: grid; grid-template-columns: 1fr auto;
          gap: 20px; align-items: baseline; padding: 16px 0;
          border-top: 1px solid var(--rule);
        }

        @media (max-width: 880px) {
          .product-row { grid-template-columns: 1fr; gap: 28px; padding: 40px 0; }
          .product-row.flip > .product-visual { order: 0; }
          .nav-mid { display: none !important; }
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
            <button className="nav-link" onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}>Tools</button>
            <button className="nav-link" onClick={() => document.getElementById('graph')?.scrollIntoView({ behavior: 'smooth' })}>Knowledge graph</button>
            <button className="nav-link" onClick={() => document.getElementById('coverage')?.scrollIntoView({ behavior: 'smooth' })}>Coverage</button>
            <button className="nav-link" onClick={() => navigate('/app/api-access')}>For developers</button>
            <ThemeToggle />
            <button className="btn btn-orange" onClick={() => navigate('/app')}>
              Open the sandbox
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
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
            For medical device and pharma QARA teams
          </div>

          <h1 className="hero-display rise-1" style={{ maxWidth: 1100 }}>
            Regulation. <span className="accent">In every agent.</span>
          </h1>

          <p
            className="rise-2"
            style={{
              marginTop: 30, maxWidth: 720, fontSize: 18, lineHeight: 1.5,
              color: 'var(--ink-2)',
            }}
          >
            Smarticus is where medical device and pharma teams pick up AI tools
            and agents that already know EU MDR, ISO 13485, ISO 14971, 21 CFR 820,
            IMDRF, and MDCG 2022-21. PSUR drafts, complaint triage, IMDRF coding,
            CAPA reviews, PMS plans. Test them in the sandbox. Connect them to
            your QMS when you are ready.
          </p>

          <div className="rise-3" style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app')}>
              Open the sandbox
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/app/api-access')}>
              Connect via MCP
            </button>
          </div>

          <div className="rise-4" style={{ marginTop: 18 }}>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13.5 }}>
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>Verifiable. Traceable. Auditable.</span>
              {' '}Smarticus never sees your proprietary data.
            </p>
          </div>
        </div>
      </section>

      {/* ── Regulator strip ── */}
      <section className="container" style={{ padding: '8px 32px 56px' }}>
        <RegulatorHeroRail />
      </section>

      {/* ── Product showcase rows ── */}
      <section id="products" className="container" style={{ padding: '24px 32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.4vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0 }}>
            Pre-built tools, bound to the rules.
          </h2>
          <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14, maxWidth: 480 }}>
            Each tool ships pre-bound to the obligations it must satisfy. Outputs
            are checked against those obligations before they leave the agent.
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

      {/* ── More tools ── */}
      <section className="container" style={{ padding: '40px 32px 56px' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>And more in the catalog</div>
        <div style={{ borderTop: '1px solid var(--rule-strong)', borderBottom: '1px solid var(--rule-strong)' }}>
          {TOOLS_MORE.map((t) => (
            <div key={t.name} className="more-tool" style={{ borderTop: 0 }}>
              <div>
                <div style={{ fontSize: 15, color: 'var(--ink)' }}>{t.name}</div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 2 }}>{t.one}</div>
              </div>
              <span className="eyebrow" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{t.reg}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Knowledge graph deep section (anchor) ── */}
      <section id="graph" className="container" style={{ padding: '40px 32px 24px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Powered by the knowledge graph</div>
        <h2 style={{ fontSize: 'clamp(34px, 4.6vw, 60px)', fontWeight: 500, letterSpacing: '-0.035em', margin: 0, lineHeight: 1.04, maxWidth: 980 }}>
          Your agents inherit regulatory awareness.
        </h2>
        <p style={{ marginTop: 18, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 720 }}>
          One graph holds <strong style={{ color: 'var(--ink)' }}>{REG_COUNT} regulations and standards</strong> with all
          the relationships between them. Agents query the graph at qualification
          (before they execute) and at validation (before output leaves the agent).
          The graph is versioned, citable, and replayable on the date of an audit.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 36, alignItems: 'center' }}>
          <ProductVisual kind="graph" />
          <ul className="check-list" style={{ marginTop: 0 }}>
            {[
              'Cross-references walk chains like ISO 13485 §8.5.2 → 820.100 → EU MDR Annex IX',
              'Versioned to source — replay any audit on the date it was conducted',
              'Queryable by process, jurisdiction, evidence type, or citation',
              'Connects to QMS agents for charts, CAPAs, internal audits, risk profile changes, device trending, PATERs, PSURs',
              'Smarticus never sees your proprietary data — agents query the graph; payloads stay in your tenant',
            ].map((b) => (
              <li key={b}><CheckOrange /><span>{b}</span></li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Coverage band ── */}
      <section id="coverage" style={{ background: 'var(--paper-deep)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '48px 0' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
            <h2 style={{ fontSize: 'clamp(24px, 2.6vw, 34px)', fontWeight: 500, letterSpacing: '-0.025em', margin: 0 }}>
              Coverage today.
            </h2>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>
              {REG_COUNT} regulations · {OBLIGATION_COUNT} obligations · growing
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {REGULATIONS.map((r) => (
              <div
                key={r.name}
                style={{
                  padding: 16, background: 'var(--paper)',
                  border: '1px solid var(--rule)', borderRadius: 'var(--r-2)',
                }}
              >
                <div className="eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>{r.name}</div>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1 }}>
                  {r.count}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 4 }}>obligations</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The contract ── */}
      <section className="container" style={{ padding: '56px 32px' }}>
        <div className="eyebrow" style={{ marginBottom: 18 }}>The contract</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--rule-strong)', borderBottom: '1px solid var(--rule-strong)' }}>
          {[
            { n: '01', t: 'Verifiable', b: 'Every output is checked against the obligation it must satisfy before it leaves the agent.' },
            { n: '02', t: 'Traceable',  b: 'Every decision is written into a SHA-256 chain with actor, evidence, and obligation context.' },
            { n: '03', t: 'Auditable',  b: 'Every regulation is versioned and replayable. Pull a complete audit pack for any process instance.' },
          ].map((c, i) => (
            <div key={c.n} style={{ padding: '22px 24px', borderLeft: i === 0 ? 0 : '1px solid var(--rule)' }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{c.n} / {c.t}</div>
              <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.55 }}>{c.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
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
            Pick a tool. Run it in the sandbox.<br />
            <span style={{ color: 'var(--orange)' }}>Connect it to your QMS.</span>
          </h2>
          <p style={{ marginTop: 18, color: 'var(--ink-4)', fontSize: 15, maxWidth: 640 }}>
            Verifiable. Traceable. Auditable. Without giving us your proprietary data.
          </p>
          <div style={{ marginTop: 26, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app')}>
              Open the sandbox
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--paper)', borderColor: 'var(--ink-3)' }}
              onClick={() => navigate('/app/api-access')}
            >
              Connect via MCP
            </button>
          </div>
        </div>
      </section>

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
            <span>Smarticus · Regulatory ground</span>
          </div>
          <span>2026 · Built by Thinkertons</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
