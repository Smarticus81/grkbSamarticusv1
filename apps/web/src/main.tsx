import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import './index.css';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (clerkPubKey) {
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey}>
        <App />
      </ClerkProvider>
    </React.StrictMode>,
  );
} else {
  // Dev mode without Clerk — render without auth provider
  console.warn('[auth] VITE_CLERK_PUBLISHABLE_KEY not set — running without Clerk auth');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
