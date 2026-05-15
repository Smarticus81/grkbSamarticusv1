import { QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import { SignedIn, SignedOut, RedirectToSignIn, OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { queryClient } from './lib/queryClient.js';
import { LandingPage } from './pages/LandingPage.js';
import { TraceExplorer } from './pages/TraceExplorer.js';
import { RegulationManager } from './pages/RegulationManager.js';
import { ApiAccess } from './pages/ApiAccess.js';
import { Sandbox } from './pages/Sandbox.js';
import { Builder } from './pages/Builder.js';
import { ProcessDesigner } from './pages/ProcessDesigner.js';
import { ThemeToggle } from './components/ui/ThemeToggle.js';
import { SmarticusWordmark } from './components/ui/logos.js';

const NAV: { href: string; label: string }[] = [
  { href: '/app/builder',      label: 'Processes' },
  { href: '/app/designer',     label: 'Designer' },
  { href: '/app/sandbox',      label: 'Sandbox' },
  { href: '/app/requirements', label: 'Requirements' },
  { href: '/app/trails',       label: 'Traces' },
  { href: '/app/connect',      label: 'API access' },
];

/**
 * Detect whether Clerk is available (ClerkProvider is mounted).
 * We check by trying to call useAuth — if it throws, Clerk is not present.
 */
const clerkAvailable = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function NavLink({ href, label }: { href: string; label: string }) {
  const [location] = useLocation();
  const isExact = location === href || location === `${href}/`;
  const isNested = href !== '/app' && location.startsWith(href);
  // Treat /app and /app/ as the Processes page (Builder is the default route).
  const isBuilderHome = href === '/app/builder' && (location === '/app' || location === '/app/');
  const active = isExact || isNested || isBuilderHome;
  return (
    <Link
      href={href}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr',
        alignItems: 'center',
        padding: '10px 14px',
        textDecoration: 'none',
        borderBottom: '0',
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        background: 'transparent',
        fontSize: 13.5,
        letterSpacing: '-0.005em',
        position: 'relative',
        transition: 'color var(--t-fast) var(--ease)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {label}
        {active && (
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--signal)',
              marginLeft: 4,
            }}
          />
        )}
      </span>
    </Link>
  );
}

function SidebarAuthControls() {
  if (!clerkAvailable) return null;
  return (
    <div
      style={{
        padding: '12px 14px',
        borderTop: '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <OrganizationSwitcher
        hidePersonal
        appearance={{
          elements: {
            rootBox: { width: '100%' },
            organizationSwitcherTrigger: {
              width: '100%',
              justifyContent: 'space-between',
              fontSize: '12px',
            },
          },
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: 28, height: 28 },
            },
          }}
        />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-3)' }}>
          Account
        </span>
      </div>
    </div>
  );
}

function AppShell() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper)' }}>
      <nav
        style={{
          width: 214,
          borderRight: '1px solid var(--rule)',
          padding: '18px 0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'var(--paper)',
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ padding: '0 14px 20px' }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              border: 0,
              display: 'inline-flex',
              color: 'var(--ink)',
            }}
          >
            <SmarticusWordmark size={16} />
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <SidebarAuthControls />

        <div style={{ padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.14em' }}>
            v0.1
          </span>
          <ThemeToggle />
        </div>
      </nav>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--paper)' }}>
          <Switch>
            <Route path="/app/designer" component={ProcessDesigner} />
            <Route path="/app/builder" component={Builder} />
            <Route path="/app/sandbox/:taskId">{(params) => <Sandbox initialTaskId={params.taskId} />}</Route>
            <Route path="/app/sandbox">{() => <Sandbox />}</Route>
            <Route path="/app/requirements" component={RegulationManager} />
            <Route path="/app/trails/:id">{(params) => <TraceExplorer initialId={params.id} />}</Route>
            <Route path="/app/trails">{() => <TraceExplorer />}</Route>
            <Route path="/app/connect">{() => <ApiAccess />}</Route>
            <Route><Builder /></Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}

/**
 * Protected wrapper: when Clerk is configured, requires sign-in.
 * When Clerk is not configured (dev without key), renders AppShell directly.
 */
function ProtectedAppShell() {
  if (!clerkAvailable) {
    return <AppShell />;
  }
  return (
    <>
      <SignedIn>
        <AppShell />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/app" component={ProtectedAppShell} />
        <Route path="/app/*" component={ProtectedAppShell} />
      </Switch>
    </QueryClientProvider>
  );
}
