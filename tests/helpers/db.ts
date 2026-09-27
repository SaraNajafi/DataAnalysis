import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/server/db/schema';
import { setDatabaseForTests, type Database } from '@/server/db/client';
import type { SmsProvider } from '@/server/sms/types';

/**
 * Spins up an in-process PostgreSQL (PGlite), applies the real migrations
 * from ./drizzle and routes the app's repositories to it.
 */
export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, '../../drizzle') });
  setDatabaseForTests(db as unknown as Database);
  return {
    db: db as unknown as Database,
    client,
    async close() {
      setDatabaseForTests(null);
      await client.close();
    },
  };
}

/** SMS provider that captures codes instead of sending them. */
export class CapturingSmsProvider implements SmsProvider {
  readonly name = 'capture';
  readonly sent: Array<{ phoneNumber: string; code: string }> = [];
  fail = false;

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    if (this.fail) throw new Error('simulated SMS failure');
    this.sent.push({ phoneNumber, code });
  }

  lastCode(): string {
    const last = this.sent.at(-1);
    if (!last) throw new Error('No OTP was sent');
    return last.code;
  }
}

/** Controllable clock for OTP expiry / cooldown tests. */
export class TestClock {
  constructor(private current: Date = new Date('2026-09-27T08:00:00Z')) {}
  now = () => new Date(this.current);
  advanceSeconds(seconds: number) {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
