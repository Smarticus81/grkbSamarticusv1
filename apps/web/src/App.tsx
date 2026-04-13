import { QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import { queryClient } from './lib/queryClient.js';
import { LandingPage } from './pages/LandingPage.js';
import { Dashboard } from './pages/Dashboard.js';
import { TraceExplorer } from './pages/TraceExplorer.js';
import { RegulationManager } from './pages/RegulationManager.js';
import { ApiAccess } from './pages/ApiAccess.js';
import { ThemeToggle } from './components/ui/ThemeToggle.js';
import { SmarticusIcon } from './components/ui/logos.js';

const NAV: { href: string; label: string; icon: string }[] = [
  { href: '/app', label: 'Dashboard', icon: '⊞' },
  { href: '/app/regulations', label: 'Requirements', icon: '⬡' },
  { href: '/app/traces', label: 'Audit Trails', icon: '◇' },
  { href: '/app/api-access', label: 'Connect', icon: '⟁' },
];

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const [location] = useLocation();
  const isExact = location === href || location === `${href}/`;
  const isNested = href !== '/app' && location.startsWith(href);
  const isDashboard = href === '/app' && (location === '/app' || location === '/app/');
  const active = isExact || isNested || isDashboard;
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 14px',
        borderRadius: 'var(--radius-md)',
        color: active ? 'var(--neo-cyan)' : 'var(--text-tertiary)',
        background: active ? 'var(--accent-muted)' : 'transparent',
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
        borderLeft: active ? '2px solid var(--neo-cyan)' : '2px solid transparent',
      }}
    >
      <span style={{ fontSize: 14, opacity: active ? 1 : 0.5, transition: 'opacity 0.2s' }}>{icon}</span>
      {label}
    </Link>
  );
}

function AppShell() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-surface)' }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 200,
          borderRight: '1px solid var(--border-subtle)',
          padding: '20px 12px',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'var(--bg-root)',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '0 14px', marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SmarticusIcon size={28} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Smarticus
                </span>
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                  by Thinkertons
                </span>
              </div>
            </div>
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Graph stats badge */}
        <div style={{
          padding: '12px 14px', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Requirement Coverage
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--neo-cyan)', lineHeight: 1 }}>303</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>requirements</div>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--neo-green)', lineHeight: 1 }}>8</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>regulations</div>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
          <ThemeToggle />
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-surface)', height: '100vh' }}>
        <Switch>
          <Route path="/app/regulations" component={RegulationManager} />
          <Route path="/app/traces/:id">{(params) => <TraceExplorer initialId={params.id} />}</Route>
          <Route path="/app/traces">{() => <TraceExplorer />}</Route>
          <Route path="/app/api-access" component={ApiAccess} />
          <Route><Dashboard /></Route>
        </Switch>
      </main>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/app" component={AppShell} />
        <Route path="/app/:rest*" component={AppShell} />
      </Switch>
    </QueryClientProvider>
  );
}
