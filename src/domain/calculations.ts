/**
 * Pure, reusable financial calculations. All amounts are integer Toman.
 *
 * Callers pass installments of the current user's NON-DELETED credit accounts
 * (active + completed). Scoping by user happens in the repository layer.
 */
import {
  addJalaliMonths,
  diffDays,
  getCurrentJalaliMonth,
  isInJalaliMonth,
  type ISODate,
  type JalaliMonth,
} from '@/lib/jalali';

export type AccountStatus = 'active' | 'completed' | 'archived';

export interface ScheduleItem {
  id: string;
  creditAccountId: string;
  amount: number;
  dueDate: ISODate;
  paidAt: Date | string | null;
  accountStatus: AccountStatus;
}

export function isPaid(item: Pick<ScheduleItem, 'paidAt'>): boolean {
  return item.paidAt != null;
}

function sum(items: ReadonlyArray<Pick<ScheduleItem, 'amount'>>): number {
  let total = 0;
  for (const item of items) total += item.amount;
  return total;
}

function byDueDate<T extends ScheduleItem>(a: T, b: T): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  return a.creditAccountId < b.creditAccountId ? -1 : a.creditAccountId > b.creditAccountId ? 1 : 0;
}

/** paid / total as a 0–100 integer. Never shows 100% before everything is paid. */
export function progressPercent(paid: number, total: number): number {
  if (total <= 0) return 0;
  const raw = Math.round((paid / total) * 100);
  if (paid < total && raw >= 100) return 99;
  if (paid > 0 && raw <= 0) return 1;
  return Math.min(100, Math.max(0, raw));
}

/** Sum of all unpaid installments of ACTIVE credit accounts. */
export function totalActiveDebt(items: readonly ScheduleItem[]): number {
  return sum(items.filter((i) => !isPaid(i) && i.accountStatus === 'active'));
}

export interface MonthSummary {
  month: JalaliMonth;
  /** Everything due in the month (paid + unpaid). */
  total: number;
  paid: number;
  remaining: number;
  progressPercent: number;
  count: number;
  paidCount: number;
  unpaidCount: number;
}

/**
 * Obligations due in a Jalali month.
 * - total     = Σ installments due in the month
 * - paid      = Σ of those that are paid
 * - remaining = total − paid
 * - progress  = paid / total (0 when nothing is due)
 */
export function monthSummary(items: readonly ScheduleItem[], month: JalaliMonth): MonthSummary {
  const inMonth = items.filter((i) => i.accountStatus !== 'archived' && isInJalaliMonth(i.dueDate, month));
  const paidItems = inMonth.filter(isPaid);
  const total = sum(inMonth);
  const paid = sum(paidItems);
  return {
    month,
    total,
    paid,
    remaining: total - paid,
    progressPercent: progressPercent(paid, total),
    count: inMonth.length,
    paidCount: paidItems.length,
    unpaidCount: inMonth.length - paidItems.length,
  };
}

export function itemsInMonth<T extends ScheduleItem>(items: readonly T[], month: JalaliMonth): T[] {
  return items.filter((i) => isInJalaliMonth(i.dueDate, month)).sort(byDueDate);
}

export interface WindowSummary<T> {
  amount: number;
  count: number;
  items: T[];
}

/**
 * Unpaid installments due from today up to and including today + `days`
 * (so an installment due in exactly 7 days is part of «۷ روز آینده»).
 * Overdue items are excluded — they have their own section.
 */
export function nextDaysSummary<T extends ScheduleItem>(items: readonly T[], today: ISODate, days = 7): WindowSummary<T> {
  const inWindow = items
    .filter((i) => {
      if (isPaid(i)) return false;
      const d = diffDays(i.dueDate, today);
      return d >= 0 && d <= days;
    })
    .sort(byDueDate);
  return { amount: sum(inWindow), count: inWindow.length, items: inWindow };
}

/** Unpaid installments whose due date is before today. */
export function overdueSummary<T extends ScheduleItem>(items: readonly T[], today: ISODate): WindowSummary<T> {
  const overdue = items.filter((i) => !isPaid(i) && i.dueDate < today).sort(byDueDate);
  return { amount: sum(overdue), count: overdue.length, items: overdue };
}

