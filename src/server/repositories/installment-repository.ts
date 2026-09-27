import 'server-only';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { creditAccounts, installments, providers, type Installment } from '../db/schema';
import type { ScheduleItem } from '@/domain/calculations';

/**
 * Installments belong to a user only through their credit account, so every
 * query joins/filters through `credit_accounts.user_id` and excludes
 * soft-deleted accounts.
 */

const ownedAccountIds = (db: Database, userId: string) =>
  db
    .select({ id: creditAccounts.id })
    .from(creditAccounts)
    .where(and(eq(creditAccounts.userId, userId), isNull(creditAccounts.deletedAt)));

export interface ScheduleRow extends ScheduleItem {
  sequence: number;
  providerSlug: string;
  providerName: string;
  customProviderName: string | null;
  accountTitle: string | null;
}

export async function insertInstallments(db: Database, rows: Array<typeof installments.$inferInsert>): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(installments).values(rows);
}

/** All installments of the user's visible (non-deleted) accounts, with display data. */
export async function listScheduleRowsForUser(db: Database, userId: string): Promise<ScheduleRow[]> {
  const rows = await db
    .select({
      id: installments.id,
      creditAccountId: installments.creditAccountId,
      sequence: installments.sequence,
      amount: installments.amount,
      dueDate: installments.dueDate,
      paidAt: installments.paidAt,
      accountStatus: creditAccounts.status,
      providerSlug: providers.slug,
      providerName: providers.name,
      customProviderName: creditAccounts.customProviderName,
      accountTitle: creditAccounts.title,
    })
    .from(installments)
    .innerJoin(creditAccounts, eq(creditAccounts.id, installments.creditAccountId))
    .innerJoin(providers, eq(providers.id, creditAccounts.providerId))
    .where(and(eq(creditAccounts.userId, userId), isNull(creditAccounts.deletedAt)))
    .orderBy(asc(installments.dueDate), asc(installments.sequence));
  return rows;
}

export async function listInstallmentsForOwnedAccount(
  db: Database,
  userId: string,
  accountId: string,
): Promise<Installment[]> {
  return db
    .select({
      id: installments.id,
      creditAccountId: installments.creditAccountId,
      sequence: installments.sequence,
      amount: installments.amount,
      dueDate: installments.dueDate,
      paidAt: installments.paidAt,
      createdAt: installments.createdAt,
      updatedAt: installments.updatedAt,
    })
    .from(installments)
    .innerJoin(creditAccounts, eq(creditAccounts.id, installments.creditAccountId))
    .where(
      and(
        eq(installments.creditAccountId, accountId),
        eq(creditAccounts.userId, userId),
        isNull(creditAccounts.deletedAt),
      ),
    )
    .orderBy(asc(installments.dueDate), asc(installments.sequence));
}

export async function findOwnedInstallment(
  db: Database,
  userId: string,
  installmentId: string,
): Promise<Installment | null> {
  const [row] = await db
    .select()
    .from(installments)
    .where(and(eq(installments.id, installmentId), inArray(installments.creditAccountId, ownedAccountIds(db, userId))))
    .limit(1);
  return row ?? null;
}

/** Sets paid_at. No-op (returns null) if not owned, deleted, or already paid. */
export async function markOwnedInstallmentPaid(
  db: Database,
  userId: string,
  installmentId: string,
  now: Date,
): Promise<Installment | null> {
  const [row] = await db
    .update(installments)
    .set({ paidAt: now })
    .where(
      and(
        eq(installments.id, installmentId),
        isNull(installments.paidAt),
        inArray(installments.creditAccountId, ownedAccountIds(db, userId)),
      ),
    )
    .returning();
  return row ?? null;
}

/** Clears paid_at. No-op (returns null) if not owned, deleted, or not paid. */
export async function undoOwnedInstallmentPayment(
  db: Database,
  userId: string,
  installmentId: string,
): Promise<Installment | null> {
  const [row] = await db
    .update(installments)
    .set({ paidAt: null })
    .where(
      and(
        eq(installments.id, installmentId),
        isNotNull(installments.paidAt),
        inArray(installments.creditAccountId, ownedAccountIds(db, userId)),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Deletes the UNPAID installments of an account (used when an edited plan is
 * regenerated). Paid installments are never touched. The caller must have
 * verified ownership of `accountId` in the same transaction.
 */
export async function deleteUnpaidInstallments(db: Database, accountId: string): Promise<void> {
  await db.delete(installments).where(and(eq(installments.creditAccountId, accountId), isNull(installments.paidAt)));
}

export async function installmentCounts(
  db: Database,
  accountId: string,
): Promise<{ total: number; unpaid: number; maxSequence: number }> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      unpaid: sql<number>`count(*) filter (where ${installments.paidAt} is null)::int`,
      maxSequence: sql<number>`coalesce(max(${installments.sequence}), 0)::int`,
    })
    .from(installments)
    .where(eq(installments.creditAccountId, accountId));
  return {
    total: Number(row?.total ?? 0),
    unpaid: Number(row?.unpaid ?? 0),
    maxSequence: Number(row?.maxSequence ?? 0),
  };
}
