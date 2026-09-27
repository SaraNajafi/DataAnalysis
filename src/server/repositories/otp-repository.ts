import 'server-only';
import { and, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { otpRequests, type OtpRequest } from '../db/schema';

export async function insertOtpRequest(db: Database, values: typeof otpRequests.$inferInsert): Promise<OtpRequest> {
  const [row] = await db.insert(otpRequests).values(values).returning();
  if (!row) throw new Error('Failed to create OTP request');
  return row;
}

/** Most recent OTP request for a phone number (any state). */
export async function findLatestOtpRequest(db: Database, phoneNumber: string): Promise<OtpRequest | null> {
  const [row] = await db
    .select()
    .from(otpRequests)
    .where(eq(otpRequests.phoneNumber, phoneNumber))
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  return row ?? null;
}

/** Latest OTP that is neither verified nor superseded. */
export async function findActiveOtpRequest(db: Database, phoneNumber: string): Promise<OtpRequest | null> {
  const [row] = await db
    .select()
    .from(otpRequests)
    .where(
      and(eq(otpRequests.phoneNumber, phoneNumber), isNull(otpRequests.verifiedAt), isNull(otpRequests.invalidatedAt)),
    )
    .orderBy(desc(otpRequests.createdAt))
    .limit(1);
  return row ?? null;
}

export async function countOtpRequestsForPhoneSince(db: Database, phoneNumber: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(otpRequests)
    .where(and(eq(otpRequests.phoneNumber, phoneNumber), gte(otpRequests.createdAt, since)));
  return row?.value ?? 0;
}

export async function countOtpRequestsForIpSince(db: Database, requestIpHash: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(otpRequests)
    .where(and(eq(otpRequests.requestIpHash, requestIpHash), gte(otpRequests.createdAt, since)));
  return row?.value ?? 0;
}

/** Invalidates every still-usable OTP of a phone number (called before issuing a new one). */
export async function invalidateActiveOtpRequests(db: Database, phoneNumber: string, now: Date): Promise<void> {
  await db
    .update(otpRequests)
    .set({ invalidatedAt: now })
    .where(
      and(eq(otpRequests.phoneNumber, phoneNumber), isNull(otpRequests.verifiedAt), isNull(otpRequests.invalidatedAt)),
    );
}

/**
 * Atomically consumes one verification attempt. Returns the new attempt count,
 * or null when the OTP is no longer usable or out of attempts. Incrementing
 * BEFORE comparing the code prevents parallel brute-force requests.
 */
export async function consumeOtpAttempt(db: Database, id: string, maxAttempts: number): Promise<number | null> {
  const [row] = await db
    .update(otpRequests)
    .set({ attemptCount: sql`${otpRequests.attemptCount} + 1` })
    .where(
      and(
        eq(otpRequests.id, id),
        isNull(otpRequests.verifiedAt),
        isNull(otpRequests.invalidatedAt),
        lt(otpRequests.attemptCount, maxAttempts),
      ),
    )
    .returning({ attemptCount: otpRequests.attemptCount });
  return row?.attemptCount ?? null;
}

/** Marks an OTP as used. Returns false if it was already used (single-use guarantee). */
export async function markOtpVerified(db: Database, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(otpRequests)
    .set({ verifiedAt: now })
    .where(and(eq(otpRequests.id, id), isNull(otpRequests.verifiedAt), isNull(otpRequests.invalidatedAt)))
    .returning({ id: otpRequests.id });
  return rows.length === 1;
}

/** Housekeeping: drop OTP rows older than `before`. */
export async function deleteOtpRequestsBefore(db: Database, before: Date): Promise<void> {
  await db.delete(otpRequests).where(lt(otpRequests.createdAt, before));
}

/**
 * Marks an OTP whose SMS could not be delivered: unusable, and backdated so
 * the resend cooldown does not block an immediate retry. It still counts
 * toward the hourly rate limit.
 */
export async function markOtpDeliveryFailed(db: Database, id: string, now: Date, cooldownSeconds: number): Promise<void> {
  await db
    .update(otpRequests)
    .set({ invalidatedAt: now, lastSentAt: new Date(now.getTime() - cooldownSeconds * 1000) })
    .where(eq(otpRequests.id, id));
}
