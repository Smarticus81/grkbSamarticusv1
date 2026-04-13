import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import neo4j, { type Driver as Neo4jDriver } from 'neo4j-driver';
import * as schema from './schema.js';

export type RegGroundDB = NodePgDatabase<typeof schema>;

let pgPool: pg.Pool | null = null;
let drizzleDb: RegGroundDB | null = null;
let neo4jDriver: Neo4jDriver | null = null;

export interface DBConfig {
  databaseUrl?: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
}

export function getDB(config?: DBConfig): RegGroundDB {
  if (drizzleDb) return drizzleDb;
  const url = config?.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pgPool = new pg.Pool({ connectionString: url });
  drizzleDb = drizzle(pgPool, { schema });
  return drizzleDb;
}

export function getNeo4j(config?: DBConfig): Neo4jDriver {
  if (neo4jDriver) return neo4jDriver;
  const uri = config?.neo4jUri ?? process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const user = config?.neo4jUser ?? process.env.NEO4J_USER ?? process.env.NEO4J_USERNAME ?? 'neo4j';
  const pass = config?.neo4jPassword ?? process.env.NEO4J_PASSWORD ?? 'neo4j';
  neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, pass), {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 30_000,
  });
  return neo4jDriver;
}

export async function closeAll(): Promise<void> {
  if (neo4jDriver) {
    await neo4jDriver.close();
    neo4jDriver = null;
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
    drizzleDb = null;
  }
}

export { schema };
