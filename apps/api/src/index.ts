import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../../.env') });

import express from 'express';
import cors from 'cors';
import { auth } from './middleware/auth.js';
import { tenancy } from './middleware/tenancy.js';
import { tracing } from './middleware/tracing.js';
import graph from './routes/graph.js';
import traces from './routes/traces.js';
import apiKeysRoute from './routes/api-keys.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(tracing);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'regground-api', version: '0.1.0' });
});

// All API routes require auth + tenant context.
app.use('/api', auth, tenancy);
app.use('/api/graph', graph);
app.use('/api/traces', traces);
app.use('/api/api-keys', apiKeysRoute);

const port = Number(process.env.API_PORT ?? 4000);
const host = process.env.API_HOST ?? '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Regulatory Ground API listening on http://${host}:${port}`);
  console.log('Routes: /api/graph, /api/traces, /api/api-keys, /health');
});
