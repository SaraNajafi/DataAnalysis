import 'server-only';
import {
  DEFAULT_REMINDER_SETTINGS,
  effectiveReminderSettings,
  sanitizeDaysBefore,
  type ReminderSettings,
} from '@/domain/reminders';
import { reminderSettingsSchema } from '@/domain/validation';
import { getDb } from '../db/client';
import { findOwnedCreditAccount } from '../repositories/credit-account-repository';
import {
  deleteAccountReminderPreference,
  findAccountReminderPreference,
  findDefaultReminderPreference,
  listReminderPreferencesForUser,
  toSettings,
  upsertReminderPreference,
} from '../repositories/reminder-repository';
import { track } from './analytics-service';

export async function getDefaultReminderSettings(userId: string): Promise<ReminderSettings> {
  const row = await findDefaultReminderPreference(getDb(), userId);
  return row ? toSettings(row) : DEFAULT_REMINDER_SETTINGS;
}

/** Resolver used by Home to decide which in-app reminders to show. */
export async function getReminderResolver(userId: string): Promise<(accountId: string) => ReminderSettings> {
  const rows = await listReminderPreferencesForUser(getDb(), userId);
  const defaultRow = rows.find((r) => r.creditAccountId === null);
  const userDefault = defaultRow ? toSettings(defaultRow) : null;
  const overrides = new Map(rows.filter((r) => r.creditAccountId).map((r) => [r.creditAccountId!, toSettings(r)]));
  return (accountId) => effectiveReminderSettings(userDefault, overrides.get(accountId));
}

function parseSettings(raw: unknown): ReminderSettings | null {
  const parsed = reminderSettingsSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data, daysBefore: sanitizeDaysBefore(parsed.data.daysBefore) };
}

export async function updateDefaultReminderSettings(userId: string, raw: unknown): Promise<{ ok: boolean }> {
  const settings = parseSettings(raw);
  if (!settings) return { ok: false };
  await upsertReminderPreference(getDb(), userId, null, settings);
  await track('reminder_changed', {
    userId,
    properties: { scope: 'default', enabled: settings.enabled, daysBefore: settings.daysBefore, dueDate: settings.dueDateReminder },
  });
  return { ok: true };
}

export async function getAccountReminderSettings(
  userId: string,
  accountId: string,
): Promise<{ override: ReminderSettings | null; userDefault: ReminderSettings } | null> {
  const db = getDb();
  const account = await findOwnedCreditAccount(db, userId, accountId);
  if (!account) return null;
  const [override, userDefault] = await Promise.all([
    findAccountReminderPreference(db, userId, accountId),
    getDefaultReminderSettings(userId),
  ]);
  return { override: override ? toSettings(override) : null, userDefault };
}

/** `raw === null` removes the override so the account follows the default again. */
export async function updateAccountReminderSettings(
  userId: string,
  accountId: string,
  raw: unknown | null,
): Promise<{ ok: boolean }> {
  const db = getDb();
  const account = await findOwnedCreditAccount(db, userId, accountId);
  if (!account) return { ok: false };

  if (raw === null) {
    await deleteAccountReminderPreference(db, userId, accountId);
    await track('reminder_changed', { userId, properties: { scope: 'account', useDefault: true } });
    return { ok: true };
  }
  const settings = parseSettings(raw);
  if (!settings) return { ok: false };
  await upsertReminderPreference(db, userId, accountId, settings);
  await track('reminder_changed', {
    userId,
    properties: { scope: 'account', enabled: settings.enabled, daysBefore: settings.daysBefore, dueDate: settings.dueDateReminder },
  });
  return { ok: true };
}
