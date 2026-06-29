import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import './index.css';
import { selectAuthBootMode } from './auth/authBootPolicy.js';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const authBootMode = selectAuthBootMode({
  clerkPublishableKey: clerkPubKey,
  isProduction: import.meta.env.PROD,
});

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (authBootMode === 'clerk' && clerkPubKey) {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey} telemetry={{ disabled: true }}>
        <App />
      </ClerkProvider>
    </React.StrictMode>,
  );
} else if (authBootMode === 'dev-open') {
  // Dev mode without Clerk - render without auth provider
  console.warn('[auth] VITE_CLERK_PUBLISHABLE_KEY not set - running without Clerk auth');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  console.error('[auth] VITE_CLERK_PUBLISHABLE_KEY is required for production web builds.');
  root.render(
    <React.StrictMode>
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#f8f4ed',
        color: '#16120f',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <main style={{
          maxWidth: 560,
          border: '1px solid #d9d1c3',
          background: '#fffaf3',
          borderRadius: 8,
          padding: 28,
          boxShadow: '0 18px 60px rgba(22, 18, 15, 0.12)',
        }}>
          <p style={{
            margin: '0 0 10px',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#985122',
          }}>
            Authentication required
          </p>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>
            Smarticus cannot start without login configuration.
          </h1>
          <p style={{ margin: '14px 0 0', lineHeight: 1.6, color: '#5a5147' }}>
            Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> for this production build so workspace data,
            module configuration, and PSUR runs are protected by sign-in.
          </p>
        </main>
      </div>
    </React.StrictMode>,
  );
}
