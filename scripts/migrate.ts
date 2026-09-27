/**
 * Applies SQL migrations from ./drizzle to DATABASE_URL.
 * Usage: npm run db:migrate
 */
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

loadEnvConfig(process.cwd());

async function main() {
  // Prefer a direct (non-pooled) connection for migrations when provided.
  const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
    process.exit(1);
  }
  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
    console.info('✓ Migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
