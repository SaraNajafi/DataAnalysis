import 'server-only';
import { accountProgress, type AccountProgress, type ScheduleItem } from '@/domain/calculations';
import { providerDisplayName } from '@/domain/providers';
import { generateInstallments } from '@/domain/schedule';
import {
  createCreditAccountSchema,
  fieldErrors,
  updateCreditAccountSchema,
  type CreateCreditAccountData,
} from '@/domain/validation';
import { addDays, type ISODate } from '@/lib/jalali';
import { getDb, type Database } from '../db/client';
import type { CreditAccount, Installment, Provider } from '../db/schema';
import {
  countOwnedCreditAccounts,
  findCreditAccountByClientRequestId,
  findOwnedCreditAccount,
  findProviderBySlug,
  insertCreditAccount,
  listActiveProviders,
  listOwnedCreditAccounts,
  lockOwnedCreditAccount,
  softDeleteOwnedCreditAccount,
  updateOwnedCreditAccount,
} from '../repositories/credit-account-repository';
import {
  deleteUnpaidInstallments,
  insertInstallments,
  installmentCounts,
  listInstallmentsForOwnedAccount,
  listScheduleRowsForUser,
  type ScheduleRow,
} from '../repositories/installment-repository';
import { track } from './analytics-service';

export const ACCOUNT_MESSAGES = {
  saveFailed: 'قسط ذخیره نشد. دوباره امتحان کن.',
  notFound: 'این قسط پیدا نشد.',
  dateOutOfRange: 'تاریخ واردشده معتبر نیست. یک تاریخ نزدیک‌تر انتخاب کن.',
  deleteFailed: 'حذف انجام نشد. دوباره امتحان کن.',
} as const;

/** Accept next-due dates from one year ago (overdue catch-up) to five years ahead. */
const MAX_PAST_DAYS = 366;
const MAX_FUTURE_DAYS = 5 * 366;

export type MutationResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function getProviders(): Promise<Provider[]> {
  return listActiveProviders(getDb());
}

function isDateInAcceptedRange(date: ISODate, today: ISODate): boolean {
  return date >= addDays(today, -MAX_PAST_DAYS) && date <= addDays(today, MAX_FUTURE_DAYS);
}

/**
 * Keeps the cached counters and the lifecycle status of an account in sync
 * with its installments. Must run inside the transaction that changed them.
 * - no unpaid installments (and at least one installment) → completed
 * - otherwise → active
 */
export async function recomputeAccountState(tx: Database, userId: string, accountId: string, now: Date): Promise<CreditAccount | null> {
  // Lock the account row first so concurrent payments on the same account are
  // serialized and each one counts the other's committed changes.
  const current = await lockOwnedCreditAccount(tx, userId, accountId);
  if (!current) return null;
  const counts = await installmentCounts(tx, accountId);
  const completed = counts.total > 0 && counts.unpaid === 0;
  return updateOwnedCreditAccount(tx, userId, accountId, {
    remainingInstallments: counts.unpaid,
    status: completed ? 'completed' : 'active',
    completedAt: completed ? (current.completedAt ?? now) : null,
  });
}

