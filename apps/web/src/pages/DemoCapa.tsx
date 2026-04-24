/**
 * DemoCapa — end-to-end demo of Smarticus grounding a CAPA evaluation.
 * "The page that will convert investors and customers."
 */

import { useEffect, useState } from 'react';

/* ── Animated obligation chain SVG ────────────────────────────────────── */

const CHAIN_NODES = [
  { label: 'ISO 13485 \u00A78.5.2' },
  { label: '21 CFR 820.100' },
  { label: 'EU MDR Annex IX' },
  { label: 'Required evidence' },
  { label: 'Agent output validation' },
  { label: 'Audit trace' },
];

function ObligationPathwaySVG() {
  const nodeSpacing = 80;
  const cx = 160;
  const startY = 30;
  const r = 22;
  const svgHeight = startY + (CHAIN_NODES.length - 1) * nodeSpacing + r + 10;

  return (
    <svg
      width={320}
      height={svgHeight}
      viewBox={`0 0 320 ${svgHeight}`}
      style={{ display: 'block', margin: '0 auto' }}
    >
      {CHAIN_NODES.map((node, i) => {
        const y = startY + i * nodeSpacing;
        if (i < CHAIN_NODES.length - 1) {
          const nextY = startY + (i + 1) * nodeSpacing;
          return (
            <line
              key={`line-${i}`}
              x1={cx}
              y1={y + r}
              x2={cx}
              y2={nextY - r}
              stroke="var(--rule-strong)"
              strokeWidth={2}
              className={`chain-line chain-line-${Math.min(i + 1, 4)}`}
            />
          );
        }
        return null;
      })}
      {CHAIN_NODES.map((node, i) => {
        const y = startY + i * nodeSpacing;
        const isVerified = node.label === 'Audit trace';
        return (
          <g key={`node-${i}`}>
            <circle
              cx={cx}
              cy={y}
              r={r}
              fill={isVerified ? 'var(--orange)' : 'var(--ink)'}
              stroke={isVerified ? 'var(--orange)' : 'var(--ink)'}
              strokeWidth={2}
            />
            <text
              x={cx}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--paper)"
              fontFamily="var(--mono)"
              fontSize={7}
              letterSpacing="0.04em"
            >
              {i + 1}
            </text>
            <text
              x={cx + r + 14}
              y={y + 1}
              dominantBaseline="central"
              fill="var(--ink)"
              fontFamily="var(--mono)"
              fontSize={11}
              letterSpacing="0.02em"
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Animated detection SVG ───────────────────────────────────────────── */

function DetectionSVG() {
  return (
    <svg width={280} height={120} viewBox="0 0 280 120" style={{ display: 'block', margin: '0 auto' }}>
      <rect x={10} y={40} width={80} height={40} rx={4} fill="var(--paper-deep)" stroke="var(--rule-strong)" strokeWidth={1} />
      <text x={50} y={64} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--mono)" fontSize={9}>CAPA draft</text>

      <line x1={92} y1={60} x2={118} y2={60} stroke="var(--rule-strong)" strokeWidth={2} className="chain-line chain-line-1" />

      <circle cx={140} cy={60} r={20} fill="var(--orange)" />
      <text x={140} y={63} textAnchor="middle" fill="#fff" fontFamily="var(--mono)" fontSize={7} letterSpacing="0.06em">SCAN</text>

      <line x1={162} y1={60} x2={188} y2={60} stroke="var(--rule-strong)" strokeWidth={2} className="chain-line chain-line-2" />

      <rect x={190} y={40} width={80} height={40} rx={4} fill="var(--paper-deep)" stroke="var(--err)" strokeWidth={1} />
      <text x={230} y={58} textAnchor="middle" fill="var(--err)" fontFamily="var(--mono)" fontSize={8}>4 GAPS</text>
      <text x={230} y={72} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--mono)" fontSize={7}>detected</text>
    </svg>
  );
}

/* ── Gap card ─────────────────────────────────────────────────────────── */

function GapCard({ index, obligationId, citation, description }: {
  index: number;
  obligationId: string;
  citation: string;
  description: string;
}) {
  return (
    <div
      className={`rise-${Math.min(index + 1, 4)}`}
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--rule)',
        borderLeft: '3px solid var(--err)',
        borderRadius: 'var(--r-2)',
        padding: '14px 16px',
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span className="badge badge-err">Missing</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
          {obligationId}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, marginBottom: 4 }}>{citation}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{description}</div>
    </div>
  );
}

/* ── Trace timeline ───────────────────────────────────────────────────── */

