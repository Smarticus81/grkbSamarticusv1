#!/usr/bin/env node
import 'dotenv/config';
import pg from 'pg';

const SQL = `
CREATE TABLE IF NOT EXISTS process_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  created_by uuid,
  name text NOT NULL,
  process_type text NOT NULL,
  jurisdiction text NOT NULL,
  description text,
  draft jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS process_workflows_tenant_updated_idx
  ON process_workflows (tenant_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS process_workflows_tenant_name_idx
  ON process_workflows (tenant_id, name);
`;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(SQL);
  console.log('process_workflows table ensured.');
} finally {
  await client.end();
}
