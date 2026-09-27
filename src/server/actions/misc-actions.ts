'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isUuid } from '@/lib/ids';
import { getCurrentSession, requireUser } from '../auth/session';
import { isClientEventName, sanitizeClientEventProperties, track } from '../services/analytics-service';
import { updateAccountReminderSettings, updateDefaultReminderSettings } from '../services/reminder-service';
import { recordSessionActivity } from '../services/session-service';
import { completeOnboarding } from '../services/user-service';

export async function completeOnboardingAction(): Promise<void> {
  const user = await requireUser();
  if (!user.onboardingCompletedAt) await completeOnboarding(user.id);
  redirect('/installments/new?first=1');
}

export async function updateDefaultRemindersAction(settings: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const result = await updateDefaultReminderSettings(user.id, settings);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** `settings === null` resets the account to the default reminder settings. */
export async function updateAccountRemindersAction(accountId: string, settings: unknown | null): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!isUuid(accountId)) return { ok: false };
  const result = await updateAccountReminderSettings(user.id, accountId, settings);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** Browser-reported product events (allow-listed and attributed to the session user). */
export async function trackClientEventAction(name: string, properties?: unknown): Promise<void> {
  const current = await getCurrentSession();
  if (!current || !isClientEventName(name)) return;
  await track(name, { userId: current.user.id, properties: sanitizeClientEventProperties(name, properties) });
}

/** Records a "visit" (at most one per 30 minutes of inactivity) for retention metrics. */
export async function recordAppOpenAction(): Promise<void> {
  const current = await getCurrentSession();
  if (!current) return;
  if (await recordSessionActivity(current.session)) {
    await track('app_opened', { userId: current.user.id });
  }
}
