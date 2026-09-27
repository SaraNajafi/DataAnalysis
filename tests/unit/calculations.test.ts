import { describe, expect, it } from 'vitest';
import {
  accountProgress,
  buildDashboard,
  monthSummary,
  monthlyPressure,
  nextDaysSummary,
  nextPayment,
  overdueSummary,
  progressPercent,
  totalActiveDebt,
  upcomingPayments,
  type ScheduleItem,
} from '@/domain/calculations';
import { deriveInstallmentStatus } from '@/domain/status';
import { dueReminders, DEFAULT_REMINDER_SETTINGS } from '@/domain/reminders';
import { fromJalali } from '@/lib/jalali';

// Today: 5 Mehr 1405 (2026-09-27)
const TODAY = fromJalali(1405, 7, 5);

let seq = 0;
function item(
  jm: number,
  jd: number,
  amount: number,
  opts: { paid?: boolean; account?: string; status?: ScheduleItem['accountStatus']; jy?: number } = {},
): ScheduleItem {
  seq += 1;
  return {
    id: `i${seq}`,
    creditAccountId: opts.account ?? 'a1',
    amount,
    dueDate: fromJalali(opts.jy ?? 1405, jm, jd),
    paidAt: opts.paid ? new Date('2026-09-20T10:00:00Z') : null,
    accountStatus: opts.status ?? 'active',
  };
}

describe('derived installment status', () => {
  it('derives paid / overdue / dueToday / upcoming', () => {
    expect(deriveInstallmentStatus({ dueDate: fromJalali(1405, 7, 1), paidAt: new Date() }, TODAY)).toBe('paid');
    expect(deriveInstallmentStatus({ dueDate: fromJalali(1405, 7, 4), paidAt: null }, TODAY)).toBe('overdue');
    expect(deriveInstallmentStatus({ dueDate: TODAY, paidAt: null }, TODAY)).toBe('dueToday');
    expect(deriveInstallmentStatus({ dueDate: fromJalali(1405, 7, 6), paidAt: null }, TODAY)).toBe('upcoming');
  });
});

describe('monthly calculations', () => {
  const items = [
    item(7, 2, 2_350_000, { paid: true, account: 'snapp' }),
    item(7, 5, 1_800_000, { account: 'digi' }),
    item(7, 10, 4_200_000, { account: 'bank' }),
    item(7, 30, 10_050_000, { paid: true, account: 'bank' }),
    item(8, 2, 2_350_000, { account: 'snapp' }),
    item(6, 31, 999_000, { paid: true, account: 'snapp' }), // previous month
  ];

  it('sums current-month obligations, paid and remaining', () => {
    const s = monthSummary(items, { jy: 1405, jm: 7 });
    expect(s.total).toBe(18_400_000);
    expect(s.paid).toBe(12_400_000);
    expect(s.remaining).toBe(6_000_000);
    expect(s.progressPercent).toBe(67);
    expect(s.count).toBe(4);
    expect(s.paidCount).toBe(2);
    expect(s.unpaidCount).toBe(2);
  });

  it('uses Jalali month boundaries (31 Shahrivar is not in Mehr)', () => {
    expect(monthSummary(items, { jy: 1405, jm: 6 }).total).toBe(999_000);
  });

  it('handles months without obligations (no divide-by-zero)', () => {
    const s = monthSummary(items, { jy: 1406, jm: 1 });
    expect(s).toMatchObject({ total: 0, paid: 0, remaining: 0, progressPercent: 0 });
  });

  it('counts installments of completed accounts but not archived ones', () => {
    const mixed = [
      item(7, 3, 1_000_000, { paid: true, status: 'completed', account: 'done' }),
      item(7, 3, 5_000_000, { status: 'archived', account: 'deleted' }),
    ];
    const s = monthSummary(mixed, { jy: 1405, jm: 7 });
    expect(s.total).toBe(1_000_000);
    expect(s.paid).toBe(1_000_000);
  });
});

describe('progress percent', () => {
  it('rounds but never claims 100% or 0% incorrectly', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(73, 100)).toBe(73);
    expect(progressPercent(999, 1000)).toBe(99);
    expect(progressPercent(1, 1000)).toBe(1);
    expect(progressPercent(1000, 1000)).toBe(100);
  });
});

