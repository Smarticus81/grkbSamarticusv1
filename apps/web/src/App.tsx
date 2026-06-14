import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { SignedIn, SignedOut, RedirectToSignIn, OrganizationSwitcher, UserButton, useClerk } from '@clerk/clerk-react';
import { queryClient } from './lib/queryClient.js';
import { SessionTimeoutGuard } from './auth/SessionTimeoutGuard.js';
import { ThemeToggle } from './components/ui/ThemeToggle.js';
import { SmarticusWordmark } from './components/ui/logos.js';
import { useAuthenticatedApi } from './auth/useApi.js';
import {
  workspaceContextDisplay,
  type ServerWorkspaceContext,
} from './lib/workspaceContext.js';

const LandingPage = lazy(() => import('./pages/LandingPage.js'));
const PsurDemo = lazy(() => import('./pages/PsurDemo.js'));
const Home = lazy(() => import('./pages/Home.js'));
const Pricing = lazy(() => import('./pages/Pricing.js'));
const TraceExplorer = lazy(() => import('./pages/TraceExplorer.js'));
const RegulationManager = lazy(() => import('./pages/RegulationManager.js'));
const ApiAccess = lazy(() => import('./pages/ApiAccess.js'));
const Sandbox = lazy(() => import('./pages/Sandbox.js'));
const Builder = lazy(() => import('./pages/Builder.js'));
const ProcessDesigner = lazy(() => import('./pages/ProcessDesigner.js'));
const PsurBuilder = lazy(() => import('./pages/PsurBuilder.js'));

/**
 * Navigation presents one product: a medical-device agent operating system.
 * Technical implementation details stay behind operator-facing concepts.
 */
const NAV_GROUPS: {
  heading: string;
  caption: string;
  items: { href: string; label: string; exact?: boolean; tag?: string }[];
}[] = [
  {
    heading: 'Agent OS',
    caption: 'Build, run, and orchestrate agents.',
    items: [
      { href: '/app',          label: 'Command Center', exact: true },
      { href: '/app/sandbox',  label: 'Agent Builds' },
      { href: '/app/psur',     label: 'PSUR Builder' },
      { href: '/app/builder',  label: 'Managed Agents' },
      { href: '/app/designer', label: 'Workflow Studio' },
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
  return <ClerkSidebarAuthControls />;
}

function RouteFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      color: 'var(--ink-3)',
      background: 'var(--paper)',
      fontFamily: 'var(--mono)',
      fontSize: 12,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    }}>
      Loading
    </div>
  );
}

function ClerkSidebarAuthControls() {
  const { signOut } = useClerk();
  const { api, isSignedIn, orgId, userId } = useAuthenticatedApi();
  const workspace = useMemo(() => ({ orgId: orgId ?? null, userId: userId ?? null }), [orgId, userId]);
  const [serverWorkspace, setServerWorkspace] = useState<ServerWorkspaceContext | null>(null);
  const [workspaceError, setWorkspaceError] = useState(false);
  const workspaceDisplay = workspaceContextDisplay(workspace, serverWorkspace);

  useEffect(() => {
    let active = true;
    setServerWorkspace(null);
    setWorkspaceError(false);
    if (!isSignedIn) return () => { active = false; };

    void api<ServerWorkspaceContext>('/api/workspace/me')
      .then((context) => {
        if (active) setServerWorkspace(context);
      })
      .catch(() => {
        if (active) setWorkspaceError(true);
      });

    return () => {
      active = false;
    };
  }, [api, isSignedIn, workspace]);

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
      <div
        style={{
          border: '1px solid var(--rule)',
          borderRadius: 'var(--r-2)',
          padding: '9px 10px',
          background: 'var(--surface)',
        }}
      >
        <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>
          Active workspace
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--ink)' }}>
          {workspaceDisplay.title}
        </div>
        <div style={{ marginTop: 3, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)' }}>
          {workspaceDisplay.shortKey}
        </div>
        <div style={{ marginTop: 5, fontSize: 10.5, color: workspaceDisplay.inactive ? 'var(--danger)' : 'var(--ink-4)' }}>
          {workspaceError ? 'Workspace sync unavailable' : workspaceDisplay.inactive ? 'Inactive tenant' : workspaceDisplay.subtitle}
        </div>
      </div>
      <OrganizationSwitcher
        hidePersonal={false}
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
      <button
        className="btn btn-ghost"
        onClick={() => void signOut({ redirectUrl: '/' })}
        style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '7px 12px' }}
      >
        Sign out
      </button>
    </div>
  );
}

function AppShell() {
  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh', background: 'var(--paper)' }}>
      <style>{`
        @media (max-width: 760px) {
          .app-shell {
            flex-direction: column !important;
          }
          .app-shell-sidebar {
            position: relative !important;
            top: auto !important;
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            border-right: 0 !important;
            border-bottom: 1px solid var(--rule) !important;
          }
          .app-shell-sidebar [data-nav-groups] {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important;
            gap: 8px !important;
          }
          .app-shell-sidebar [data-sidebar-spacer],
          .app-shell-sidebar [data-sidebar-version] {
            display: none !important;
          }
          .app-shell-main {
            min-width: 0 !important;
          }
        }
      `}</style>
      <nav
        className="app-shell-sidebar"
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
            Start Agent Build
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>

        <div data-nav-groups style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        <div data-sidebar-spacer style={{ flex: 1 }} />

        <SidebarAuthControls />

        <div data-sidebar-version style={{ padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-4)', letterSpacing: '0.14em' }}>
            v0.1
          </span>
          <ThemeToggle />
        </div>
      </nav>

      <div className="app-shell-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', minWidth: 0 }}>
        <main style={{ flex: 1, overflow: 'auto', background: 'var(--paper)' }}>
          <Suspense fallback={<RouteFallback />}>
            <Switch>
              <Route path="/app" component={Home} />
              <Route path="/app/designer" component={ProcessDesigner} />
              <Route path="/app/psur/build" component={PsurDemo} />
              <Route path="/app/psur" component={PsurBuilder} />
              <Route path="/app/builder" component={Builder} />
              <Route path="/app/sandbox/:taskId">{(params) => <Sandbox initialTaskId={params.taskId} />}</Route>
              <Route path="/app/sandbox">{() => <Sandbox />}</Route>
              <Route path="/app/requirements" component={RegulationManager} />
              <Route path="/app/trails/:id">{(params) => <TraceExplorer initialId={params.id} />}</Route>
              <Route path="/app/trails">{() => <TraceExplorer />}</Route>
              <Route path="/app/connect">{() => <ApiAccess />}</Route>
              <Route><Home /></Route>
            </Switch>
          </Suspense>
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
      {clerkAvailable && (
        <SignedIn>
          <SessionTimeoutGuard />
        </SignedIn>
      )}
      <Suspense fallback={<RouteFallback />}>
        <Switch>
          <Route path="/" component={LandingPage} />
          {/* PSUR walkthrough: public route always runs the no-profile simulation.
              Signed-in live runs live under /app/psur/build in the workspace. */}
          <Route path="/demo/psur" component={PsurDemo} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/app" component={ProtectedAppShell} />
          <Route path="/app/*" component={ProtectedAppShell} />
        </Switch>
      </Suspense>
    </QueryClientProvider>
  );
}
