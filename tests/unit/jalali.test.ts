import { describe, expect, it } from 'vitest';
import {
  addDays,
  addJalaliMonths,
  addJalaliMonthsClamped,
  diffDays,
  formatJalaliMonth,
  formatPersianDate,
  fromJalali,
  getCurrentJalaliMonth,
  getDaysUntilDue,
  isDueToday,
  isISODate,
  isOverdue,
  jalaliMonthLength,
  jalaliMonthRange,
  parseJalaliMonthKey,
  toJalali,
  todayISO,
  weekdayIndex,
} from '@/lib/jalali';

describe('Jalali conversion', () => {
  it('converts Gregorian ISO dates to Jalali and back', () => {
    expect(toJalali('2026-09-27')).toEqual({ jy: 1405, jm: 7, jd: 5 });
    expect(fromJalali(1405, 7, 5)).toBe('2026-09-27');
    expect(fromJalali(1405, 1, 1)).toBe('2026-03-21');
  });

  it('knows Jalali month lengths including leap Esfand', () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 6)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1405, 11)).toBe(30);
    expect(jalaliMonthLength(1405, 12)).toBe(29);
    expect(jalaliMonthLength(1403, 12)).toBe(30); // leap year
  });

  it('rejects invalid Jalali dates', () => {
    expect(() => fromJalali(1405, 7, 31)).toThrow();
    expect(() => fromJalali(1405, 13, 1)).toThrow();
    expect(() => fromJalali(1405, 12, 30)).toThrow();
  });

  it('computes Jalali month ranges in Gregorian', () => {
    expect(jalaliMonthRange({ jy: 1405, jm: 7 })).toEqual({ start: '2026-09-23', end: '2026-10-22' });
    expect(jalaliMonthRange({ jy: 1404, jm: 12 })).toEqual({ start: '2026-02-20', end: '2026-03-20' });
  });

  it('adds Jalali months across year boundaries', () => {
    expect(addJalaliMonths({ jy: 1405, jm: 11 }, 2)).toEqual({ jy: 1406, jm: 1 });
    expect(addJalaliMonths({ jy: 1405, jm: 1 }, -1)).toEqual({ jy: 1404, jm: 12 });
    expect(addJalaliMonths({ jy: 1405, jm: 7 }, 0)).toEqual({ jy: 1405, jm: 7 });
  });

  it('clamps day 31 to shorter months', () => {
    const shahrivar31 = fromJalali(1405, 6, 31);
    expect(toJalali(addJalaliMonthsClamped(shahrivar31, 1))).toEqual({ jy: 1405, jm: 7, jd: 30 });
    expect(toJalali(addJalaliMonthsClamped(shahrivar31, 6))).toEqual({ jy: 1405, jm: 12, jd: 29 });
    expect(toJalali(addJalaliMonthsClamped(shahrivar31, 7))).toEqual({ jy: 1406, jm: 1, jd: 31 });
  });
});

describe('ISO date helpers', () => {
  it('validates ISO dates strictly', () => {
    expect(isISODate('2026-09-27')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-9-27')).toBe(false);
    expect(isISODate(20260927)).toBe(false);
  });

  it('adds and diffs days across month/year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-04', '2026-09-27')).toBe(7);
    expect(diffDays('2026-09-25', '2026-09-27')).toBe(-2);
  });

  it('computes today in the Tehran time zone, not UTC', () => {
    // 2026-09-27 21:00 UTC is already 2026-09-28 00:30 in Tehran (UTC+3:30).
    expect(todayISO('Asia/Tehran', new Date('2026-09-27T21:00:00Z'))).toBe('2026-09-28');
    expect(todayISO('Asia/Tehran', new Date('2026-09-27T20:00:00Z'))).toBe('2026-09-27');
    expect(todayISO('UTC', new Date('2026-09-27T21:00:00Z'))).toBe('2026-09-27');
  });

  it('computes weekday with Saturday first', () => {
    expect(weekdayIndex('2026-09-26')).toBe(0); // Saturday
    expect(weekdayIndex('2026-10-02')).toBe(6); // Friday
  });

  it('returns the current Jalali month', () => {
    expect(getCurrentJalaliMonth('2026-09-27')).toEqual({ jy: 1405, jm: 7 });
    expect(getCurrentJalaliMonth('2026-09-22')).toEqual({ jy: 1405, jm: 6 });
  });
});

describe('due-date helpers', () => {
  const today = '2026-09-27';
  it('detects overdue installments', () => {
    expect(isOverdue('2026-09-26', null, today)).toBe(true);
    expect(isOverdue('2026-09-27', null, today)).toBe(false);
    expect(isOverdue('2026-09-26', new Date(), today)).toBe(false);
  });

  it('detects due-today installments', () => {
    expect(isDueToday('2026-09-27', null, today)).toBe(true);
    expect(isDueToday('2026-09-28', null, today)).toBe(false);
    expect(isDueToday('2026-09-27', '2026-09-27T10:00:00Z', today)).toBe(false);
  });

  it('computes days until due', () => {
    expect(getDaysUntilDue('2026-09-30', today)).toBe(3);
    expect(getDaysUntilDue('2026-09-25', today)).toBe(-2);
  });
});

describe('Persian formatting', () => {
  it('formats Persian dates', () => {
    expect(formatPersianDate('2026-09-27')).toBe('۵ مهر ۱۴۰۵');
    expect(formatPersianDate('2026-09-27', { year: 'never' })).toBe('۵ مهر');
    expect(formatPersianDate('2027-03-25', { year: 'auto', today: '2026-09-27' })).toBe('۵ فروردین ۱۴۰۶');
    expect(formatPersianDate('2026-10-27', { year: 'auto', today: '2026-09-27' })).toBe('۵ آبان');
    expect(formatPersianDate('2026-09-26', { year: 'never', weekday: true })).toBe('شنبه، ۴ مهر');
  });

  it('formats and parses month keys', () => {
    expect(formatJalaliMonth({ jy: 1405, jm: 7 })).toBe('مهر ۱۴۰۵');
    expect(parseJalaliMonthKey('1405-07')).toEqual({ jy: 1405, jm: 7 });
    expect(parseJalaliMonthKey('1405-13')).toBeNull();
    expect(parseJalaliMonthKey('abc')).toBeNull();
    expect(parseJalaliMonthKey(undefined)).toBeNull();
  });
});
