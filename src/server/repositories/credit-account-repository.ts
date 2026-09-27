import 'server-only';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { creditAccounts, providers, type CreditAccount, type Provider } from '../db/schema';

/**
 * Every function here is scoped by `userId`, which must come from the
 * authenticated session — never from client input. Soft-deleted accounts
 * (deleted_at IS NOT NULL) are invisible.
 */

export type CreditAccountWithProvider = CreditAccount & { provider: Provider };

const ownedAndVisible = (userId: string, accountId: string) =>
  and(eq(creditAccounts.id, accountId), eq(creditAccounts.userId, userId), isNull(creditAccounts.deletedAt));

export async function listActiveProviders(db: Database): Promise<Provider[]> {
  return db.select().from(providers).where(eq(providers.isActive, true)).orderBy(asc(providers.sortOrder));
}

export async function findProviderBySlug(db: Database, slug: string): Promise<Provider | null> {
  const [row] = await db
    .select()
    .from(providers)
    .where(and(eq(providers.slug, slug), eq(providers.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function insertCreditAccount(
  db: Database,
  values: typeof creditAccounts.$inferInsert,
): Promise<CreditAccount> {
  const [row] = await db.insert(creditAccounts).values(values).returning();
  if (!row) throw new Error('Failed to create credit account');
  return row;
}

export async function findCreditAccountByClientRequestId(
  db: Database,
  userId: string,
  clientRequestId: string,
): Promise<CreditAccount | null> {
  const [row] = await db
    .select()
    .from(creditAccounts)
    .where(and(eq(creditAccounts.userId, userId), eq(creditAccounts.clientRequestId, clientRequestId)))
    .limit(1);
  return row ?? null;
}

export async function findOwnedCreditAccount(
  db: Database,
  userId: string,
  accountId: string,
): Promise<CreditAccountWithProvider | null> {
  const [row] = await db
    .select({ account: creditAccounts, provider: providers })
    .from(creditAccounts)
    .innerJoin(providers, eq(providers.id, creditAccounts.providerId))
    .where(ownedAndVisible(userId, accountId))
    .limit(1);
  return row ? { ...row.account, provider: row.provider } : null;
}

/** Row-locks an owned account inside a transaction (serializes concurrent edits/payments). */
export async function lockOwnedCreditAccount(
  db: Database,
  userId: string,
  accountId: string,
): Promise<CreditAccount | null> {
  const [row] = await db.select().from(creditAccounts).where(ownedAndVisible(userId, accountId)).for('update').limit(1);
  return row ?? null;
}

export async function listOwnedCreditAccounts(
  db: Database,
  userId: string,
  statuses: Array<CreditAccount['status']> = ['active', 'completed'],
): Promise<CreditAccountWithProvider[]> {
  const rows = await db
    .select({ account: creditAccounts, provider: providers })
    .from(creditAccounts)
    .innerJoin(providers, eq(providers.id, creditAccounts.providerId))
    .where(
      and(eq(creditAccounts.userId, userId), isNull(creditAccounts.deletedAt), inArray(creditAccounts.status, statuses)),
    )
    .orderBy(desc(creditAccounts.createdAt));
  return rows.map((r) => ({ ...r.account, provider: r.provider }));
}

export async function countOwnedCreditAccounts(
  db: Database,
  userId: string,
  statuses: Array<CreditAccount['status']> = ['active', 'completed'],
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(creditAccounts)
    .where(
      and(eq(creditAccounts.userId, userId), isNull(creditAccounts.deletedAt), inArray(creditAccounts.status, statuses)),
    );
  return row?.value ?? 0;
}

export async function updateOwnedCreditAccount(
  db: Database,
  userId: string,
  accountId: string,
  patch: Partial<typeof creditAccounts.$inferInsert>,
): Promise<CreditAccount | null> {
  const [row] = await db.update(creditAccounts).set(patch).where(ownedAndVisible(userId, accountId)).returning();
  return row ?? null;
}

/** Soft delete: the account and its schedule disappear from the product but stay in the database. */
export async function softDeleteOwnedCreditAccount(
  db: Database,
  userId: string,
  accountId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(creditAccounts)
    .set({ deletedAt: now, status: 'archived' })
    .where(ownedAndVisible(userId, accountId))
    .returning({ id: creditAccounts.id });
  return rows.length === 1;
}
