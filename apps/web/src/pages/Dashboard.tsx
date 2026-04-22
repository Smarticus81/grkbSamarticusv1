import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { RegulatorCompactStrip } from '../components/ui/RegulatorAssets.js';
import { api } from '../lib/queryClient.js';
import { REG_COUNT, OBLIGATION_COUNT } from '../lib/coverage.js';

interface GraphStats {
  total: number;
  jurisdictions: { jurisdiction: string; count: number }[];
  processTypes: { processType: string; count: number }[];
}

const QUICK_ACTIONS = [
  { n: '01', label: 'Open the sandbox',    desc: 'Pre-built agents with sample data, side-by-side eval.', href: '/app/sandbox' },
  { n: '02', label: 'Browse regulations',  desc: `${REG_COUNT} regulations / ${OBLIGATION_COUNT} obligations.`, href: '/app/regulations' },
  { n: '03', label: 'Inspect traces',      desc: 'Hash-chained decision records, replayable.', href: '/app/traces' },
  { n: '04', label: 'Connect an agent',    desc: 'API keys & MCP transport.', href: '/app/api-access' },
];

export function Dashboard() {
  const [, navigate] = useLocation();
  const stats = useQuery({
    queryKey: ['graph-stats'],
    queryFn: () => api<GraphStats>('/api/graph/stats').catch(() => null),
  });
  const s = stats.data;

  const figures = [
    { v: s ? new Set(s.jurisdictions.map((j) => j.jurisdiction)).size : REG_COUNT, label: 'regulations' },
    { v: s?.total ?? OBLIGATION_COUNT,                                              label: 'obligations' },
    { v: s?.processTypes?.length ?? 23,                                             label: 'processes' },
    { v: s?.jurisdictions?.length ?? 5,                                             label: 'markets' },
  ];

  return (
    <div style={{ padding: '32px 32px 40px', maxWidth: 1180, margin: '0 auto' }}>
      <div className="rise" style={{ marginBottom: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          <span className="signal-dot" style={{ marginRight: 10, verticalAlign: 1 }} />
          Ground / live
        </div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 'clamp(36px, 4.4vw, 56px)',
            fontWeight: 400,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          The ground is up. <span className="serif">Agents may proceed.</span>
        </h1>
        <p style={{ marginTop: 18, color: 'var(--ink-3)', fontSize: 15.5, maxWidth: 620, lineHeight: 1.55 }}>
          {REG_COUNT} regulations and {OBLIGATION_COUNT} obligations are loaded
          and queryable. Every agent call is qualified before execution and
          validated after.
        </p>
        <div style={{ marginTop: 18 }}>
          <RegulatorCompactStrip />
        </div>
      </div>

      <div
        className="rise-1"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
          marginBottom: 30,
        }}
      >
        {figures.map((f, i) => (
          <div
            key={f.label}
            style={{
              padding: '28px 24px',
              borderRight: i < figures.length - 1 ? '1px solid var(--rule)' : 'none',
              position: 'relative',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--sans)',
                fontSize: 44,
                fontWeight: 300,
                letterSpacing: '-0.03em',
                lineHeight: 1,
                color: 'var(--ink)',
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 6,
              }}
            >
              {f.v}
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block', alignSelf: 'center' }} />
            </div>
            <div
              style={{
                marginTop: 8,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
              }}
            >
              {f.label}
            </div>
          </div>
        ))}
      </div>

      <div className="rise-2" style={{ marginBottom: 24 }}>
        <div className="eyebrow" style={{ marginBottom: 18 }}>Where to go</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            borderTop: '1px solid var(--rule)',
            borderLeft: '1px solid var(--rule)',
          }}
        >
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.href}
              className="lift"
              onClick={() => navigate(a.href)}
              style={{
                textAlign: 'left',
                padding: '28px 24px',
                background: 'transparent',
                border: 'none',
                borderRight: '1px solid var(--rule)',
                borderBottom: '1px solid var(--rule)',
                cursor: 'pointer',
                color: 'var(--ink)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                minHeight: 134,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  color: 'var(--ink-4)',
                }}
              >
                {a.n}
              </span>
              <span
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 22,
                  fontWeight: 400,
                  letterSpacing: '-0.025em',
                  color: 'var(--ink)',
                  marginTop: 'auto',
                }}
              >
                {a.label}
              </span>
              <span style={{ fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
                {a.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}