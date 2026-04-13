import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { api } from '../lib/queryClient.js';
import { SmarticusLogo } from '../components/ui/logos.js';

interface GraphStats {
  total: number;
  jurisdictions: { jurisdiction: string; count: number }[];
  processTypes: { processType: string; count: number }[];
}

const QUICK_ACTIONS = [
  {
    icon: '⬡',
    label: 'Requirements',
    desc: 'Browse 303 regulatory requirements across 8 regulations',
    href: '/app/regulations',
    color: 'var(--neo-cyan)',
  },
  {
    icon: '◇',
    label: 'Audit Trails',
    desc: 'View the complete audit trail for every AI-generated document',
    href: '/app/traces',
    color: 'var(--neo-green)',
  },
  {
    icon: '⟁',
    label: 'Connect',
    desc: 'Get API keys and MCP config to integrate your tools',
    href: '/app/api-access',
    color: 'var(--neo-marigold)',
  },
];

const RECENT_PROCESSES = [
  { name: 'PSUR Generation', status: 'complete', device: 'CardioSense Pro', date: '2026-04-10' },
  { name: 'CAPA Investigation', status: 'in-progress', device: 'NeuroStim X', date: '2026-04-09' },
  { name: 'Risk Analysis', status: 'complete', device: 'CardioSense Pro', date: '2026-04-08' },
  { name: 'Clinical Evaluation', status: 'pending', device: 'OrthoGuide', date: '2026-04-07' },
];

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    complete: { bg: 'var(--success-muted)', color: 'var(--success)', label: 'Complete' },
    'in-progress': { bg: 'var(--accent-muted)', color: 'var(--accent-bright)', label: 'In Progress' },
    pending: { bg: 'var(--warning-muted)', color: 'var(--warning)', label: 'Pending' },
  };
  const s = map[status] ?? map['pending']!;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
      fontWeight: 600, background: s!.bg, color: s!.color, letterSpacing: '0.02em',
    }}>
      {s!.label}
    </span>
  );
}

export function Dashboard() {
  const [, navigate] = useLocation();

  const stats = useQuery({
    queryKey: ['graph-stats'],
    queryFn: () => api<GraphStats>('/api/graph/stats').catch(() => null),
  });

  const s = stats.data;

  return (
    <div style={{ padding: '32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Welcome header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, marginBottom: 36,
        padding: '28px 32px', borderRadius: 'var(--radius-lg)',
        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
        border: '1px solid var(--border-subtle)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle glow */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 200, height: 200,
          borderRadius: '50%', background: 'var(--accent-glow)', filter: 'blur(60px)',
          pointerEvents: 'none',
        }} />
        <SmarticusLogo size={48} style={{ flexShrink: 0, position: 'relative', zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontSize: 22, fontWeight: 700, margin: '0 0 4px',
            color: 'var(--text-primary)', letterSpacing: '-0.02em',
          }}>
            Welcome to Smarticus
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            AI-powered QMS document generation with built-in regulatory compliance. 303 requirements across 8 regulations.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16,
        marginBottom: 32,
      }}>
        {[
          { value: s?.total ?? 303, label: 'Requirements', color: 'var(--neo-cyan)' },
          { value: s ? new Set(s.jurisdictions.map(j => j.jurisdiction)).size : 8, label: 'Regulations', color: 'var(--neo-green)' },
          { value: s?.processTypes?.length ?? 23, label: 'QMS Processes', color: 'var(--neo-marigold)' },
          { value: s?.jurisdictions?.length ?? 5, label: 'Markets', color: 'var(--neo-hibiscus)' },
        ].map(st => (
          <div key={st.label} style={{
            padding: '20px 24px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 28, fontWeight: 700, color: st.color, lineHeight: 1,
              marginBottom: 6, fontFamily: 'var(--font-mono)',
            }}>{st.value}</div>
            <div style={{
              fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <h2 style={{
        fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)',
        marginBottom: 14, letterSpacing: '-0.01em',
      }}>
        Quick Actions
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 36 }}>
        {QUICK_ACTIONS.map(a => (
          <button
            key={a.href}
            onClick={() => navigate(a.href)}
            style={{
              padding: '24px', borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = a.color;
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${a.color}20`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'none';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <span style={{ fontSize: 22, opacity: 0.8, color: a.color }}>{a.icon}</span>
            <span style={{
              fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em',
            }}>{a.label}</span>
            <span style={{
              fontSize: 13, color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)', lineHeight: 1.5,
            }}>{a.desc}</span>
          </button>
        ))}
      </div>

      {/* Recent activity */}
      <h2 style={{
        fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)',
        marginBottom: 14, letterSpacing: '-0.01em',
      }}>
        Recent Activity
      </h2>
      <div style={{
        borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
        overflow: 'hidden', background: 'var(--bg-surface)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Process</th>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Device</th>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_PROCESSES.map((p, i) => (
              <tr key={i} style={{ borderBottom: i < RECENT_PROCESSES.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{p.device}</td>
                <td style={{ padding: '12px 16px' }}>{statusBadge(p.status)}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
