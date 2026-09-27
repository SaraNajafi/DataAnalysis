import 'server-only';
import { getCurrentJalaliMonth, diffDays, type ISODate } from '@/lib/jalali';
import { monthSummary, type MonthSummary } from '@/domain/calculations';
import { getDb } from '../db/client';
import { lockOwnedCreditAccount } from '../repositories/credit-account-repository';
import {
  findOwnedInstallment,
  listScheduleRowsForUser,
  markOwnedInstallmentPaid,
  undoOwnedInstallmentPayment,
} from '../repositories/installment-repository';
import { track } from './analytics-service';
import { recomputeAccountState } from './credit-account-service';

export const PAYMENT_MESSAGES = {
  notFound: 'این قسط پیدا نشد.',
  failed: 'ثبت پرداخت انجام نشد. دوباره امتحان کن.',
} as const;

export type PaymentResult =
  | {
      ok: true;
      installmentId: string;
      creditAccountId: string;
      paid: boolean;
      accountCompleted: boolean;
      /** Current Jalali month after the change, for the success message. */
      month: MonthSummary;
    }
  | { ok: false; message: string };

async function currentMonthSummary(userId: string, today: ISODate): Promise<MonthSummary> {
  const rows = await listScheduleRowsForUser(getDb(), userId);
  return monthSummary(rows, getCurrentJalaliMonth(today));
}

/**
 * Marks an installment as paid (paid_at = now) and updates the account's
 * lifecycle (completed when nothing is left). Idempotent: marking an already
 * paid installment succeeds without changing paid_at.
 */
export async function markInstallmentPaid(
  userId: string,
  installmentId: string,
  options: { today: ISODate; now?: Date },
): Promise<PaymentResult> {
  const db = getDb();
  const now = options.now ?? new Date();
  let result: { creditAccountId: string; dueDate: ISODate; changed: boolean; completed: boolean } | null;
  try {
    result = await db.transaction(async (tx) => {
      const owned = await findOwnedInstallment(tx, userId, installmentId);
      if (!owned) return null;
      await lockOwnedCreditAccount(tx, userId, owned.creditAccountId);
      const updated = await markOwnedInstallmentPaid(tx, userId, installmentId, now);
      const row = updated ?? owned;
      const account = await recomputeAccountState(tx, userId, row.creditAccountId, now);
      return {
        creditAccountId: row.creditAccountId,
        dueDate: row.dueDate,
        changed: Boolean(updated),
        completed: account?.status === 'completed',
      };
    });
  } catch (error) {
    console.error('[installment] mark paid failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: PAYMENT_MESSAGES.failed };
  }
  if (!result) return { ok: false, message: PAYMENT_MESSAGES.notFound };

  if (result.changed) {
    const daysFromDue = diffDays(options.today, result.dueDate);
    await track('installment_marked_paid', {
      userId,
      properties: { wasOverdue: daysFromDue > 0, daysFromDue, accountCompleted: result.completed },
    });
  }

  return {
    ok: true,
    installmentId,
    creditAccountId: result.creditAccountId,
    paid: true,
    accountCompleted: result.completed,
    month: await currentMonthSummary(userId, options.today),
  };
}

/** Undo an accidental payment marking: paid_at = null, account re-activated if needed. */
export async function undoInstallmentPayment(
  userId: string,
  installmentId: string,
  options: { today: ISODate; now?: Date },
): Promise<PaymentResult> {
  const db = getDb();
  const now = options.now ?? new Date();
  let result: { creditAccountId: string; changed: boolean } | null;
  try {
    result = await db.transaction(async (tx) => {
      const owned = await findOwnedInstallment(tx, userId, installmentId);
      if (!owned) return null;
      await lockOwnedCreditAccount(tx, userId, owned.creditAccountId);
      const updated = await undoOwnedInstallmentPayment(tx, userId, installmentId);
      const row = updated ?? owned;
      await recomputeAccountState(tx, userId, row.creditAccountId, now);
      return { creditAccountId: row.creditAccountId, changed: Boolean(updated) };
    });
  } catch (error) {
    console.error('[installment] undo failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: PAYMENT_MESSAGES.failed };
  }
  if (!result) return { ok: false, message: PAYMENT_MESSAGES.notFound };

  if (result.changed) await track('installment_payment_undone', { userId });

  return {
    ok: true,
    installmentId,
    creditAccountId: result.creditAccountId,
    paid: false,
    accountCompleted: false,
    month: await currentMonthSummary(userId, options.today),
  };
}