describe('next 7 days / overdue / next payment', () => {
  const items = [
    item(7, 3, 1_000_000, { account: 'a' }), // overdue (2 days)
    item(7, 5, 2_000_000, { account: 'b' }), // due today
    item(7, 5, 500_000, { account: 'c' }), // due today, same day
    item(7, 8, 3_000_000, { account: 'a', paid: true }), // paid, in window
    item(7, 12, 4_000_000, { account: 'b' }), // exactly +7 days
    item(7, 13, 8_000_000, { account: 'c' }), // +8 days (outside)
  ];

  it('sums unpaid installments due today through today+7', () => {
    const s = nextDaysSummary(items, TODAY, 7);
    expect(s.amount).toBe(6_500_000);
    expect(s.count).toBe(3);
  });

  it('returns zero when nothing is due in the next 7 days', () => {
    const s = nextDaysSummary([item(9, 1, 1_000_000)], TODAY, 7);
    expect(s).toMatchObject({ amount: 0, count: 0 });
  });

  it('sums overdue unpaid installments before today', () => {
    const s = overdueSummary(items, TODAY);
    expect(s.amount).toBe(1_000_000);
    expect(s.count).toBe(1);
  });

  it('next payment is the nearest unpaid installment on/after today (never overdue)', () => {
    const next = nextPayment(items, TODAY);
    expect(next?.dueDate).toBe(TODAY);
    expect(next?.amount).toBeGreaterThan(0);
  });

  it('next payment is null when everything is paid or overdue', () => {
    expect(nextPayment([item(7, 1, 1_000), item(7, 20, 1_000, { paid: true })], TODAY)).toBeNull();
  });

  it('lists upcoming payments sorted ascending by date', () => {
    const upcoming = upcomingPayments(items, TODAY);
    const dates = upcoming.map((i) => i.dueDate);
    expect(dates).toEqual([...dates].sort());
    expect(upcoming.every((i) => i.paidAt == null && i.dueDate >= TODAY)).toBe(true);
  });
});

describe('total active debt', () => {
  it('sums unpaid installments of active accounts only', () => {
    const items = [
      item(7, 10, 1_000_000),
      item(8, 10, 1_000_000),
      item(6, 10, 1_000_000, { paid: true }),
      item(7, 10, 9_000_000, { status: 'archived' }),
    ];
    expect(totalActiveDebt(items)).toBe(2_000_000);
  });
});

describe('three-month pressure', () => {
  it('identifies the month with the highest scheduled obligations', () => {
    const items = [item(7, 10, 18_400_000), item(8, 10, 21_700_000), item(9, 10, 13_200_000), item(10, 10, 99_000_000)];
    const p = monthlyPressure(items, TODAY, 3);
    expect(p.months.map((m) => m.total)).toEqual([18_400_000, 21_700_000, 13_200_000]);
    expect(p.peak).toEqual({ jy: 1405, jm: 8 });
  });

  it('returns no peak when there are no obligations', () => {
    expect(monthlyPressure([], TODAY, 3).peak).toBeNull();
  });

  it('prefers the earliest month on ties', () => {
    const p = monthlyPressure([item(8, 1, 5), item(9, 1, 5)], TODAY, 3);
    expect(p.peak).toEqual({ jy: 1405, jm: 8 });
  });
});

describe('account progress and completion', () => {
  it('computes progress for a credit account', () => {
    const inst = [item(6, 5, 2_500_000, { paid: true }), item(7, 5, 2_500_000), item(8, 5, 2_500_000)];
    const p = accountProgress(inst, TODAY);
    expect(p).toMatchObject({ totalCount: 3, paidCount: 1, unpaidCount: 2, remainingDebt: 5_000_000 });
    expect(p.nextDue).toBe(fromJalali(1405, 7, 5));
  });

  it('a fully paid account has no remaining debt and no next due date', () => {
    const inst = [item(6, 5, 2_500_000, { paid: true }), item(7, 5, 2_500_000, { paid: true })];
    const p = accountProgress(inst, TODAY);
    expect(p).toMatchObject({ unpaidCount: 0, remainingDebt: 0, nextDue: null, progressPercent: 100 });
  });
});

describe('dashboard aggregate', () => {
  it('builds a dashboard with overdue separated from next payment', () => {
    const items = [item(7, 3, 1_800_000, { account: 'digi' }), item(7, 8, 2_350_000, { account: 'snapp' })];
    const d = buildDashboard(items, TODAY);
    expect(d.overdue.count).toBe(1);
    expect(d.nextPayment?.creditAccountId).toBe('snapp');
    expect(d.currentMonth.total).toBe(4_150_000);
    expect(d.next7Days.amount).toBe(2_350_000);
  });

  it('counts other payments on the same day as the next payment', () => {
    const d = buildDashboard([item(7, 6, 1, { account: 'a' }), item(7, 6, 2, { account: 'b' })], TODAY);
    expect(d.sameDayCount).toBe(1);
  });
});

describe('in-app reminders', () => {
  it('matches unpaid installments against reminder windows', () => {
    const items = [
      item(7, 5, 1, { account: 'a' }), // today
      item(7, 6, 1, { account: 'a' }), // tomorrow
      item(7, 8, 1, { account: 'a' }), // in 3 days
      item(7, 6, 1, { account: 'b', paid: true }),
    ];
    const reminders = dueReminders(items, TODAY, () => DEFAULT_REMINDER_SETTINGS);
    expect(reminders.map((r) => r.daysUntilDue)).toEqual([0, 1]);

    const withThree = dueReminders(items, TODAY, () => ({ enabled: true, daysBefore: [3, 1], dueDateReminder: false }));
    expect(withThree.map((r) => r.daysUntilDue)).toEqual([1, 3]);

    const disabled = dueReminders(items, TODAY, () => ({ ...DEFAULT_REMINDER_SETTINGS, enabled: false }));
    expect(disabled).toEqual([]);
  });
});
