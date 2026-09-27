import 'server-only';
import { getDb } from '../db/client';
import type { Session, User } from '../db/schema';
import {
  createSessionRow,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  findValidSession,
  touchSession,
} from '../repositories/session-repository';
import { randomToken, sha256 } from '../security/crypto';

/**
 * Server-side sessions. The browser holds a random 256-bit token in an
 * HTTP-only cookie; the database stores only its SHA-256 hash, so a database
 * leak does not leak usable sessions. Logout deletes the row.
 */
export const SESSION_TTL_DAYS = 30;
const MAX_TOKEN_LENGTH = 128;

export async function createSession(userId: string, now: Date = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  await createSessionRow(getDb(), { userId, tokenHash: sha256(token), expiresAt });
  // Opportunistic cleanup of expired sessions (cheap, indexed by token only on lookups).
  if (Math.random() < 0.05) {
    await deleteExpiredSessions(getDb(), now).catch(() => {});
  }
  return { token, expiresAt };
}

export async function validateSessionToken(
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<{ session: Session; user: User } | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return findValidSession(getDb(), sha256(token), now);
}

export async function revokeSessionToken(token: string | undefined | null): Promise<void> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return;
  await deleteSessionByTokenHash(getDb(), sha256(token));
}

/** Throttled "last seen" update; returns true when a new visit started. */
export async function recordSessionActivity(session: Session, now: Date = new Date(), visitGapMinutes = 30): Promise<boolean> {
  if (now.getTime() - session.lastSeenAt.getTime() < visitGapMinutes * 60_000) return false;
  await touchSession(getDb(), session.id, now);
  return true;
}
