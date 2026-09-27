import 'server-only';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { users, type User } from '../db/schema';

export async function findUserById(db: Database, id: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function findUserByPhone(db: Database, phoneNumber: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1);
  return row ?? null;
}

/**
 * Returns the user for a normalized phone number, creating it on first login.
 * `created` tells signup and login apart. Safe under concurrent requests
 * thanks to the unique index on phone_number.
 */
export async function findOrCreateUserByPhone(
  db: Database,
  phoneNumber: string,
  now: Date,
): Promise<{ user: User; created: boolean }> {
  const [inserted] = await db
    .insert(users)
    .values({ phoneNumber, lastLoginAt: now })
    .onConflictDoNothing({ target: users.phoneNumber })
    .returning();
  if (inserted) return { user: inserted, created: true };

  const [updated] = await db
    .update(users)
    .set({ lastLoginAt: now })
    .where(eq(users.phoneNumber, phoneNumber))
    .returning();
  if (!updated) throw new Error('User disappeared during login');
  return { user: updated, created: false };
}

export async function markOnboardingCompleted(db: Database, userId: string, now: Date): Promise<void> {
  await db.update(users).set({ onboardingCompletedAt: now }).where(eq(users.id, userId));
}