export async function createCreditAccount(
  userId: string,
  rawInput: unknown,
  options: { today: ISODate },
): Promise<MutationResult<{ accountId: string; accountCount: number; duplicate: boolean }>> {
  const parsed = createCreditAccountSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: ACCOUNT_MESSAGES.saveFailed, fieldErrors: fieldErrors(parsed.error) };
  }
  const input: CreateCreditAccountData = parsed.data;
  if (!isDateInAcceptedRange(input.nextDueDate, options.today)) {
    return { ok: false, message: ACCOUNT_MESSAGES.dateOutOfRange, fieldErrors: { nextDueDate: ACCOUNT_MESSAGES.dateOutOfRange } };
  }

  const db = getDb();

  // Idempotency: a retried/double submit returns the already-created account.
  if (input.clientRequestId) {
    const existing = await findCreditAccountByClientRequestId(db, userId, input.clientRequestId);
    if (existing && !existing.deletedAt) {
      return {
        ok: true,
        accountId: existing.id,
        accountCount: await countOwnedCreditAccounts(db, userId),
        duplicate: true,
      };
    }
  }

  const provider = await findProviderBySlug(db, input.providerSlug);
  if (!provider) return { ok: false, message: ACCOUNT_MESSAGES.saveFailed };

  const customProviderName =
    input.providerSlug === 'bank' || input.providerSlug === 'other' ? input.customProviderName : null;
  const frequency = input.frequency;
  const customFrequencyDays = frequency === 'custom' ? (input.customFrequencyDays ?? null) : null;
  const count = input.remainingInstallments;

  let accountId: string;
  try {
    accountId = await db.transaction(async (tx) => {
      const account = await insertCreditAccount(tx, {
        userId,
        providerId: provider.id,
        customProviderName,
        title: input.title,
        installmentAmount: input.installmentAmount,
        initialInstallmentCount: count,
        remainingInstallments: count,
        firstDueDate: input.nextDueDate,
        frequency,
        customFrequencyDays,
        totalOriginalDebt: input.installmentAmount * count,
        status: 'active',
        source: 'manual',
        clientRequestId: input.clientRequestId ?? null,
      });
      const rows = generateInstallments({
        firstDueDate: input.nextDueDate,
        count,
        frequency,
        customFrequencyDays,
        amount: input.installmentAmount,
      });
      await insertInstallments(
        tx,
        rows.map((r) => ({ creditAccountId: account.id, sequence: r.sequence, amount: r.amount, dueDate: r.dueDate })),
      );
      return account.id;
    });
  } catch (error) {
    // Unique violation on (user_id, client_request_id): a concurrent duplicate won the race.
    if (input.clientRequestId) {
      const existing = await findCreditAccountByClientRequestId(db, userId, input.clientRequestId);
      if (existing) {
        return { ok: true, accountId: existing.id, accountCount: await countOwnedCreditAccounts(db, userId), duplicate: true };
      }
    }
    console.error('[credit-account] create failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: ACCOUNT_MESSAGES.saveFailed };
  }

  const accountCount = await countOwnedCreditAccounts(db, userId);
  const properties = { provider: provider.slug, frequency, installmentCount: count, accountCount };
  await track('credit_account_created', { userId, properties });
  await track('installment_creation_completed', { userId, properties });
  return { ok: true, accountId, accountCount, duplicate: false };
}

export interface CreditAccountView {
  id: string;
  providerSlug: string;
  providerName: string;
  displayName: string;
  customProviderName: string | null;
  title: string | null;
  installmentAmount: number;
  frequency: CreditAccount['frequency'];
  customFrequencyDays: number | null;
  status: CreditAccount['status'];
  source: CreditAccount['source'];
  createdAt: Date;
  completedAt: Date | null;
  progress: AccountProgress;
}

function toView(
  account: CreditAccount & { provider: Provider },
  installments: ReadonlyArray<Pick<ScheduleItem, 'amount' | 'dueDate' | 'paidAt'>>,
  today: ISODate,
): CreditAccountView {
  return {
    id: account.id,
    providerSlug: account.provider.slug,
    providerName: account.provider.name,
    displayName: providerDisplayName(account.provider.slug, account.provider.name, account.customProviderName),
    customProviderName: account.customProviderName,
    title: account.title,
    installmentAmount: account.installmentAmount,
    frequency: account.frequency,
    customFrequencyDays: account.customFrequencyDays,
    status: account.status,
    source: account.source,
    createdAt: account.createdAt,
    completedAt: account.completedAt,
    progress: accountProgress(installments, today),
  };
}

export async function getCreditAccountDetail(
  userId: string,
  accountId: string,
  today: ISODate,
): Promise<{ account: CreditAccountView; installments: Installment[] } | null> {
  const db = getDb();
  const account = await findOwnedCreditAccount(db, userId, accountId);
  if (!account) return null;
  const installments = await listInstallmentsForOwnedAccount(db, userId, accountId);
  return { account: toView(account, installments, today), installments };
}

