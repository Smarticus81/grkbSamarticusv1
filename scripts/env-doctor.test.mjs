import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeEnvContent, shape } from './env-doctor.mjs';

const validProductionEnv = `
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@db.example.com:5432/regground
NEO4J_URI=neo4j+s://graph.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=super-secret-password
JWT_SECRET=this-is-a-long-random-production-secret
VITE_CLERK_PUBLISHABLE_KEY=pk_live_example
CLERK_SECRET_KEY=sk_live_example
CLERK_WEBHOOK_SIGNING_SECRET=whsec_example
ALLOWED_ORIGINS=https://app.example.com
VITE_API_URL=https://api.example.com
PSUR_SERVICE_URL=https://psur.example.com
VITE_SESSION_IDLE_TIMEOUT_MINUTES=15
VITE_SESSION_AWAY_TIMEOUT_MINUTES=10
VITE_SESSION_WARNING_SECONDS=60
OPENAI_API_KEY=sk-example
AUTH_BYPASS_DEV=false
`;

const validDevelopmentEnvWithoutClerk = `
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/regground
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
JWT_SECRET=this-is-a-long-random-development-secret
VITE_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
ALLOWED_ORIGINS=http://localhost:5173
VITE_API_URL=http://localhost:4000
PSUR_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=sk-example
AUTH_BYPASS_DEV=true
`;

test('passes a complete production-shaped environment', () => {
  const result = analyzeEnvContent(validProductionEnv, { production: true });

  assert.equal(result.errors.length, 0);
});

test('allows local development to run without Clerk configuration', () => {
  const result = analyzeEnvContent(validDevelopmentEnvWithoutClerk, { production: false });

  assert.equal(result.errors.length, 0);
});

test('reports later local or empty duplicates that shadow production values', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
DATABASE_URL=postgresql://regground:regground@localhost:5432/regground
NEO4J_URI=bolt://localhost:7687
VITE_API_URL=http://localhost:4000
VITE_CLERK_PUBLISHABLE_KEY=
OPENAI_API_KEY=
`, { production: true });

  const messages = result.errors.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('DATABASE_URL is defined 2 times')));
  assert(messages.some((message) => message.includes('NEO4J_URI is defined 2 times')));
  assert(messages.some((message) => message.includes('VITE_API_URL is defined 2 times')));
  assert(messages.some((message) => message.includes('VITE_CLERK_PUBLISHABLE_KEY is defined 2 times')));
  assert(messages.some((message) => message.includes('OPENAI_API_KEY is defined 2 times')));
  assert(messages.some((message) => message.includes('VITE_CLERK_PUBLISHABLE_KEY is empty or missing')));
  assert(messages.some((message) => message.includes('DATABASE_URL points at a local service')));
});

test('requires live Clerk keys in production mode', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
VITE_CLERK_PUBLISHABLE_KEY=pk_test_example
CLERK_SECRET_KEY=sk_test_example
`, { production: true });

  const messages = result.errors.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('VITE_CLERK_PUBLISHABLE_KEY must be a production pk_live_ key')));
  assert(messages.some((message) => message.includes('CLERK_SECRET_KEY must be a production sk_live_ key')));
});

test('rejects development auth bypass in production mode', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
AUTH_BYPASS_DEV=true
`, { production: true });

  const messages = result.errors.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('AUTH_BYPASS_DEV must be false or unset in production')));
});

test('requires HTTPS deployed service URLs in production mode', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
VITE_API_URL=http://api.example.com
PSUR_SERVICE_URL=http://psur.example.com
`, { production: true });

  const messages = result.errors.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('VITE_API_URL must use https:// in production')));
  assert(messages.some((message) => message.includes('PSUR_SERVICE_URL must use https:// in production')));
});

test('normalizes trailing-dot HTTPS origins in production mode', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
ALLOWED_ORIGINS=https://app.example.com.
`, { production: true });

  assert.equal(result.errors.length, 0);
});

test('requires valid session timeout build args in production mode', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
VITE_SESSION_IDLE_TIMEOUT_MINUTES=1
VITE_SESSION_AWAY_TIMEOUT_MINUTES=abc
VITE_SESSION_WARNING_SECONDS=900
`, { production: true });

  const messages = result.errors.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('VITE_SESSION_AWAY_TIMEOUT_MINUTES must be a positive number')));
  assert(messages.some((message) => message.includes('VITE_SESSION_WARNING_SECONDS must be shorter than VITE_SESSION_IDLE_TIMEOUT_MINUTES')));
});

test('requires session warning to be shorter than both idle and away timeouts', () => {
  const result = analyzeEnvContent(`
${validProductionEnv}
VITE_SESSION_IDLE_TIMEOUT_MINUTES=15
VITE_SESSION_AWAY_TIMEOUT_MINUTES=1
VITE_SESSION_WARNING_SECONDS=60
`, { production: true });

  const messages = result.errors.map((issue) => issue.message);

  assert(messages.some((message) => message.includes('VITE_SESSION_WARNING_SECONDS must be shorter than VITE_SESSION_AWAY_TIMEOUT_MINUTES')));
  assert(!messages.some((message) => message.includes('VITE_SESSION_WARNING_SECONDS must be shorter than VITE_SESSION_IDLE_TIMEOUT_MINUTES')));
});

test('redacts secret shapes instead of returning raw secret values', () => {
  assert.equal(shape('CLERK_SECRET_KEY', 'sk_live_secret-value'), 'SECRET(sk_live_)');
  assert.equal(shape('JWT_SECRET', 'this-secret-should-not-print'), 'SECRET(len=28)');
  assert.equal(shape('DATABASE_URL', 'postgresql://user:pass@db.example.com/regground'), 'postgresql://db.***');
});
