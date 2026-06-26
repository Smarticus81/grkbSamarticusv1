import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { RegulatorHeroRail } from '../components/ui/RegulatorAssets.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';
import { SmarticusWordmark, SmarticusMark, SmarticusByThinkertonsLockup } from '../components/ui/logos.js';
import { EVIDENCE_TYPE_COUNT, REG_COUNT, OBLIGATION_COUNT } from '../lib/coverage.js';
import { api } from '../lib/queryClient.js';

interface GraphStats {
  regulations: number;
  obligations: number;
  evidenceTypes: number;
}

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
    body: 'Generates an MDCG 2022-21 PSUR draft from controlled source data.',
    bullets: [
      'MDCG 2022-21 sections A\u2013M',
      'Deterministic statistics \u2014 numbers computed once, never fabricated',
      'Audit trail: each decision cites its reason and requirement',
      'Tamper-evident trace chain and one-click audit pack',
    ],
    cta: { label: 'Watch the demo', to: '/demo/psur' },
    visual: 'psur',
    before: 'Two weeks of manual assembly: sales, complaints, incidents, trends, literature \u2014 reconciled by hand.',
    after: 'A draft structured to MDCG 2022-21, with a traceable audit trail behind every number.',
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
    cta: { label: 'Configure module', to: '/app' },
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
      'Reviewable before connecting to production',
      'Versioned against IMDRF terminology releases',
    ],
    cta: { label: 'Configure module', to: '/app' },
    visual: 'imdrf',
    before: 'Manual IMDRF coding with inconsistent annex coverage and no confidence scores.',
    after: 'Automated codes across Annexes A\u2013G with rationale, confidence, and version-locked terminology.',
  },
  {
    eyebrow: 'Regulatory requirements library',
    title: 'One map. Every regulation. Every relationship.',
    body: 'Modules retrieve versioned requirements, cross-references, source data types, and constraints.',
    bullets: [
      `${OBLIGATION_COUNT} requirements across ${REG_COUNT} regulations and standards`,
      'Walks chains like ISO 13485 \u00a78.5.2 \u2192 820.100 \u2192 EU MDR Annex IX',
      'Versioned to the source date so an audit can be replayed',
      'Smarticus never sees your proprietary data',
    ],
    cta: { label: 'Browse the requirements', to: '/app/requirements' },
    visual: 'graph',
    before: 'Manual PDF checks with limited cross-reference awareness.',
    after: 'Modules query versioned requirements, constraints, source data types, and cross-references.',
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
      <text x="312" y="138" fontFamily="var(--mono)" fontSize="9" fill="#fff" letterSpacing="0.12em">FOR REVIEW</text>
      <line x1="300" y1="180" x2="448" y2="180" stroke="var(--rule-strong)" />
      <text x="300" y="200" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-2)" letterSpacing="0.08em">10 MIN TO DRAFT</text>
      <text x="300" y="220" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">28 sections</text>
      <text x="300" y="238" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">142 data refs</text>
      <text x="300" y="256" fontFamily="var(--sans)" fontSize="13" fill="var(--ink)">Every section cited</text>
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

/* ── PSUR generation preview — looping animation for the hero ── */

const HERO_PHASES = [
  'Discovery', 'Parsing', 'Device context', 'IMDRF coding',
  'Statistics', 'Charts', 'Section modules', 'Audit',
  'Remediation', 'Validation', 'Rendering', 'Outputs',
] as const;

const HERO_SECTIONS = ['A','B','C','D','E','F','G','H','I','J','K','L','M'] as const;

