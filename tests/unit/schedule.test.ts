import { describe, expect, it } from 'vitest';
import { generateDueDates, generateInstallments } from '@/domain/schedule';
import { fromJalali, toJalali } from '@/lib/jalali';

const jalali = (iso: string) => {
  const { jy, jm, jd } = toJalali(iso);
  return `${jy}/${jm}/${jd}`;
};

describe('installment schedule generation', () => {
  it('generates monthly installments on the same Jalali day (spec example)', () => {
    const dates = generateDueDates({ firstDueDate: fromJalali(1405, 7, 5), count: 4, frequency: 'monthly' });
    expect(dates.map(jalali)).toEqual(['1405/7/5', '1405/8/5', '1405/9/5', '1405/10/5']);
  });

  it('crosses the Jalali year boundary', () => {
    const dates = generateDueDates({ firstDueDate: fromJalali(1405, 11, 10), count: 4, frequency: 'monthly' });
    expect(dates.map(jalali)).toEqual(['1405/11/10', '1405/12/10', '1406/1/10', '1406/2/10']);
  });

  it('clamps day 31 to the end of shorter months without drifting', () => {
    const dates = generateDueDates({ firstDueDate: fromJalali(1405, 6, 31), count: 8, frequency: 'monthly' });
    expect(dates.map(jalali)).toEqual([
      '1405/6/31',
      '1405/7/30',
      '1405/8/30',
      '1405/9/30',
      '1405/10/30',
      '1405/11/30',
      '1405/12/29', // 1405 is not a leap year
      '1406/1/31', // back to the anchor day
    ]);
  });

  it('handles day 30 in a leap-year Esfand', () => {
    const dates = generateDueDates({ firstDueDate: fromJalali(1403, 11, 30), count: 3, frequency: 'monthly' });
    expect(dates.map(jalali)).toEqual(['1403/11/30', '1403/12/30', '1404/1/30']);
  });

  it('generates weekly, biweekly and custom schedules', () => {
    expect(generateDueDates({ firstDueDate: '2026-09-27', count: 3, frequency: 'weekly' })).toEqual([
      '2026-09-27',
      '2026-10-04',
      '2026-10-11',
    ]);
    expect(generateDueDates({ firstDueDate: '2026-09-27', count: 3, frequency: 'biweekly' })).toEqual([
      '2026-09-27',
      '2026-10-11',
      '2026-10-25',
    ]);
    expect(
      generateDueDates({ firstDueDate: '2026-09-27', count: 3, frequency: 'custom', customFrequencyDays: 10 }),
    ).toEqual(['2026-09-27', '2026-10-07', '2026-10-17']);
  });

  it('requires custom days for custom frequency', () => {
    expect(() => generateDueDates({ firstDueDate: '2026-09-27', count: 2, frequency: 'custom' })).toThrow();
  });

  it('returns an empty schedule for zero installments and rejects negative counts', () => {
    expect(generateDueDates({ firstDueDate: '2026-09-27', count: 0, frequency: 'monthly' })).toEqual([]);
    expect(() => generateDueDates({ firstDueDate: '2026-09-27', count: -1, frequency: 'monthly' })).toThrow();
  });

  it('builds installment rows with sequence numbers and a fixed amount', () => {
    const rows = generateInstallments(
      { firstDueDate: fromJalali(1405, 7, 5), count: 2, frequency: 'monthly', amount: 2_500_000 },
      3,
    );
    expect(rows).toEqual([
      { sequence: 3, amount: 2_500_000, dueDate: fromJalali(1405, 7, 5) },
      { sequence: 4, amount: 2_500_000, dueDate: fromJalali(1405, 8, 5) },
    ]);
  });
});
