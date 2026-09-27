import { diffDays, type ISODate } from '@/lib/jalali';
import { formatCount } from '@/lib/format';
import { isPaid, type ScheduleItem } from './calculations';

/**
 * Reminder CONFIGURATION. For the MVP, reminders are evaluated in-app (shown
 * on Home). No push/SMS notification is delivered yet — see README.
 */
export interface ReminderSettings {
  enabled: boolean;
  /** Advance reminders, in days before the due date (subset of REMINDER_DAY_OPTIONS). */
  daysBefore: number[];
  /** Remind on the due date itself. */
  dueDateReminder: boolean;
}

export const REMINDER_DAY_OPTIONS = [3, 1] as const;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  daysBefore: [1],
  dueDateReminder: true,
};

export function sanitizeDaysBefore(days: readonly number[]): number[] {
  const allowed = new Set<number>(REMINDER_DAY_OPTIONS);
  return [...new Set(days)].filter((d) => allowed.has(d)).sort((a, b) => b - a);
}

/** Account override wins over the user's default, which wins over the app default. */
export function effectiveReminderSettings(
  userDefault: ReminderSettings | null | undefined,
  accountOverride: ReminderSettings | null | undefined,
): ReminderSettings {
  return accountOverride ?? userDefault ?? DEFAULT_REMINDER_SETTINGS;
}

export interface DueReminder<T> {
  item: T;
  daysUntilDue: number;
}

/** Unpaid installments that match a configured reminder window today. */
export function dueReminders<T extends ScheduleItem>(
  items: readonly T[],
  today: ISODate,
  settingsFor: (creditAccountId: string) => ReminderSettings,
): DueReminder<T>[] {
  const result: DueReminder<T>[] = [];
  for (const item of items) {
    if (isPaid(item)) continue;
    const days = diffDays(item.dueDate, today);
    if (days < 0) continue;
    const settings = settingsFor(item.creditAccountId);
    if (!settings.enabled) continue;
    if ((days === 0 && settings.dueDateReminder) || (days > 0 && settings.daysBefore.includes(days))) {
      result.push({ item, daysUntilDue: days });
    }
  }
  return result.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

export function reminderLeadText(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'امروز';
  if (daysUntilDue === 1) return 'فردا';
  return `${formatCount(daysUntilDue)} روز دیگه`;
}

export function describeReminderSettings(settings: ReminderSettings): string {
  if (!settings.enabled) return 'خاموش';
  const parts = settings.daysBefore.map((d) => `${formatCount(d)} روز قبل`);
  if (settings.dueDateReminder) parts.push('روز سررسید');
  return parts.length ? parts.join('، ') : 'خاموش';
}