const HERO_DECISIONS: Array<{ text: string; reg: string; status: 'ok' | 'warn' | 'info' }> = [
  { text: 'MDCG 2022-21 §6.4 — section A content verified', reg: 'EU MDR', status: 'ok' },
  { text: 'ISO 14971 §7.4 — risk trend data present', reg: 'ISO 14971', status: 'ok' },
  { text: 'EU MDR Art. 86 — complaint summary cross-referenced', reg: 'EU MDR', status: 'ok' },
  { text: 'MDCG 2022-21 §6.8 — FSCA records linked', reg: 'MDCG', status: 'ok' },
  { text: '21 CFR 803 — MDR evaluation included', reg: 'FDA', status: 'info' },
  { text: 'ISO 13485 §8.2.2 — complaint handling data present', reg: 'ISO 13485', status: 'ok' },
  { text: 'EU MDR Art. 87 — reportability assessment complete', reg: 'EU MDR', status: 'ok' },
  { text: 'MDCG 2022-21 §6.12 — benefit-risk conclusion sourced', reg: 'MDCG', status: 'warn' },
  { text: 'ISO 14971 §10 — residual risk data summarized', reg: 'ISO 14971', status: 'ok' },
  { text: 'EU MDR Annex XIV — PMS plan alignment confirmed', reg: 'EU MDR', status: 'ok' },
  { text: 'Deterministic stats — 142 data refs, zero fabrication', reg: 'System', status: 'ok' },
  { text: 'Hash chain verified — 24 entries, tamper-evident', reg: 'Audit', status: 'ok' },
  { text: 'PSUR draft ready for review — 28 sections cited', reg: 'Output', status: 'ok' },
];

// Total cycle is ~18s: 6s phases + 6.5s sections + 3s validation + 2.5s pause
const CYCLE_MS = 18000;

