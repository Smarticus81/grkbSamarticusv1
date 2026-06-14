import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const file = process.argv[2];
const connectionString = process.env.DATABASE_URL;

if (!file) {
  console.error('Usage: tsx src/db/apply-sql.cli.ts <sql-file>');
  process.exit(1);
}

if (!connectionString) {
  console.error('DATABASE_URL is required to apply SQL.');
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), file);
const sql = await readFile(sqlPath, 'utf8');
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied SQL: ${sqlPath}`);
} finally {
  await client.end();
}
