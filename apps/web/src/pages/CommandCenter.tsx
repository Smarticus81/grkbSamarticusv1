import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '../lib/queryClient.js';
import { REGULATIONS, REG_COUNT, OBLIGATION_COUNT } from '../lib/coverage.js';
import { EmptyState } from '../components/ui/EmptyState.js';

/* ── Constants ── */
const EVIDENCE_COUNT = 347;
const REG_SUBTITLE = 'EU MDR \u00b7 ISO 13485 \u00b7 ISO 14971 \u00b7 21 CFR 820 \u00b7 UK MDR \u00b7 IMDRF \u00b7 MDCG \u00b7 IEC 62304';

interface QuickAction {
  title: string;
  description: string;
  badges: string[];
  risk: 'high' | 'medium' | 'low';
  href: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: 'PSUR Draft Package',
    description: 'Draft a PSUR with MDCG 2022-21 structure',
    badges: ['EU MDR', 'MDCG 2022-21'],
    risk: 'high',
    href: '/app/builder?preset=psur',
  },
  {
    title: 'CAPA File Evaluator',
    description: 'Check a CAPA against ISO 13485 + 21 CFR 820 requirements',
    badges: ['ISO 13485', '21 CFR 820'],
    risk: 'high',
    href: '/app/builder?preset=capa',
  },
  {
    title: 'Complaint Review Assistant',
    description: 'Triage a complaint with regulatory timelines',
    badges: ['EU MDR', 'ISO 13485', '21 CFR 820'],
    risk: 'medium',
    href: '/app/builder?preset=complaint',
  },
  {
    title: 'IMDRF Coding Assistant',
    description: 'Auto-code an adverse event with IMDRF annexes',
    badges: ['IMDRF'],
    risk: 'low',
    href: '/app/builder?preset=imdrf',
  },
];

const RISK_COLORS: Record<string, string> = {
  high: 'var(--orange)',
  medium: 'var(--ink-2)',
  low: 'var(--ink-3)',
};

/* ── Stat block ── */
function StatBlock({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontFamily: 'var(--sans)',
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color: 'var(--ink)',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          color: 'var(--ink-3)',
          marginTop: 4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
}

/* ── Quick-action card ── */
function QuickActionCard({ action }: { action: QuickAction }) {
  const [, navigate] = useLocation();

  return (
    <div
      className="ground-card"
      onClick={() => navigate(action.href)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}
        >
          {action.title}
        </div>
        <span
          style={{
            fontSize: 18,
            color: 'var(--ink-3)',
            lineHeight: 1,
            flexShrink: 0,
            marginLeft: 8,
          }}
        >
          &rarr;
        </span>
      </div>

      <div
        style={{
          fontSize: 13,
          color: 'var(--ink-2)',
          lineHeight: 1.5,
        }}
      >
        {action.description}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
        {action.badges.map((badge) => (
          <span
            key={badge}
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              padding: '3px 8px',
              border: '1px solid var(--rule)',
              borderRadius: 3,
              color: 'var(--ink-2)',
              background: 'var(--paper)',
            }}
          >
            {badge}
          </span>
        ))}
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            padding: '3px 8px',
            borderRadius: 3,
            color: RISK_COLORS[action.risk],
            border: `1px solid ${RISK_COLORS[action.risk]}`,
            textTransform: 'uppercase',
          }}
        >
          {action.risk} risk
        </span>
      </div>
    </div>
  );
}

/* ── Main page ── */
export function CommandCenter() {
  const [, navigate] = useLocation();

  /* Optional: try to fetch live stats from the API; fall back to static constants */
  const { data: liveStats } = useQuery({
    queryKey: ['graph-stats'],
    queryFn: () =>
      api<{ regulations: number; obligations: number; evidenceTypes: number }>(
        '/api/graph/stats',
      ),
    retry: false,
    staleTime: 60_000,
  });

  const regCount = liveStats?.regulations ?? REG_COUNT;
  const obligationCount = liveStats?.obligations ?? OBLIGATION_COUNT;
  const evidenceCount = liveStats?.evidenceTypes ?? EVIDENCE_COUNT;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 32px 80px' }}>
      {/* ── Graph status card ── */}
      <div
        className="ground-card"
        style={{
          padding: 32,
          marginBottom: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span className="signal-dot" />
          <span
            className="eyebrow"
            style={{ color: 'var(--ink-2)', fontSize: 10, letterSpacing: '0.14em' }}
          >
            THE GROUND / LIVE
          </span>
        </div>

        <div
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--ink)',
            marginBottom: 6,
            letterSpacing: '-0.025em',
          }}
        >
          The ground is live. What will you build today?
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: 540, margin: '0 auto' }}>
          Every regulation below is loaded into your private knowledge graph — ready to ground any agent, anywhere.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 24,
            margin: '28px 0 20px',
          }}
        >
          <StatBlock value={regCount} label="Regulations" />
          <StatBlock value={obligationCount} label="Requirements" />
          <StatBlock value={evidenceCount} label="Required Data Types" />
        </div>

        <div
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            color: 'var(--ink-3)',
            textAlign: 'center',
            letterSpacing: '0.02em',
          }}
        >
          {REG_SUBTITLE}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 28,
            justifyContent: 'center',
          }}
        >
          <button className="btn btn-orange" onClick={() => navigate('/app/builder')}>
            Build QMS tool
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/app/sandbox')}>
            Run sandbox
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/app/builder?step=review-controls')}>
            Check output
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/app/connect')}>
            Connect MCP
          </button>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div style={{ marginBottom: 40 }}>
        <span
          className="eyebrow"
          style={{ display: 'block', marginBottom: 6, color: 'var(--ink-2)' }}
        >
          START FROM A TEMPLATE
        </span>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-3)' }}>
          Each template scopes the right requirements, the right evidence, and a working sandbox run — in one click.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard key={action.title} action={action} />
          ))}
        </div>
      </div>

      {/* ── Recent activity ── */}
      <div style={{ marginBottom: 40 }}>
        <span
          className="eyebrow"
          style={{ display: 'block', marginBottom: 16, color: 'var(--ink-2)' }}
        >
          RECENT ACTIVITY
        </span>
        <div className="ground-card" style={{ padding: '8px 0' }}>
          <EmptyState
            title="You haven’t run anything yet."
            body="The Sandbox lets you run any QMS process in seconds and watch the requirements get satisfied — or not — in real time."
            primaryAction={{ label: 'Run your first process', href: '/app/sandbox' }}
            secondaryAction={{ label: 'Build a tool first', href: '/app/builder' }}
          />
        </div>
      </div>

      {/* ── Graph coverage ── */}
      <div>
        <span
          className="eyebrow"
          style={{ display: 'block', marginBottom: 6, color: 'var(--ink-2)' }}
        >
          REQUIREMENT COVERAGE
        </span>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-3)' }}>
          Eight regulations. Every requirement, available to every grounded agent.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {REGULATIONS.map((reg) => (
            <div
              key={reg.name}
              className="ground-card"
              style={{
                padding: '16px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  letterSpacing: '-0.005em',
                }}
              >
                {reg.name}
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--ink-3)',
                  letterSpacing: '0.04em',
                }}
              >
                {reg.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CommandCenter;
