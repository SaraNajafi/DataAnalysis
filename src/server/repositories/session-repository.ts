import 'server-only';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { sessions, users, type Session, type User } from '../db/schema';

export async function createSessionRow(
  db: Database,
  values: { userId: string; tokenHash: string; expiresAt: Date },
): Promise<Session> {
  const [row] = await db.insert(sessions).values(values).returning();
  if (!row) throw new Error('Failed to create session');
  return row;
}

export async function findValidSession(
  db: Database,
  tokenHash: string,
  now: Date,
): Promise<{ session: Session; user: User } | null> {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

export async function touchSession(db: Database, sessionId: string, now: Date): Promise<void> {
  await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, sessionId));
}

export async function deleteSessionByTokenHash(db: Database, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteExpiredSessions(db: Database, now: Date): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
