import 'server-only';
import { buildDashboard, itemsInMonth, monthSummary, monthlyPressure, type DashboardData, type MonthSummary, type MonthlyPressure } from '@/domain/calculations';
import { providerDisplayName } from '@/domain/providers';
import { dueReminders, type DueReminder } from '@/domain/reminders';
import type { ISODate, JalaliMonth } from '@/lib/jalali';
import { getDb } from '../db/client';
import { countOwnedCreditAccounts } from '../repositories/credit-account-repository';
import { listScheduleRowsForUser, type ScheduleRow } from '../repositories/installment-repository';
import { getReminderResolver } from './reminder-service';

/** A schedule row enriched with the provider name to show in lists. */
export interface PaymentItem extends ScheduleRow {
  displayName: string;
}

function toPaymentItems(rows: ScheduleRow[]): PaymentItem[] {
  return rows.map((r) => ({ ...r, displayName: providerDisplayName(r.providerSlug, r.providerName, r.customProviderName) }));
}

export async function getPaymentItems(userId: string): Promise<PaymentItem[]> {
  return toPaymentItems(await listScheduleRowsForUser(getDb(), userId));
}

export interface HomeData extends DashboardData<PaymentItem> {
  accountCount: number;
  reminders: DueReminder<PaymentItem>[];
}

export async function getHomeData(userId: string, today: ISODate): Promise<HomeData> {
  const [items, accountCount, resolver] = await Promise.all([
    getPaymentItems(userId),
    countOwnedCreditAccounts(getDb(), userId, ['active', 'completed']),
    getReminderResolver(userId),
  ]);
  const dashboard = buildDashboard(items, today, { upcomingLimit: 5, hasAccounts: accountCount > 0 });
  return { ...dashboard, accountCount, reminders: dueReminders(items, today, resolver) };
}

export interface CalendarData {
  month: JalaliMonth;
  summary: MonthSummary;
  items: PaymentItem[];
  pressure: MonthlyPressure;
  hasAccounts: boolean;
}

export async function getCalendarData(userId: string, month: JalaliMonth, today: ISODate): Promise<CalendarData> {
  const items = await getPaymentItems(userId);
  return {
    month,
    summary: monthSummary(items, month),
    items: itemsInMonth(items, month),
    pressure: monthlyPressure(items, today, 3),
    hasAccounts: items.length > 0,
  };
}
