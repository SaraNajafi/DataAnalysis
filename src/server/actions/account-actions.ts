'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { COMMON_MESSAGES } from '@/lib/messages';
import { requireUser } from '../auth/session';
import { appToday } from '../config';
import {
  createCreditAccount,
  deleteCreditAccount,
  updateCreditAccount,
  ACCOUNT_MESSAGES,
} from '../services/credit-account-service';

/** Returned only on failure — on success these actions redirect. */
export type AccountActionError = { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function createCreditAccountAction(input: unknown): Promise<AccountActionError> {
  const user = await requireUser();
  let accountId: string;
  try {
    const result = await createCreditAccount(user.id, input, { today: appToday() });
    if (!result.ok) return result;
    accountId = result.accountId;
  } catch (error) {
    console.error('[actions] create account failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: COMMON_MESSAGES.saveInstallmentFailed };
  }
  revalidatePath('/', 'layout');
  redirect(`/installments/${accountId}?created=1`);
}

export async function updateCreditAccountAction(accountId: string, input: unknown): Promise<AccountActionError> {
  const user = await requireUser();
  if (!isUuid(accountId)) return { ok: false, message: ACCOUNT_MESSAGES.notFound };
  try {
    const result = await updateCreditAccount(user.id, accountId, input, { today: appToday() });
    if (!result.ok) return result;
  } catch (error) {
    console.error('[actions] update account failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: COMMON_MESSAGES.saveInstallmentFailed };
  }
  revalidatePath('/', 'layout');
  redirect(`/installments/${accountId}?updated=1`);
}

export async function deleteCreditAccountAction(accountId: string): Promise<AccountActionError> {
  const user = await requireUser();
  if (!isUuid(accountId)) return { ok: false, message: ACCOUNT_MESSAGES.notFound };
  try {
    const result = await deleteCreditAccount(user.id, accountId);
    if (!result.ok) return { ok: false, message: result.message };
  } catch (error) {
    console.error('[actions] delete account failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: ACCOUNT_MESSAGES.deleteFailed };
  }
  revalidatePath('/', 'layout');
  redirect('/installments?deleted=1');
}