export async function listCreditAccounts(
  userId: string,
  today: ISODate,
): Promise<{ active: CreditAccountView[]; completed: CreditAccountView[]; totalActiveDebt: number }> {
  const db = getDb();
  const [accounts, rows] = await Promise.all([
    listOwnedCreditAccounts(db, userId, ['active', 'completed']),
    listScheduleRowsForUser(db, userId),
  ]);
  const byAccount = new Map<string, ScheduleRow[]>();
  for (const row of rows) byAccount.set(row.creditAccountId, [...(byAccount.get(row.creditAccountId) ?? []), row]);
  const views = accounts.map((a) => toView(a, byAccount.get(a.id) ?? [], today));
  const active = views
    .filter((v) => v.status === 'active')
    .sort((a, b) => (a.progress.nextDue ?? '9999').localeCompare(b.progress.nextDue ?? '9999'));
  const completed = views
    .filter((v) => v.status === 'completed')
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  return { active, completed, totalActiveDebt: active.reduce((s, v) => s + v.progress.remainingDebt, 0) };
}

export async function getActivationStatus(userId: string): Promise<{ accountCount: number; activated: boolean }> {
  const accountCount = await countOwnedCreditAccounts(getDb(), userId, ['active', 'completed']);
  return { accountCount, activated: accountCount >= 2 };
}

/**
 * Edits an account. Provider/title changes are always allowed. Schedule
 * changes regenerate ONLY the unpaid installments, starting at the new next
 * due date; paid installments (the payment history) are never modified.
 */
export async function updateCreditAccount(
  userId: string,
  accountId: string,
  rawInput: unknown,
  options: { today: ISODate; now?: Date },
): Promise<MutationResult<{ accountId: string }>> {
  const parsed = updateCreditAccountSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: ACCOUNT_MESSAGES.saveFailed, fieldErrors: fieldErrors(parsed.error) };
  }
  const input = parsed.data;
  if (input.schedule && !isDateInAcceptedRange(input.schedule.nextDueDate, options.today)) {
    return {
      ok: false,
      message: ACCOUNT_MESSAGES.dateOutOfRange,
      fieldErrors: { 'schedule.nextDueDate': ACCOUNT_MESSAGES.dateOutOfRange },
    };
  }

  const db = getDb();
  const now = options.now ?? new Date();
  const provider = await findProviderBySlug(db, input.providerSlug);
  if (!provider) return { ok: false, message: ACCOUNT_MESSAGES.saveFailed };

  try {
    const found = await db.transaction(async (tx) => {
      const account = await lockOwnedCreditAccount(tx, userId, accountId);
      if (!account) return false;

      const customProviderName =
        input.providerSlug === 'bank' || input.providerSlug === 'other' ? input.customProviderName : null;
      await updateOwnedCreditAccount(tx, userId, accountId, {
        providerId: provider.id,
        customProviderName,
        title: input.title,
      });

      if (input.schedule) {
        const s = input.schedule;
        const customFrequencyDays = s.frequency === 'custom' ? (s.customFrequencyDays ?? null) : null;
        await deleteUnpaidInstallments(tx, accountId);
        const { maxSequence } = await installmentCounts(tx, accountId);
        const rows = generateInstallments(
          {
            firstDueDate: s.nextDueDate,
            count: s.remainingInstallments,
            frequency: s.frequency,
            customFrequencyDays,
            amount: s.installmentAmount,
          },
          maxSequence + 1,
        );
        await insertInstallments(
          tx,
          rows.map((r) => ({ creditAccountId: accountId, sequence: r.sequence, amount: r.amount, dueDate: r.dueDate })),
        );
        await updateOwnedCreditAccount(tx, userId, accountId, {
          installmentAmount: s.installmentAmount,
          frequency: s.frequency,
          customFrequencyDays,
        });
      }

      await recomputeAccountState(tx, userId, accountId, now);
      return true;
    });
    if (!found) return { ok: false, message: ACCOUNT_MESSAGES.notFound };
  } catch (error) {
    console.error('[credit-account] update failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: ACCOUNT_MESSAGES.saveFailed };
  }

  await track('credit_account_edited', {
    userId,
    properties: { provider: provider.slug, scheduleChanged: Boolean(input.schedule) },
  });
  return { ok: true, accountId };
}

export async function deleteCreditAccount(
  userId: string,
  accountId: string,
  now: Date = new Date(),
): Promise<MutationResult> {
  const deleted = await softDeleteOwnedCreditAccount(getDb(), userId, accountId, now);
  if (!deleted) return { ok: false, message: ACCOUNT_MESSAGES.notFound };
  await track('credit_account_deleted', { userId });
  return { ok: true };
}
