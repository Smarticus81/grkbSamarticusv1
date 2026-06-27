import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { RegulatorHeroRail } from '../components/ui/RegulatorAssets.js';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';
import { SmarticusWordmark, SmarticusMark, SmarticusByThinkertonsLockup } from '../components/ui/logos.js';

/** Calendly scheduling link for "Book a demo" CTAs. */
const CALENDLY_URL = 'https://calendly.com/tmusoni81/30min';

function openCalendly() {
  window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer');
}

/* ── Featured product rows (alternating showcase) ── */
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
    body: 'Turns controlled source data into an MDCG 2022-21 PSUR draft — sections A through M — in minutes.',
    bullets: [
      'MDCG 2022-21 sections A\u2013M, EU MDR Art. 86 aligned',
      'Deterministic statistics \u2014 numbers computed once, never fabricated',
      'Every decision cites its reason and its requirement',
      'Tamper-evident decision trace and one-click audit pack',
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
    cta: { label: 'See the module', to: '/app/sandbox' },
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
    cta: { label: 'See the module', to: '/app/sandbox' },
    visual: 'imdrf',
    before: 'Manual IMDRF coding with inconsistent annex coverage and no confidence scores.',
    after: 'Automated codes across Annexes A\u2013G with rationale, confidence, and version-locked terminology.',
  },
];

/* ── SVG visuals (paper-and-ink with accent) ── */
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
      <text x="312" y="138" fontFamily="var(--mono)" fontSize="9" fill="#fff" letterSpacing="0.12em">FOR REVIEW</text>
      <line x1="300" y1="180" x2="448" y2="180" stroke="var(--rule-strong)" />
      <text x="300" y="200" fontFamily="var(--mono)" fontSize="9.5" fill="var(--ink-2)" letterSpacing="0.08em">MINUTES TO DRAFT</text>
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
        REQUIREMENTS · DEFINITIONS · REQUIRED DATA · CONSTRAINTS
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

function ArrowRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

  const t = (tick % CYCLE_MS) / CYCLE_MS;

  const phaseProgress = Math.min(t / 0.33, 1);
  const activePhaseIdx = Math.min(Math.floor(phaseProgress * 12), 11);

  const secStart = 0.15;
  const secEnd = 0.52;
  const secProgress = t < secStart ? 0 : t > secEnd ? 1 : (t - secStart) / (secEnd - secStart);
  const activeSectionIdx = Math.min(Math.floor(secProgress * 13), 12);
  const doneSections = t > secEnd ? 13 : Math.floor(secProgress * 13);

  const decStart = 0.10;
  const decEnd = 0.75;
  const decProgress = t < decStart ? 0 : t > decEnd ? 1 : (t - decStart) / (decEnd - decStart);
  const visibleDecisions = Math.min(Math.floor(decProgress * HERO_DECISIONS.length), HERO_DECISIONS.length);

  const overallPct = Math.min(t / 0.82, 1) * 100;

  const elapsed = Math.floor((t * CYCLE_MS) / 1000 * 0.6);
  const clockMin = Math.floor(elapsed / 60);
  const clockSec = elapsed % 60;

  const isComplete = t > 0.82;

  const hashChars = '0123456789abcdef';
  const fakeHash = Array.from({ length: 8 }, (_, i) => hashChars[(tick / 100 + i * 3) % 16 | 0]).join('');

  return (
    <div className="psur-preview">
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

      <div className="psur-progress-bar">
        <div className="psur-progress-fill" style={{ width: `${overallPct}%` }} />
      </div>

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

/* ── ROI calculator — real client-side math, no backend ── */
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function RoiCalculator() {
  const [psursPerYear, setPsursPerYear] = useState(6);
  const [hoursPerPsur, setHoursPerPsur] = useState(80);
  const [blendedRate, setBlendedRate] = useState(95);

  const result = useMemo(() => {
    // With Smarticus, the first draft is generated in minutes; the remaining
    // human effort is review + sign-off, modeled at ~12% of manual assembly time.
    const reviewFraction = 0.12;
    const reviewHours = hoursPerPsur * reviewFraction;
    const hoursSavedPerPsur = Math.max(hoursPerPsur - reviewHours, 0);
    const hoursSaved = hoursSavedPerPsur * psursPerYear;
    const costSaved = hoursSaved * blendedRate;
    const manualWeeks = (hoursPerPsur * psursPerYear) / 40;
    const newWeeks = (reviewHours * psursPerYear) / 40;
    const weeksSaved = Math.max(manualWeeks - newWeeks, 0);
    const reductionPct = hoursPerPsur > 0 ? Math.round((hoursSavedPerPsur / hoursPerPsur) * 100) : 0;
    return { hoursSaved, costSaved, weeksSaved, reductionPct, reviewHours };
  }, [psursPerYear, hoursPerPsur, blendedRate]);

  const controls: { label: string; value: number; set: (v: number) => void; min: number; max: number; step: number; suffix?: string; prefix?: string }[] = [
    { label: 'PSURs / PMSRs per year', value: psursPerYear, set: setPsursPerYear, min: 1, max: 60, step: 1 },
    { label: 'Hours to assemble one (manual)', value: hoursPerPsur, set: setHoursPerPsur, min: 10, max: 200, step: 5, suffix: ' hrs' },
    { label: 'Blended team cost', value: blendedRate, set: setBlendedRate, min: 40, max: 250, step: 5, prefix: '$', suffix: ' /hr' },
  ];

  return (
    <div className="roi-grid">
      <div className="roi-inputs">
        {controls.map((c) => (
          <div key={c.label} className="roi-field">
            <div className="roi-field-head">
              <label htmlFor={`roi-${c.label}`}>{c.label}</label>
              <span className="roi-field-value">{c.prefix ?? ''}{number.format(c.value)}{c.suffix ?? ''}</span>
            </div>
            <input
              id={`roi-${c.label}`}
              type="range"
              min={c.min}
              max={c.max}
              step={c.step}
              value={c.value}
              onChange={(e) => c.set(Number(e.target.value))}
              className="roi-range"
            />
          </div>
        ))}
        <p className="roi-note">
          Assumes Smarticus drafts the PSUR in minutes; remaining effort is QA review and sign-off
          (~{number.format(result.reviewHours)} hrs each). Adjust the inputs to your program.
        </p>
      </div>

      <div className="roi-output">
        <div className="roi-output-row">
          <div className="roi-stat">
            <div className="roi-stat-value">{number.format(result.hoursSaved)}</div>
            <div className="roi-stat-label">Hours saved / year</div>
          </div>
          <div className="roi-stat">
            <div className="roi-stat-value">{result.reductionPct}%</div>
            <div className="roi-stat-label">Less time per report</div>
          </div>
        </div>
        <div className="roi-headline">
          <div className="roi-headline-label">Estimated savings / year</div>
          <div className="roi-headline-value">{currency.format(result.costSaved)}</div>
          <div className="roi-headline-sub">≈ {number.format(result.weeksSaved)} weeks of calendar time returned to your team</div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const [, navigate] = useLocation();

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
        .psur-decision .d-dot { width: 5px; height: 5px; border-radius: 50%; }
        .psur-decision .d-hash { font-family: var(--mono); font-size: 9px; color: var(--ink-4); }
        @keyframes decision-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .psur-progress-bar { height: 3px; background: var(--rule); position: relative; overflow: hidden; }
        .psur-progress-fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ok); transition: width 0.5s ease; }
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
          <button className="nav-link" onClick={() => document.getElementById('service')?.scrollIntoView({ behavior: 'smooth' })}>Services</button>
          <button className="nav-link" onClick={() => document.getElementById('roi')?.scrollIntoView({ behavior: 'smooth' })}>ROI</button>
          <button className="nav-link" onClick={() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' })}>Why Smarticus</button>
          <button className="nav-link" onClick={() => document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' })}>Agents</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <button className="nav-link" onClick={() => navigate('/app')}>Sign in</button>
          <button className="btn btn-orange" onClick={openCalendly}>Book a demo</button>
        </div>
      </nav>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '56px 32px',
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
            <div className="eyebrow" style={{ marginBottom: 16 }}>
              <span className="signal-dot" style={{ marginRight: 8, verticalAlign: 1 }} />
              The PSUR agent · built on the Smarticus platform
            </div>
            <h1
              style={{
                margin: 0,
                maxWidth: 640,
                fontSize: 'clamp(34px, 5.2vw, 56px)',
                lineHeight: 1.04,
                letterSpacing: '-0.03em',
                fontWeight: 600,
                color: 'var(--ink)',
              }}
            >
              Draft a PSUR in minutes.
              <br />
              <span style={{ color: 'var(--orange)' }}>Audit-ready in 24–48 hours.</span>
            </h1>
            <p
              style={{
                margin: '20px 0 0',
                maxWidth: 540,
                color: 'var(--ink-2)',
                fontSize: 17,
                lineHeight: 1.55,
              }}
            >
              Smarticus turns your post-market data into a regulator-grade PSUR — structured to
              MDCG 2022-21, every figure traced to its source, every decision defensible. The two
              weeks of manual assembly disappear.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28 }}>
              <button className="btn btn-orange" onClick={() => navigate('/demo/psur')}>
                Watch a PSUR draft itself
                <ArrowRight />
              </button>
              <button className="btn btn-ghost" onClick={openCalendly}>
                Book a demo
              </button>
            </div>
            <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: '8px 20px', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>
              <span>MDCG 2022-21</span>
              <span>EU MDR Art. 86</span>
              <span>ISO 14971</span>
              <span>UK MDR</span>
              <span style={{ color: 'var(--ink-4)' }}>· Your data stays in your workspace</span>
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

        /* outcome metric band */
        .metric-band {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border: 1px solid var(--rule);
          border-radius: var(--r-3);
          overflow: hidden;
          background: var(--surface);
        }
        .metric-cell { padding: 26px 24px; border-right: 1px solid var(--rule); }
        .metric-cell:last-child { border-right: 0; }
        .metric-value { font-size: clamp(30px, 4vw, 44px); font-weight: 600; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
        .metric-value .accent { color: var(--orange); }
        .metric-label { margin-top: 8px; font-size: 13px; color: var(--ink-2); line-height: 1.4; }
        .metric-sub { margin-top: 4px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-4); }
        @media (max-width: 880px) { .metric-band { grid-template-columns: 1fr 1fr; } .metric-cell:nth-child(2) { border-right: 0; } .metric-cell:nth-child(1), .metric-cell:nth-child(2) { border-bottom: 1px solid var(--rule); } }

        /* service tiers */
        .service-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 36px; }
        @media (max-width: 880px) { .service-grid { grid-template-columns: 1fr; } }
        .service-card {
          position: relative;
          border: 1px solid var(--rule);
          border-radius: var(--r-3);
          background: var(--surface);
          padding: 28px;
          display: flex;
          flex-direction: column;
          transition: border-color var(--t-base) var(--ease);
        }
        .service-card:hover { border-color: var(--rule-strong); }
        .service-card.featured { border-color: var(--orange); }
        .service-tag {
          position: absolute; top: -10px; left: 24px;
          font-family: var(--sans); font-size: 10px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: #fff; background: var(--orange);
          padding: 3px 8px; border-radius: var(--radius-sm);
        }
        .service-time { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--orange); }
        .service-title { margin: 10px 0 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
        .service-desc { margin: 10px 0 0; font-size: 15px; line-height: 1.55; color: var(--ink-2); }

        /* ROI */
        .roi-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 24px; margin-top: 36px; }
        @media (max-width: 880px) { .roi-grid { grid-template-columns: 1fr; } }
        .roi-inputs { border: 1px solid var(--rule); border-radius: var(--r-3); background: var(--surface); padding: 26px; }
        .roi-field { margin-bottom: 22px; }
        .roi-field-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .roi-field-head label { font-size: 13.5px; color: var(--ink-2); }
        .roi-field-value { font-family: var(--mono); font-size: 15px; font-weight: 500; color: var(--ink); }
        .roi-range { width: 100%; -webkit-appearance: none; appearance: none; height: 3px; background: var(--rule-strong); border-radius: 2px; outline: none; padding: 0; border: 0; }
        .roi-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--orange); cursor: pointer; border: 3px solid var(--surface); box-shadow: 0 0 0 1px var(--orange); }
        .roi-range::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--orange); cursor: pointer; border: 3px solid var(--surface); }
        .roi-note { margin: 4px 0 0; font-size: 12px; line-height: 1.5; color: var(--ink-4); }
        .roi-output { border: 1px solid var(--orange); border-radius: var(--r-3); background: var(--surface); padding: 26px; display: flex; flex-direction: column; justify-content: center; }
        .roi-output-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--rule); }
        .roi-stat-value { font-size: 30px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
        .roi-stat-label { margin-top: 6px; font-size: 12px; color: var(--ink-3); }
        .roi-headline-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-4); }
        .roi-headline-value { font-size: clamp(34px, 5vw, 48px); font-weight: 600; letter-spacing: -0.035em; line-height: 1; color: var(--orange); margin-top: 8px; }
        .roi-headline-sub { margin-top: 10px; font-size: 13px; color: var(--ink-2); line-height: 1.45; }

        /* comparison */
        .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: 36px; border: 1px solid var(--rule); border-radius: var(--r-3); overflow: hidden; }
        @media (max-width: 760px) { .compare-grid { grid-template-columns: 1fr; } }
        .compare-col { padding: 28px; }
        .compare-col.them { background: var(--paper-deep); border-right: 1px solid var(--rule); }
        .compare-col.us { background: var(--surface); }
        .compare-head { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 4px; }
        .compare-sub { font-size: 12.5px; color: var(--ink-3); margin: 0 0 18px; }
        .compare-row { display: flex; gap: 10px; align-items: flex-start; padding: 11px 0; border-top: 1px solid var(--rule); font-size: 14px; line-height: 1.45; }
        .compare-row .mk { flex-shrink: 0; margin-top: 2px; }
        .compare-col.them .compare-row { color: var(--ink-3); }
        .compare-col.us .compare-row { color: var(--ink); }

        .x-mark { width: 16px; height: 16px; border-radius: var(--radius-sm); border: 1px solid var(--rule-strong); color: var(--ink-4); display: inline-flex; align-items: center; justify-content: center; }

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

        @media (max-width: 880px) {
          .product-row { grid-template-columns: 1fr; gap: 28px; padding: 40px 0; }
          .product-row.flip > .product-visual { order: 0; }
          .nav-mid { display: none !important; }
        }
      `}</style>

      {/* ── Trust strip ── */}
      <section className="container" style={{ padding: '8px 32px 40px' }}>
        <p style={{ textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-4)', margin: '0 0 20px' }}>
          Grounded in the regulations that govern your reports
        </p>
        <RegulatorHeroRail />
      </section>

      {/* ── Outcome metric band ── */}
      <section className="container" style={{ padding: '0 32px 16px' }}>
        <div className="metric-band">
          <div className="metric-cell">
            <div className="metric-value">Minutes</div>
            <div className="metric-label">To a complete PSUR first draft</div>
            <div className="metric-sub">from 2+ weeks manual</div>
          </div>
          <div className="metric-cell">
            <div className="metric-value"><span className="accent">24–48h</span></div>
            <div className="metric-label">To a fully audited, submission-ready PSUR</div>
            <div className="metric-sub">human-reviewed, remediated</div>
          </div>
          <div className="metric-cell">
            <div className="metric-value">99%</div>
            <div className="metric-label">Less time from data to draft</div>
            <div className="metric-sub">labor returned to your team</div>
          </div>
          <div className="metric-cell">
            <div className="metric-value">100%</div>
            <div className="metric-label">Of figures traced to source</div>
            <div className="metric-sub">zero fabrication, audit-ready</div>
          </div>
        </div>
      </section>

      {/* ── Services: two ways to get your PSUR ── */}
      <section id="service" className="container" style={{ padding: '56px 32px 24px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>The service</div>
        <h2 style={{ fontSize: 'clamp(30px, 4.2vw, 52px)', fontWeight: 600, letterSpacing: '-0.035em', margin: 0, lineHeight: 1.04, maxWidth: 880 }}>
          Two ways to get your PSUR. Both end in a defensible record.
        </h2>
        <p style={{ marginTop: 18, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 680 }}>
          Run it yourself in minutes, or let our regulatory team deliver a submission-ready report in
          a day or two. Same engine, same traceability, same obligation graph underneath.
        </p>

        <div className="service-grid">
          <div className="service-card">
            <span className="service-time">Self-serve · minutes</span>
            <h3 className="service-title">PSUR Draft, on demand</h3>
            <p className="service-desc">
              Bring controlled source data, get an MDCG 2022-21 draft back in minutes — with a live
              decision trace behind every section. Perfect for first drafts, internal review, and
              rescuing a deadline.
            </p>
            <ul className="check-list">
              {[
                'Sections A\u2013M generated and cross-referenced',
                'Deterministic statistics \u2014 numbers never fabricated',
                'Tamper-evident decision trace + one-click audit pack',
                'DOCX + JSON export, ready for your reviewer',
              ].map((b) => (<li key={b}><CheckOrange /><span>{b}</span></li>))}
            </ul>
            <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-orange" onClick={() => navigate('/demo/psur')}>Watch it run<ArrowRight /></button>
              <button className="btn btn-ghost" onClick={() => navigate('/app/psur')}>Open PSUR builder</button>
            </div>
          </div>

          <div className="service-card featured">
            <span className="service-tag">Most popular</span>
            <span className="service-time">Managed · 24–48 hours</span>
            <h3 className="service-title">Fully Audited PSUR, delivered</h3>
            <p className="service-desc">
              Our regulatory team drives the engine, reviews every section, remediates findings, and
              hands you a submission-ready PSUR plus a complete audit pack — typically within
              24–48 hours.
            </p>
            <ul className="check-list">
              {[
                'Human-in-the-loop review against MDCG 2022-21 + EU MDR',
                'Audit-remediation loop closed before delivery',
                'Notified Body\u2013ready report and evidence pack',
                'Verified hash-chained trace for every decision',
              ].map((b) => (<li key={b}><CheckOrange /><span>{b}</span></li>))}
            </ul>
            <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-orange" onClick={openCalendly}>Book a demo<ArrowRight /></button>
              <button className="btn btn-ghost" onClick={() => navigate('/contact')}>Talk to our team</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── ROI calculator ── */}
      <section id="roi" style={{ background: 'var(--paper-deep)', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', marginTop: 40 }}>
        <div className="container" style={{ padding: '64px 32px' }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>The math</div>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 820 }}>
            See what PSUR automation returns to your team.
          </h2>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 640 }}>
            Move the sliders to your program. The numbers update live — no sign-up, no sales call required.
          </p>
          <RoiCalculator />
          <div style={{ marginTop: 28 }}>
            <button className="btn btn-orange" onClick={() => navigate('/contact')}>
              Get this costed for your devices
              <ArrowRight />
            </button>
          </div>
        </div>
      </section>

      {/* ── Why Smarticus (head-to-head) ── */}
      <section id="compare" className="container" style={{ padding: '64px 32px 24px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>Why Smarticus</div>
        <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 46px)', fontWeight: 600, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 880 }}>
          Purpose-built for the report. Not a PMS suite with reporting bolted on.
        </h2>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 680 }}>
          Generic post-market suites make you assemble the PSUR by hand and store your data in their
          cloud. Smarticus generates the report, grounds every line in the regulation, and leaves your
          data where it belongs.
        </p>

        <div className="compare-grid">
          <div className="compare-col them">
            <h3 className="compare-head">Bolted-on PMS suites</h3>
            <p className="compare-sub">Platform-first. The PSUR is still your problem.</p>
            {[
              'PSUR assembled by hand from exports and spreadsheets',
              'Salesforce-native — locked to a platform and per-seat licensing',
              'Your proprietary data lives in their cloud',
              'Audit evidence compiled manually across modules',
              'AI add-ons with no traceable rationale per decision',
              'Weeks of calendar time per report',
            ].map((t) => (
              <div className="compare-row" key={t}>
                <span className="mk x-mark" aria-hidden="true">
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </span>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <div className="compare-col us">
            <h3 className="compare-head" style={{ color: 'var(--orange)' }}>Smarticus</h3>
            <p className="compare-sub">Report-first. The PSUR writes itself, grounded in the regs.</p>
            {[
              'MDCG 2022-21 draft generated in minutes from your source data',
              'No platform lock-in — runs standalone or connects to your eQMS',
              'Your data stays in your workspace; the model queries the requirement graph',
              'One-click, tamper-evident audit pack with a verified hash chain',
              'Every decision cites its reason and its requirement',
              'Fully audited, submission-ready option in 24–48 hours',
            ].map((t) => (
              <div className="compare-row" key={t}>
                <span className="mk"><CheckOrange /></span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The agent library (Smarticus platform) ── */}
      <section id="products" className="container" style={{ padding: '64px 32px 24px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>The agent library</div>
        <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 48px)', fontWeight: 600, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05, maxWidth: 880 }}>
          PSUR is one agent. Smarticus runs the rest.
        </h2>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 700 }}>
          Smarticus is the platform Thinkertons built to create, run, and experiment with AI agents
          across <strong style={{ color: 'var(--ink)' }}>medical device and pharma</strong>. Every agent is grounded in the
          regulation, traces each decision, and is yours to configure. PSUR is simply the one that pays
          for itself first.
        </p>

        <div style={{ marginTop: 24 }}>
        {PRODUCTS.map((p, i) => (
          <article key={p.title} className={`product-row ${i % 2 === 1 ? 'flip' : ''}`}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>{p.eyebrow}</div>
              <h3 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0 }}>
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
                  <ArrowRight />
                </button>
              </div>
            </div>
            <div className="product-visual">
              <ProductVisual kind={p.visual} />
            </div>
          </article>
        ))}
        </div>

        {/* Build-your-own / managed strip — both audiences */}
        <div
          style={{
            marginTop: 32,
            border: '1px solid var(--rule)',
            borderRadius: 'var(--r-3)',
            background: 'var(--paper-deep)',
            padding: '32px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 24,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <h3 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
              Build your own agent — or have us run it for you.
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)' }}>
              Compose agents for complaints, CAPA, risk, vigilance, and PSUR/PMSR on the same grounded
              platform — for medical device and pharma. Run them self-serve, or let our team deliver the
              outcome as a managed service.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-orange" onClick={() => navigate('/app')}>
              Start building on Smarticus
              <ArrowRight />
            </button>
            <button className="btn btn-ghost" onClick={openCalendly}>
              Book a demo
            </button>
          </div>
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
              fontSize: 'clamp(38px, 5.6vw, 76px)',
              fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.02,
              color: 'var(--paper)', maxWidth: 1100, margin: 0,
            }}
          >
            Your next PSUR can be drafting itself <span style={{ color: 'var(--orange)' }}>this week</span>.
          </h2>
          <p style={{ marginTop: 22, color: 'var(--ink-4)', fontSize: 16, maxWidth: 600, lineHeight: 1.55 }}>
            Book a 20-minute demo and watch your own report take shape — or have us deliver a fully
            audited PSUR in 24–48 hours.
          </p>

          <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-orange" onClick={openCalendly}>
              Book a demo
              <ArrowRight />
            </button>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--paper)', borderColor: 'var(--ink-3)', background: 'transparent' }}
              onClick={() => navigate('/demo/psur')}
            >
              Watch a PSUR draft itself
            </button>
          </div>

          <p style={{ marginTop: 24, color: 'var(--ink-4)', fontSize: 14, maxWidth: 560 }}>
            Smarticus does not replace QMS judgment. It drafts the records — your team reviews and releases.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
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
            <span>Smarticus · The AI agent platform for medical device & pharma</span>
          </div>
          <span>2026 · Built by Thinkertons</span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
