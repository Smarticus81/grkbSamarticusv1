import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { auth, validateJwtSecret } from './middleware/auth.js';
import { tenancy } from './middleware/tenancy.js';
import { tracing } from './middleware/tracing.js';
import { requestId } from './middleware/request-id.js';
import graph, { graphStatsHandler } from './routes/graph.js';
import traces from './routes/traces.js';
import apiKeysRoute from './routes/api-keys.js';
import sandbox from './routes/sandbox.js';
import builder from './routes/builder.js';
import managedAgents from './routes/managed-agents.js';
import usage from './routes/usage.js';
import workspace from './routes/workspace.js';
import readiness from './routes/readiness.js';
import validateDraft from './routes/validate-draft.js';
import clerkWebhook from './routes/clerk-webhook.js';
import psur from './routes/psur.js';

// ---------------------------------------------------------------------------
// Boot-time validation
// ---------------------------------------------------------------------------

const isProd = process.env.NODE_ENV === 'production';

// JWT secret must be secure before we accept any traffic.
validateJwtSecret();

// ---------------------------------------------------------------------------
// CORS origin parsing
// ---------------------------------------------------------------------------

function parseOriginList(
  raw: string | undefined,
): boolean | string | string[] {
  if (!raw || raw.trim() === '') {
    if (isProd) {
      throw new Error(
        '[cors] FATAL: ALLOWED_ORIGINS must be set in production. ' +
          'Provide a comma-separated list of allowed origins.',
      );
    }
    // In development, allow all origins.
    return true as boolean;
  }
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return origins.length === 1 ? origins[0]! : origins;
}


// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

// Railway terminates TLS and forwards client IP information through proxy
// headers. express-rate-limit requires this to identify clients correctly.
app.set('trust proxy', 1);

// --- Security headers via helmet -----------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 63_072_000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: 'deny' },
  }),
);

// --- CORS ----------------------------------------------------------------
app.use(
  cors({
    origin: parseOriginList(process.env.ALLOWED_ORIGINS),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  }),
);

// --- Clerk webhook (MUST be before express.json so raw body is preserved) -
app.use(
  '/api/clerk-webhook',
  express.raw({ type: 'application/json' }),
  clerkWebhook,
);

// --- Body parsing --------------------------------------------------------
app.use(express.json({ limit: '10mb' }));

// --- Request ID ----------------------------------------------------------
app.use(requestId);

// --- Request logging -----------------------------------------------------
app.use(tracing);

// --- Global rate limiter (100 req / 15 min per IP) -----------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many requests, please try again later' },
  skip: () => !isProd,
});
app.use(globalLimiter);

// --- Health check (unauthenticated) --------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'regground-api', version: '0.1.0' });
});

// --- Production readiness (unauthenticated, non-secret config status) -----
app.use('/ready', readiness);

// --- Public graph stats (no auth) ------------------------------------------
// Aggregate counts only (obligations, regulations, jurisdictions) — consumed
// by the signed-out landing page. Mounted BEFORE the auth middleware; the
// rest of /api/graph remains sign-in only.
app.get('/api/graph/stats', graphStatsHandler);

// --- Auth + tenant context for all /api routes ---------------------------
app.use('/api', auth, tenancy);

// --- PSUR generator bridge (sign-in required) ------------------------------
// Mounted AFTER the /api auth+tenancy middleware: the real pipeline is only
// available to signed-in users. Signed-out visitors get a fully client-side
// simulated run in the web app instead. Authenticated runs are multi-user and
// tenant-scoped; the upstream PSUR service may still enforce its own capacity
// limits and returns demo_busy when saturated.
app.use('/api/psur', psur);

// --- Stricter rate limit on /api/api-keys (30 req / 15 min per IP) -------
const apiKeysLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too many api-key requests, please try again later' },
});

app.use('/api/graph', graph);
app.use('/api/traces', traces);
app.use('/api/api-keys', apiKeysLimiter, apiKeysRoute);
app.use('/api/sandbox', sandbox);
app.use('/api/builder', builder);
app.use('/api/builder', managedAgents);
app.use('/api/usage', usage);
app.use('/api/workspace', workspace);
app.use('/api/validate-draft', validateDraft);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Regulatory Ground API listening on http://${host}:${port}`);
  console.log('Routes: /api/graph, /api/traces, /api/api-keys, /api/sandbox, /api/builder, /api/usage, /api/workspace, /api/psur, /health, /ready');
});
