import dotenv from 'dotenv';
import { resolve } from 'node:path';
import type { Config } from 'drizzle-kit';

// drizzle-kit runs from packages/core/, .env is at monorepo root
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL ?? 'postgresql://regground:regground@localhost:5432/regground',
  },
  verbose: true,
  strict: true,
} satisfies Config;