function PsurGenerationPreview() {
  const [tick, setTick] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    let running = true;
    function loop() {
      if (!running) return;
      setTick(Date.now() - startRef.current);
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  // Normalize tick into a cycle position (0..1)
  const t = (tick % CYCLE_MS) / CYCLE_MS;

  // Phase progress: 0–0.33 maps to phases 0–11
  const phaseProgress = Math.min(t / 0.33, 1);
  const activePhaseIdx = Math.min(Math.floor(phaseProgress * 12), 11);

  // Section progress: 0.15–0.52 maps to sections A–M
  const secStart = 0.15;
  const secEnd = 0.52;
  const secProgress = t < secStart ? 0 : t > secEnd ? 1 : (t - secStart) / (secEnd - secStart);
  const activeSectionIdx = Math.min(Math.floor(secProgress * 13), 12);
  const doneSections = t > secEnd ? 13 : Math.floor(secProgress * 13);

  // Decision stream: fade in decisions between 0.10–0.75
  const decStart = 0.10;
  const decEnd = 0.75;
  const decProgress = t < decStart ? 0 : t > decEnd ? 1 : (t - decStart) / (decEnd - decStart);
  const visibleDecisions = Math.min(Math.floor(decProgress * HERO_DECISIONS.length), HERO_DECISIONS.length);

  // Overall progress bar
  const overallPct = Math.min(t / 0.82, 1) * 100;

  // Elapsed clock
  const elapsed = Math.floor((t * CYCLE_MS) / 1000 * 0.6); // Scaled to look like ~10 min
  const clockMin = Math.floor(elapsed / 60);
  const clockSec = elapsed % 60;

  // After 82% we show "complete" state
  const isComplete = t > 0.82;

  // Status badge hash (fake, cycles)
  const hashChars = '0123456789abcdef';
  const fakeHash = Array.from({ length: 8 }, (_, i) => hashChars[(tick / 100 + i * 3) % 16 | 0]).join('');

  return (
    <div className="psur-preview">
      {/* Header bar */}
      <div className="psur-preview-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isComplete ? 'var(--ok)' : 'var(--ink)',
            animation: isComplete ? 'none' : 'phase-pulse 1s ease infinite',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>
            {isComplete ? 'PSUR draft complete' : 'Generating PSUR draft…'}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>
          {String(clockMin).padStart(2, '0')}:{String(clockSec).padStart(2, '0')}
        </span>
      </div>

      {/* Progress bar */}
      <div className="psur-progress-bar">
        <div className="psur-progress-fill" style={{ width: `${overallPct}%` }} />
      </div>

      {/* Phase timeline */}
      <div className="psur-phases">
        {HERO_PHASES.map((p, i) => (
          <div
            key={p}
            className={`psur-phase ${i < activePhaseIdx ? 'done' : i === activePhaseIdx && !isComplete ? 'active' : i <= activePhaseIdx ? 'done' : ''}`}
          >
            {p.length > 8 ? p.slice(0, 6) + '…' : p}
          </div>
        ))}
      </div>

      {/* Section grid A–M */}
      <div className="psur-sections">
        {HERO_SECTIONS.map((letter, i) => (
          <div
            key={letter}
            className={`psur-sec ${i < doneSections ? 'done' : i === activeSectionIdx && secProgress > 0 && secProgress < 1 ? 'writing' : ''}`}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* Decision stream */}
      <div className="psur-decisions">
        {HERO_DECISIONS.slice(0, visibleDecisions).slice(-5).map((d, i) => {
          const dotColor = d.status === 'ok' ? 'var(--ok)' : d.status === 'warn' ? 'var(--warn)' : 'var(--info)';
          return (
            <div className="psur-decision" key={`${d.text}-${i}`}>
              <span className="d-dot" style={{ background: dotColor }} />
              <span style={{ color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.text}
              </span>
              <span className="d-hash">{d.reg}</span>
            </div>
          );
        })}
        {visibleDecisions === 0 && (
          <div style={{ fontSize: 11, color: 'var(--ink-4)', padding: '8px 0' }}>
            Waiting for first decision…
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="psur-preview-footer">
        <span><strong>{doneSections}</strong>/13 sections</span>
        <span><strong>{visibleDecisions}</strong> decisions</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9 }}>
          {isComplete ? '✓ chain verified' : `sha256:${fakeHash}…`}
        </span>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [, navigate] = useLocation();
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<GraphStats>('/api/graph/stats')
      .then((stats) => {
        if (!cancelled) setGraphStats(stats);
      })
      .catch(() => {
        if (!cancelled) setGraphStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveRequirements = graphStats?.obligations ?? OBLIGATION_COUNT;
  const liveEvidenceTypes = graphStats?.evidenceTypes ?? EVIDENCE_TYPE_COUNT;
  const liveSemanticBuckets = graphStats?.regulations ?? REG_COUNT;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--paper)',
        color: 'var(--ink)',
      }}
    >
      <style>{`
        .landing-hero {
          position: relative;
          max-width: 1120px;
          margin: 0 auto;
          width: 100%;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 460px);
          gap: 48px;
          align-items: center;
        }
        @media (max-width: 900px) {
          .landing-hero { grid-template-columns: 1fr; gap: 32px; }
        }

        /* ── PSUR generation preview panel ── */
        .psur-preview {
          border: 1px solid var(--rule);
          border-radius: var(--radius);
          background: var(--surface);
          overflow: hidden;
          font-family: var(--sans);
        }
        .psur-preview-header {
          padding: 12px 16px;
          border-bottom: 1px solid var(--rule);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--paper-deep);
        }

        /* ── Phase timeline ── */
        .psur-phases {
          display: flex;
          gap: 0;
          padding: 0 16px;
          border-bottom: 1px solid var(--rule);
          overflow: hidden;
        }
        .psur-phase {
          flex: 1;
          padding: 8px 2px;
          text-align: center;
          font-size: 8px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: var(--ink-4);
          position: relative;
          transition: color 0.3s;
        }
        .psur-phase::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 10%;
          width: 80%;
          height: 2px;
          background: transparent;
          transition: background 0.3s;
        }
        .psur-phase.done { color: var(--ok); }
        .psur-phase.done::after { background: var(--ok); }
        .psur-phase.active { color: var(--ink); }
        .psur-phase.active::after { background: var(--ink); animation: phase-pulse 1s ease infinite; }
        @keyframes phase-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        /* ── Section grid (A–M) ── */
        .psur-sections {
          display: grid;
          grid-template-columns: repeat(13, 1fr);
          gap: 3px;
          padding: 10px 16px;
          border-bottom: 1px solid var(--rule);
        }
        .psur-sec {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--mono);
          font-size: 10px;
          border: 1px solid var(--rule);
          border-radius: var(--radius-sm);
          background: var(--paper);
          color: var(--ink-4);
          transition: all 0.4s;
        }
        .psur-sec.writing {
          border-color: var(--ink);
          color: var(--ink);
          background: var(--paper-deep);
          animation: sec-write 0.8s ease infinite;
        }
        .psur-sec.done {
          border-color: var(--ok);
          color: var(--ok);
          background: var(--ok-soft);
        }
        @keyframes sec-write {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* ── Decision stream ── */
        .psur-decisions {
          padding: 10px 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 120px;
          max-height: 160px;
          overflow: hidden;
        }
        .psur-decision {
          display: grid;
          grid-template-columns: 6px 1fr auto;
          gap: 8px;
          align-items: center;
          padding: 5px 8px;
          border: 1px solid var(--rule);
          border-radius: var(--radius-sm);
          background: var(--surface);
          font-size: 11px;
          animation: decision-in 0.3s ease both;
        }
        .psur-decision .d-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }
        .psur-decision .d-hash {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--ink-4);
        }
        @keyframes decision-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Progress bar ── */
        .psur-progress-bar {
          height: 3px;
          background: var(--rule);
          position: relative;
          overflow: hidden;
        }
        .psur-progress-fill {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          background: var(--ok);
          transition: width 0.5s ease;
        }

        /* ── Footer stats ── */
        .psur-preview-footer {
          padding: 8px 16px;
          display: flex;
          gap: 16px;
          font-size: 10px;
          color: var(--ink-3);
          border-top: 1px solid var(--rule);
          background: var(--paper-deep);
        }
        .psur-preview-footer strong { color: var(--ink); font-weight: 600; }
      `}</style>
      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          borderBottom: '1px solid var(--rule)',
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <SmarticusWordmark size={16} tagline={false} />
        <div className="nav-mid" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button className="nav-link" onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}>Modules</button>
          <button className="nav-link" onClick={() => document.getElementById('graph')?.scrollIntoView({ behavior: 'smooth' })}>Requirements</button>
          <button className="nav-link" onClick={() => document.getElementById('builder')?.scrollIntoView({ behavior: 'smooth' })}>Workflow</button>
          <button className="nav-link" onClick={() => navigate('/contact')}>Contact</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <button className="btn btn-ghost" onClick={() => navigate('/app')}>
            Sign in
          </button>
        </div>
      </nav>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '48px 32px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden
          className="halftone"
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.08,
            maskImage: 'radial-gradient(ellipse 60% 80% at 86% 22%, #000 18%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 86% 22%, #000 18%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <section className="landing-hero">
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              <span className="signal-dot" style={{ marginRight: 8, verticalAlign: 1 }} />
              Post-market surveillance platform
            </div>
            <h1
              style={{
                margin: 0,
                maxWidth: 620,
                fontSize: 'clamp(28px, 4vw, 36px)',
                lineHeight: 1.15,
                letterSpacing: '-0.015em',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              Quickly Draft accurate and traceable PSURs and other QMS documents and never miss a regulatory deadline.
            </h1>
            <p
              style={{
                margin: '16px 0 0',
                maxWidth: 540,
                color: 'var(--ink-2)',
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              Every report will come with an Audit checklist and decision traces to make our report defensible.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
              <button className="btn btn-orange" onClick={() => navigate('/demo/psur')}>
                Watch a PSUR draft
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="btn btn-ghost" onClick={() => navigate('/app/sandbox')}>
                Try a module
              </button>
            </div>
          </div>

          <aside aria-label="PSUR generation preview">
            <PsurGenerationPreview />
          </aside>
        </section>
      </main>

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

      {/* ── Regulator strip ── */}
      <section className="container" style={{ padding: '8px 32px 56px' }}>
        <RegulatorHeroRail />
      </section>

      {/* ── Section 3: Product proof rows ── */}
      <section id="products" className="container" style={{ padding: '48px 32px 24px' }}>
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
        <div className="eyebrow" style={{ marginBottom: 14 }}>Requirements library</div>
        <h2 style={{ fontSize: 'clamp(34px, 4.6vw, 60px)', fontWeight: 500, letterSpacing: '-0.035em', margin: 0, lineHeight: 1.04, maxWidth: 980 }}>
          The requirements library your modules use.
        </h2>
        <p style={{ marginTop: 18, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 720 }}>
          One map holds <strong style={{ color: 'var(--ink)' }}>{liveSemanticBuckets} regulations and standards</strong> with all
          the relationships between them. Modules trace each output back to the applicable requirement.
        </p>

        {/* Stats counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, marginTop: 36 }}>
          {[
            { label: 'Requirements', value: liveRequirements },
            { label: 'Constraints', value: 98 },
            { label: 'Definitions', value: 55 },
            { label: 'Source data types', value: liveEvidenceTypes },
            { label: 'Cross-references', value: '1,200+' },
            { label: 'Regulations & standards', value: liveSemanticBuckets },
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
                'Smarticus never sees your proprietary data \u2014 modules query the requirements library; payloads stay in your workspace',
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

      {/* ── Section 5: Agent OS preview ── */}
      <section id="builder" style={{ background: 'var(--paper-deep)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '64px 0' }}>
        <div className="container">
          <div className="eyebrow" style={{ marginBottom: 14 }}>Workflow Builder</div>
          <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 800 }}>
            Configure by QMS task, not by prompt.
          </h2>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 640 }}>
            Choose a regulatory job. Smarticus lists the module, requirements, source data, and validation path.
          </p>

          <div className="flow-steps" style={{ marginTop: 48, marginBottom: 48 }}>
            {[
              { step: '1', label: 'Choose QMS job' },
              { step: '2', label: 'Select requirements' },
              { step: '3', label: 'Attach source data' },
              { step: '4', label: 'Run module' },
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
              Open Modules in Routine Use
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>
      </section>

      {/* ── Section 6: Developer / MCP section ── */}
      <section className="container" style={{ padding: '64px 32px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>For developers</div>
        <h2 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 500, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 800 }}>
          Connect Smarticus to your QMS and source systems.
        </h2>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 640 }}>
          A REST API lets your quality and engineering teams pull drafts, run compliance checks, and export tamper-evident audit packs straight into your eQMS.
        </p>

        <pre style={{ marginTop: 28, fontSize: 14, padding: '18px 22px', maxWidth: 480 }}>
          <code style={{ background: 'transparent', padding: 0 }}>curl https://api.smarticus.ai/v1/runs</code>
        </pre>

        <div className="mcp-tools-list">
          {[
            'Query the requirement map',
            'Run compliance checks',
            'Trigger module runs',
            'Export tamper-evident audit packs',
            'Read the source-record catalog',
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
            View API & integration docs
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
            Give your QMS team modules with reviewable <span style={{ color: 'var(--orange)' }}>audit trails</span>.
          </h2>

          <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={() => navigate('/app/sandbox')}>
              Configure module
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--paper)', borderColor: 'var(--ink-3)' }}
              onClick={() => navigate('/contact')}
            >
              Contact us
            </button>
          </div>

          <p style={{ marginTop: 24, color: 'var(--ink-4)', fontSize: 14, maxWidth: 560 }}>
            Smarticus does not replace QMS judgment. It drafts the records — your team reviews and releases.
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
            <span>Smarticus \u00b7 Post-market surveillance</span>
          </div>
          <span>2026 \u00b7 Built by Thinkertons</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
