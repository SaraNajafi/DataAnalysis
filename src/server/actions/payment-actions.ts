'use server';

import { revalidatePath } from 'next/cache';
import { isUuid } from '@/lib/ids';
import { requireUser } from '../auth/session';
import { appToday } from '../config';
import { markInstallmentPaid, undoInstallmentPayment, PAYMENT_MESSAGES, type PaymentResult } from '../services/installment-service';

export type PaymentActionResult =
  | {
      ok: true;
      paid: boolean;
      accountCompleted: boolean;
      month: { total: number; paid: number; remaining: number; progressPercent: number; unpaidCount: number };
    }
  | { ok: false; message: string };

function toActionResult(result: PaymentResult): PaymentActionResult {
  if (!result.ok) return result;
  const { total, paid, remaining, progressPercent, unpaidCount } = result.month;
  return {
    ok: true,
    paid: result.paid,
    accountCompleted: result.accountCompleted,
    month: { total, paid, remaining, progressPercent, unpaidCount },
  };
}

export async function markInstallmentPaidAction(installmentId: string): Promise<PaymentActionResult> {
  const user = await requireUser();
  if (!isUuid(installmentId)) return { ok: false, message: PAYMENT_MESSAGES.notFound };
  try {
    const result = await markInstallmentPaid(user.id, installmentId, { today: appToday() });
    if (result.ok) revalidatePath('/', 'layout');
    return toActionResult(result);
  } catch (error) {
    console.error('[actions] mark paid failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: PAYMENT_MESSAGES.failed };
  }
}

export async function undoInstallmentPaymentAction(installmentId: string): Promise<PaymentActionResult> {
  const user = await requireUser();
  if (!isUuid(installmentId)) return { ok: false, message: PAYMENT_MESSAGES.notFound };
  try {
    const result = await undoInstallmentPayment(user.id, installmentId, { today: appToday() });
    if (result.ok) revalidatePath('/', 'layout');
    return toActionResult(result);
  } catch (error) {
    console.error('[actions] undo payment failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: PAYMENT_MESSAGES.failed };
  }
}