const TRACE_EVENTS = [
  { time: '00:00.000', actor: 'SandboxRunner', decision: 'Process started', hash: 'a3f8c1d2' },
  { time: '00:00.012', actor: 'QualificationGate', decision: 'Qualification passed', hash: 'b7e2f401' },
  { time: '00:00.089', actor: 'GraphClient', decision: 'Graph queried (14 obligations)', hash: 'c9d4a823' },
  { time: '00:00.134', actor: 'EvidenceChecker', decision: 'Evidence checked', hash: 'd1f6b935' },
  { time: '00:01.247', actor: 'LLMAbstraction', decision: 'LLM response received', hash: 'e4a8c047' },
  { time: '00:01.289', actor: 'StrictGate', decision: 'StrictGate passed', hash: 'f2b9d159' },
  { time: '00:01.301', actor: 'ComplianceValidator', decision: 'Compliance check passed', hash: 'a5c1e261' },
  { time: '00:01.310', actor: 'DecisionTraceService', decision: 'Trace sealed', hash: 'b8d2f373' },
];

function TraceTimeline() {
  return (
    <div className="stepper">
      {TRACE_EVENTS.map((evt, i) => (
        <div key={i} className="stepper-step">
          <div className={`stepper-dot ${i === TRACE_EVENTS.length - 1 ? 'completed' : 'active'}`}>
            {i === TRACE_EVENTS.length - 1 ? '\u2713' : String(i + 1)}
          </div>
          <div style={{ flex: 1, paddingTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
                {evt.time}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{evt.actor}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{evt.decision}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>
              sha256:{evt.hash}...
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Section wrapper ──────────────────────────────────────────────────── */

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ padding: '56px 0', ...style }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px' }}>
        {children}
      </div>
    </section>
  );
}

function StepLabel({ number, label }: { number: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'var(--ink)', color: 'var(--paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500,
        flexShrink: 0,
      }}>
        {number}
      </div>
      <div className="eyebrow" style={{ fontSize: 12 }}>{label}</div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────── */

export function DemoCapa() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(true); }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--paper)' }}>

      {/* Hero */}
      <Section style={{ paddingTop: 72, paddingBottom: 48 }}>
        <div className="eyebrow" style={{ marginBottom: 14, color: 'var(--orange)' }}>
          Demo / CAPA Evaluator
        </div>
        <h1 className="display" style={{ fontSize: 42, lineHeight: 1.05, maxWidth: 720, marginBottom: 16 }}>
          Watch Smarticus ground a CAPA evaluation.
        </h1>
        <p style={{ fontSize: 17, color: 'var(--ink-3)', maxWidth: 640, lineHeight: 1.55, margin: 0 }}>
          A generic CAPA draft goes in. A regulation-aware, evidence-checked, audit-ready output comes out.
        </p>
      </Section>

      <hr className="brand-rule" style={{ maxWidth: 1080, margin: '0 auto' }} />

      {/* Step 1: Generic CAPA draft */}
      <Section>
        <StepLabel number={1} label="Generic CAPA draft (the input)" />
        <div className="comparison-before" style={{
          fontFamily: 'var(--mono)',
          fontSize: 13,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          color: 'var(--ink-2)',
        }}>
{`CAPA Report \u2014 Device Connector Failure
Root Cause: Connector seal degradation due to material incompatibility.
Corrective Action: Replace seal material with medical-grade silicone.
Verification: Testing confirms improved durability.
Effectiveness: Will monitor field returns for 6 months.`}
        </div>
      </Section>

      <hr className="brand-rule" style={{ maxWidth: 1080, margin: '0 auto' }} />

      {/* Step 2: Smarticus detects missing obligations */}
      <Section>
        <StepLabel number={2} label="Smarticus detects missing obligations" />
        <div style={{ marginBottom: 28 }}>
          <DetectionSVG />
        </div>
        <div>
          <GapCard
            index={0}
            obligationId="ISO-13485-8.5.2"
            citation="ISO 13485 \u00A78.5.2"
            description="Corrective action must include root cause methodology"
          />
          <GapCard
            index={1}
            obligationId="21-CFR-820.100-a-1"
            citation="21 CFR 820.100(a)(1)"
            description="Must investigate cause of nonconformity"
          />
          <GapCard
            index={2}
            obligationId="EU-MDR-ANNEX-IX-3.1"
            citation="EU MDR Annex IX, 3.1"
            description="Technical documentation must be updated"
          />
          <GapCard
            index={3}
            obligationId="ISO-14971-7.4"
            citation="ISO 14971 \u00A77.4"
            description="No evidence of risk re-assessment per ISO 14971"
          />
        </div>
      </Section>

      <hr className="brand-rule" style={{ maxWidth: 1080, margin: '0 auto' }} />

      {/* Step 3: Obligation pathway visualization */}
      <Section>
        <StepLabel number={3} label="Obligation pathway visualization" />
        <div style={{
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
          padding: '32px 24px',
        }}>
          <ObligationPathwaySVG />
        </div>
      </Section>

      <hr className="brand-rule" style={{ maxWidth: 1080, margin: '0 auto' }} />

      {/* Step 4: Evidence requirements */}
      <Section>
        <StepLabel number={4} label="Evidence requirements" />
        <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--r-2)', overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Evidence Type</th>
                <th>Required By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { type: 'Root cause analysis record', by: 'ISO 13485 \u00A78.5.2', status: 'Required', badge: 'badge-err' },
                { type: 'Risk assessment update', by: 'ISO 14971', status: 'Required', badge: 'badge-err' },
                { type: 'CAPA effectiveness data', by: '21 CFR 820.100', status: 'Required', badge: 'badge-err' },
                { type: 'Technical documentation', by: 'EU MDR Annex IX', status: 'Required', badge: 'badge-err' },
                { type: 'Field return data', by: 'ISO 13485 \u00A78.2.2', status: 'Available', badge: 'badge-ok' },
              ].map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{row.type}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{row.by}</td>
                  <td><span className={`badge ${row.badge}`}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <hr className="brand-rule" style={{ maxWidth: 1080, margin: '0 auto' }} />

      {/* Step 5: Corrected output */}
      <Section>
        <StepLabel number={5} label="Smarticus-grounded output" />
        <div className="comparison-after" style={{
          fontFamily: 'var(--mono)',
          fontSize: 12.5,
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          color: 'var(--ink-2)',
        }}>
{`CAPA Report \u2014 Device Connector Failure
ID: CAPA-2024-0847  |  Trace: #RG-4102

1. Nonconformity Description (ISO 13485 \u00A78.5.2)
   Connector seal degradation causing intermittent device failures.
   Source: Field complaint batch FC-2024-0291 through FC-2024-0315.

2. Root Cause Investigation (ISO 13485 \u00A78.5.2(b), 21 CFR 820.100(a)(1))
   Methodology: 5-Why + Fishbone analysis
   Root cause: Material incompatibility between EPDM seal and cleaning agent residue.
   Evidence: Material compatibility test report MTR-2024-0122.

3. Corrective Action (21 CFR 820.100(a)(2))
   Replace EPDM seal with medical-grade silicone (USP Class VI).
   Supplier qualification: SQ-2024-0089 (completed 2024-03-15).

4. Risk Re-Assessment (ISO 14971 \u00A77.4)
   Pre-correction RPN: 180 (severity 9 \u00D7 occurrence 4 \u00D7 detection 5)
   Post-correction RPN: 36 (severity 9 \u00D7 occurrence 2 \u00D7 detection 2)
   Risk file updated: RF-2024-0031 rev 3.

5. Verification & Effectiveness (21 CFR 820.100(a)(4-5))
   Verification: Accelerated aging + real-time testing (protocol VER-2024-0055).
   Effectiveness monitoring: 6-month field return tracking.
   Review gate: HITL approval required at 3-month and 6-month.

6. Regulatory Documentation (EU MDR Annex IX, 3.1)
   Technical documentation updated per STED structure.
   Design history file: DHF-2024-0031 rev 4.

Citations: 6 obligations satisfied | 4 evidence records attached
StrictGate: PASSED | Compliance score: 1.0`}
        </div>
      </Section>

      <hr className="brand-rule" style={{ maxWidth: 1080, margin: '0 auto' }} />

      {/* Step 6: Sealed trace */}
      <Section>
        <StepLabel number={6} label="Sealed trace" />
        <div style={{
          background: 'var(--paper-deep)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
          padding: '24px 20px',
        }}>
          <TraceTimeline />
        </div>
      </Section>

      {/* Final CTA */}
      <section style={{
        background: 'var(--ink)',
        padding: '72px 0',
        marginTop: 24,
      }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <h2 className="display" style={{
            fontSize: 32,
            color: 'var(--paper)',
            marginBottom: 16,
            lineHeight: 1.15,
          }}>
            This is not a chatbot.{' '}
            <span style={{ color: 'var(--orange)' }}>This is regulatory infrastructure for AI agents.</span>
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 32 }}>
            <a
              href="/app/sandbox"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', fontSize: 14, fontWeight: 500,
                borderRadius: 'var(--r-2)', textDecoration: 'none',
                border: '1px solid var(--orange)', cursor: 'pointer',
                color: '#fff', background: 'var(--orange)',
              }}
            >
              Open the sandbox
            </a>
            <a
              href="mailto:hello@smarticus.ai"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', fontSize: 14, fontWeight: 500,
                borderRadius: 'var(--r-2)', textDecoration: 'none',
                border: '1px solid var(--paper-edge)', cursor: 'pointer',
                color: 'var(--paper)', background: 'transparent',
              }}
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default DemoCapa;
