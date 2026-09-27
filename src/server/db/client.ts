import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * Driver-agnostic database type. Production uses postgres.js; tests use an
 * in-process PGlite database with the same schema and migrations.
 * Transactions (`db.transaction(tx => …)`) satisfy the same type.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as {
  __peynoDb?: Database;
  __peynoDbOverride?: Database | null;
};

function createDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }
  const client = postgres(url, {
    // Required for Supabase's transaction-mode pooler (port 6543); harmless elsewhere.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    // Never print query parameters (they can contain phone numbers or amounts).
    debug: false,
    onnotice: () => {},
  });
  return drizzle(client, { schema }) as unknown as Database;
}

/** Lazily created singleton (reused across hot reloads in development). */
export function getDb(): Database {
  if (globalForDb.__peynoDbOverride) return globalForDb.__peynoDbOverride;
  if (!globalForDb.__peynoDb) {
    globalForDb.__peynoDb = createDatabase();
  }
  return globalForDb.__peynoDb;
}

/** Test hook: route all repositories to a different database (e.g. PGlite). */
export function setDatabaseForTests(db: Database | null): void {
  globalForDb.__peynoDbOverride = db;
}

export { schema };
