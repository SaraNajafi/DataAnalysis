import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { reminderPreferences, type ReminderPreference } from '../db/schema';
import type { ReminderSettings } from '@/domain/reminders';

export function toSettings(row: ReminderPreference): ReminderSettings {
  return { enabled: row.enabled, daysBefore: row.daysBefore, dueDateReminder: row.dueDateReminder };
}

export async function listReminderPreferencesForUser(db: Database, userId: string): Promise<ReminderPreference[]> {
  return db.select().from(reminderPreferences).where(eq(reminderPreferences.userId, userId));
}

export async function findDefaultReminderPreference(db: Database, userId: string): Promise<ReminderPreference | null> {
  const [row] = await db
    .select()
    .from(reminderPreferences)
    .where(and(eq(reminderPreferences.userId, userId), isNull(reminderPreferences.creditAccountId)))
    .limit(1);
  return row ?? null;
}

export async function findAccountReminderPreference(
  db: Database,
  userId: string,
  accountId: string,
): Promise<ReminderPreference | null> {
  const [row] = await db
    .select()
    .from(reminderPreferences)
    .where(and(eq(reminderPreferences.userId, userId), eq(reminderPreferences.creditAccountId, accountId)))
    .limit(1);
  return row ?? null;
}

export async function upsertReminderPreference(
  db: Database,
  userId: string,
  accountId: string | null,
  settings: ReminderSettings,
): Promise<void> {
  const existing = accountId
    ? await findAccountReminderPreference(db, userId, accountId)
    : await findDefaultReminderPreference(db, userId);
  const values = {
    enabled: settings.enabled,
    daysBefore: settings.daysBefore,
    dueDateReminder: settings.dueDateReminder,
  };
  if (existing) {
    await db.update(reminderPreferences).set(values).where(eq(reminderPreferences.id, existing.id));
  } else {
    await db.insert(reminderPreferences).values({ userId, creditAccountId: accountId, ...values });
  }
}

export async function deleteAccountReminderPreference(db: Database, userId: string, accountId: string): Promise<void> {
  await db
    .delete(reminderPreferences)
    .where(and(eq(reminderPreferences.userId, userId), eq(reminderPreferences.creditAccountId, accountId)));
}