/** Unpaid installments due today or later, ascending by date. */
export function upcomingPayments<T extends ScheduleItem>(items: readonly T[], today: ISODate, limit?: number): T[] {
  const upcoming = items.filter((i) => !isPaid(i) && i.dueDate >= today).sort(byDueDate);
  return limit === undefined ? upcoming : upcoming.slice(0, limit);
}

/** Nearest unpaid installment due today or later (overdue items are excluded). */
export function nextPayment<T extends ScheduleItem>(items: readonly T[], today: ISODate): T | null {
  return upcomingPayments(items, today, 1)[0] ?? null;
}

export interface MonthlyPressure {
  months: Array<{ month: JalaliMonth; total: number }>;
  /** Month with the highest scheduled obligations (earliest on ties); null when all are zero. */
  peak: JalaliMonth | null;
}

/**
 * Scheduled obligations (paid + unpaid) for the current Jalali month and the
 * following `count - 1` months. This is a factual view of the schedule, not advice.
 */
export function monthlyPressure(items: readonly ScheduleItem[], today: ISODate, count = 3): MonthlyPressure {
  const current = getCurrentJalaliMonth(today);
  const months = Array.from({ length: count }, (_, i) => {
    const month = addJalaliMonths(current, i);
    return { month, total: monthSummary(items, month).total };
  });
  let peak: JalaliMonth | null = null;
  let peakTotal = 0;
  for (const m of months) {
    if (m.total > peakTotal) {
      peakTotal = m.total;
      peak = m.month;
    }
  }
  return { months, peak };
}

export interface AccountProgress {
  totalCount: number;
  paidCount: number;
  unpaidCount: number;
  remainingDebt: number;
  paidAmount: number;
  nextDue: ISODate | null;
  overdueCount: number;
  progressPercent: number;
}

export function accountProgress(
  installments: ReadonlyArray<Pick<ScheduleItem, 'amount' | 'dueDate' | 'paidAt'>>,
  today: ISODate,
): AccountProgress {
  const unpaid = installments.filter((i) => !isPaid(i));
  const paid = installments.filter(isPaid);
  const nextDue = unpaid.map((i) => i.dueDate).sort()[0] ?? null;
  return {
    totalCount: installments.length,
    paidCount: paid.length,
    unpaidCount: unpaid.length,
    remainingDebt: sum(unpaid),
    paidAmount: sum(paid),
    nextDue,
    overdueCount: unpaid.filter((i) => i.dueDate < today).length,
    progressPercent: progressPercent(paid.length, installments.length),
  };
}

export interface DashboardData<T extends ScheduleItem> {
  today: ISODate;
  hasAccounts: boolean;
  currentMonth: MonthSummary;
  next7Days: WindowSummary<T>;
  overdue: WindowSummary<T>;
  nextPayment: T | null;
  /** Other unpaid installments due on the same day as `nextPayment`. */
  sameDayCount: number;
  upcoming: T[];
  upcomingTotalCount: number;
  pressure: MonthlyPressure;
  totalActiveDebt: number;
}

export function buildDashboard<T extends ScheduleItem>(
  items: readonly T[],
  today: ISODate,
  options: { upcomingLimit?: number; hasAccounts?: boolean } = {},
): DashboardData<T> {
  const upcomingAll = upcomingPayments(items, today);
  const next = upcomingAll[0] ?? null;
  return {
    today,
    hasAccounts: options.hasAccounts ?? items.length > 0,
    currentMonth: monthSummary(items, getCurrentJalaliMonth(today)),
    next7Days: nextDaysSummary(items, today, 7),
    overdue: overdueSummary(items, today),
    nextPayment: next,
    sameDayCount: next ? upcomingAll.filter((i) => i.dueDate === next.dueDate).length - 1 : 0,
    upcoming: upcomingAll.slice(0, options.upcomingLimit ?? 5),
    upcomingTotalCount: upcomingAll.length,
    pressure: monthlyPressure(items, today, 3),
    totalActiveDebt: totalActiveDebt(items),
  };
}
