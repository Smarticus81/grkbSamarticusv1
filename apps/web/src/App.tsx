import { QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation } from 'wouter';
import { SignedIn, SignedOut, RedirectToSignIn, OrganizationSwitcher, UserButton } from '@clerk/clerk-react';
import { queryClient } from './lib/queryClient.js';
import { LandingPage } from './pages/LandingPage.js';
import { Home } from './pages/Home.js';
import { Pricing } from './pages/Pricing.js';
import { TraceExplorer } from './pages/TraceExplorer.js';
import { RegulationManager } from './pages/RegulationManager.js';
import { ApiAccess } from './pages/ApiAccess.js';
import { Sandbox } from './pages/Sandbox.js';
import { Builder } from './pages/Builder.js';
import { ProcessDesigner } from './pages/ProcessDesigner.js';
import { ThemeToggle } from './components/ui/ThemeToggle.js';
import { SmarticusWordmark } from './components/ui/logos.js';

/**
 * Navigation is grouped by what a non-technical user is trying to do, with a
 * one-line caption under each heading so the purpose is obvious.
 *   "Do the work"     — run processs and reuse them.
 *   "Rules & records" — the regulations, and proof of every decision.
 *   "Advanced"        — chain processs together or plug into other tools.
 */
const NAV_GROUPS: {
  heading: string;
  caption: string;
  items: { href: string; label: string; exact?: boolean; tag?: string }[];
}[] = [
  {
    heading: 'Do the work',
    caption: 'Run a process, then deploy it as a managed agent.',
    items: [
      { href: '/app',          label: 'Home', exact: true },
      { href: '/app/designer', label: 'Multi-step workflows' },
      { href: '/app/sandbox',  label: 'Run a process' },
      { href: '/app/builder',  label: 'Agent Builder' },
    ],
  },
  {
    heading: 'Rules & records',
    caption: 'The regulations, and proof of each decision.',
    items: [
      { href: '/app/requirements', label: 'Regulations' },
      { href: '/app/trails',       label: 'Decision trails' },
    ],
  },
  {
    heading: 'Advanced',
    caption: 'Chain processs together or connect your tools.',
    items: [
      { href: '/app/connect',  label: 'Connect a tool (API / MCP)' },
    ],
  },
];

/**
 * Detect whether Clerk is available (ClerkProvider is mounted).
 * We check by trying to call useAuth — if it throws, Clerk is not present.
 */
const clerkAvailable = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function NavLink({ href, label, exact }: { href: string; label: string; exact?: boolean }) {
  const [location] = useLocation();
  const isExact = location === href || location === `${href}/`;
  // The Home item (/app) must match exactly so it doesn't light up on every page.
  const isNested = !exact && href !== '/app' && location.startsWith(href);
  const active = isExact || isNested;
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
        <div style={{ padding: '0 14px 16px' }}>
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

        <div style={{ padding: '0 14px 16px' }}>
          <Link
            href="/app/sandbox"
            className="btn btn-orange"
            style={{
              width: '100%',
              justifyContent: 'center',
              textDecoration: 'none',
              border: '1px solid var(--orange)',
              fontSize: 13,
              padding: '9px 14px',
            }}
          >
            Run a process
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  padding: '0 14px 1px',
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-4)',
                }}
              >
                {group.heading}
              </div>
              <div style={{ padding: '0 14px 6px', fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.35 }}>
                {group.caption}
              </div>
              {group.items.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </div>
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
            <Route path="/app" component={Home} />
            <Route path="/app/designer" component={ProcessDesigner} />
            <Route path="/app/builder" component={Builder} />
            <Route path="/app/sandbox/:taskId">{(params) => <Sandbox initialTaskId={params.taskId} />}</Route>
            <Route path="/app/sandbox">{() => <Sandbox />}</Route>
            <Route path="/app/requirements" component={RegulationManager} />
            <Route path="/app/trails/:id">{(params) => <TraceExplorer initialId={params.id} />}</Route>
            <Route path="/app/trails">{() => <TraceExplorer />}</Route>
            <Route path="/app/connect">{() => <ApiAccess />}</Route>
            <Route><Home /></Route>
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
        <Route path="/pricing" component={Pricing} />
        <Route path="/app" component={ProtectedAppShell} />
        <Route path="/app/*" component={ProtectedAppShell} />
      </Switch>
    </QueryClientProvider>
  );
}
