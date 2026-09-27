import { addDays, addJalaliMonths, fromJalali, jalaliMonthLength, toJalali, type ISODate } from '@/lib/jalali';

export const FREQUENCIES = ['monthly', 'biweekly', 'weekly', 'custom'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  monthly: 'ماهانه',
  biweekly: 'دو هفته یک‌بار',
  weekly: 'هفتگی',
  custom: 'سفارشی',
};

export const MIN_INSTALLMENT_AMOUNT = 1_000;
export const MAX_INSTALLMENT_AMOUNT = 100_000_000_000;
export const MIN_INSTALLMENT_COUNT = 1;
export const MAX_INSTALLMENT_COUNT = 120;
export const MIN_CUSTOM_FREQUENCY_DAYS = 1;
export const MAX_CUSTOM_FREQUENCY_DAYS = 365;

export interface SchedulePlan {
  /** Due date of the first installment to generate (ISO, Gregorian). */
  firstDueDate: ISODate;
  count: number;
  frequency: Frequency;
  customFrequencyDays?: number | null;
}

/** Fixed interval in days for non-monthly frequencies. */
export function frequencyIntervalDays(frequency: Frequency, customFrequencyDays?: number | null): number | null {
  switch (frequency) {
    case 'monthly':
      return null;
    case 'biweekly':
      return 14;
    case 'weekly':
      return 7;
    case 'custom':
      if (!customFrequencyDays || customFrequencyDays < MIN_CUSTOM_FREQUENCY_DAYS) {
        throw new Error('customFrequencyDays is required for custom frequency');
      }
      return customFrequencyDays;
  }
}

/**
 * Generates the due dates of an installment plan.
 *
 * MONTHLY RULE (Jalali calendar):
 * - The Jalali day-of-month of `firstDueDate` is the "anchor day".
 * - Installment k is due in Jalali month (first month + k) on the anchor day.
 * - If that month is shorter than the anchor day (e.g. anchor 31 in Mehr,
 *   which has 30 days, or anchor 30 in a 29-day Esfand), the due date is
 *   clamped to the LAST day of that month.
 * - Clamping never moves the anchor: every month is computed from the
 *   original anchor, so the schedule does not drift.
 *   Example: 31 Shahrivar → 30 Mehr → 30 Aban → … → 29 Esfand → 31 Farvardin.
 *
 * WEEKLY / BIWEEKLY / CUSTOM: a fixed number of days (7 / 14 / N) is added.
 */
export function generateDueDates(plan: SchedulePlan): ISODate[] {
  const { firstDueDate, count, frequency, customFrequencyDays } = plan;
  if (!Number.isInteger(count) || count < 0) throw new Error('count must be a non-negative integer');

  const interval = frequencyIntervalDays(frequency, customFrequencyDays);
  const dates: ISODate[] = [];

  if (interval === null) {
    const start = toJalali(firstDueDate);
    const anchorDay = start.jd;
    for (let i = 0; i < count; i++) {
      const { jy, jm } = addJalaliMonths({ jy: start.jy, jm: start.jm }, i);
      dates.push(fromJalali(jy, jm, Math.min(anchorDay, jalaliMonthLength(jy, jm))));
    }
    return dates;
  }

  for (let i = 0; i < count; i++) {
    dates.push(addDays(firstDueDate, i * interval));
  }
  return dates;
}

export interface GeneratedInstallment {
  sequence: number;
  amount: number;
  dueDate: ISODate;
}

/**
 * Builds installment rows for a plan. `startSequence` lets an edited plan
 * continue numbering after the already-paid installments.
 */
export function generateInstallments(
  plan: SchedulePlan & { amount: number },
  startSequence = 1,
): GeneratedInstallment[] {
  return generateDueDates(plan).map((dueDate, index) => ({
    sequence: startSequence + index,
    amount: plan.amount,
    dueDate,
  }));
}
