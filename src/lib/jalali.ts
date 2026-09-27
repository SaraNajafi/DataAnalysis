/**
 * Date utility layer.
 *
 * Canonical storage format: Gregorian calendar dates as ISO strings
 * ('YYYY-MM-DD', Postgres `date`). Timestamps (paidAt, createdAt, …) are
 * `timestamptz`. The Jalali (Persian) calendar is used for display and for
 * month-based logic only — never store a formatted Persian date.
 *
 * "Today" is always evaluated in the app time zone (Asia/Tehran by default),
 * not the server's time zone (Vercel runs in UTC).
 */
import { jalaaliMonthLength, toGregorian, toJalaali } from 'jalaali-js';
import { toPersianDigits } from './format';

export type ISODate = string;

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface JalaliMonth {
  jy: number;
  jm: number;
}

export const DEFAULT_TIME_ZONE = 'Asia/Tehran';

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** Saturday-first week, as used in Iran. */
export const WEEKDAY_NAMES = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'] as const;
export const WEEKDAY_SHORT_NAMES = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function parseISODate(iso: ISODate): { y: number; m: number; d: number } {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function toISODate(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

function isoToUTCms(iso: ISODate): number {
  const { y, m, d } = parseISODate(iso);
  return Date.UTC(y, m - 1, d);
}

function utcMsToISO(ms: number): ISODate {
  const date = new Date(ms);
  return toISODate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Calendar date of `now` in the given IANA time zone, as 'YYYY-MM-DD'. */
export function todayISO(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return toISODate(get('year'), get('month'), get('day'));
}

export function addDays(iso: ISODate, days: number): ISODate {
  return utcMsToISO(isoToUTCms(iso) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(to: ISODate, from: ISODate): number {
  return Math.round((isoToUTCms(to) - isoToUTCms(from)) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Jalali conversions
// ---------------------------------------------------------------------------

export function toJalali(iso: ISODate): JalaliDate {
  const { y, m, d } = parseISODate(iso);
  return toJalaali(y, m, d);
}

export function fromJalali(jy: number, jm: number, jd: number): ISODate {
  if (!Number.isInteger(jm) || jm < 1 || jm > 12) throw new Error(`Invalid Jalali month: ${jm}`);
  if (!Number.isInteger(jd) || jd < 1 || jd > jalaliMonthLength(jy, jm)) {
    throw new Error(`Invalid Jalali day: ${jy}/${jm}/${jd}`);
  }
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return toISODate(gy, gm, gd);
}

/** Months 1–6 have 31 days, 7–11 have 30, Esfand has 29 (30 in leap years). */
export function jalaliMonthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

export function getCurrentJalaliMonth(today: ISODate): JalaliMonth {
  const { jy, jm } = toJalali(today);
  return { jy, jm };
}

export function addJalaliMonths(month: JalaliMonth, count: number): JalaliMonth {
  const index = month.jy * 12 + (month.jm - 1) + count;
  return { jy: Math.floor(index / 12), jm: (((index % 12) + 12) % 12) + 1 };
}

export function compareJalaliMonths(a: JalaliMonth, b: JalaliMonth): number {
  return a.jy * 12 + a.jm - (b.jy * 12 + b.jm);
}

/** Inclusive Gregorian range covering a Jalali month. */
export function jalaliMonthRange(month: JalaliMonth): { start: ISODate; end: ISODate } {
  return {
    start: fromJalali(month.jy, month.jm, 1),
    end: fromJalali(month.jy, month.jm, jalaliMonthLength(month.jy, month.jm)),
  };
}

export function isInJalaliMonth(iso: ISODate, month: JalaliMonth): boolean {
  const { jy, jm } = toJalali(iso);
  return jy === month.jy && jm === month.jm;
}

/**
 * Adds `count` Jalali months to a date, keeping `anchorDay` (defaults to the
 * date's own day) and clamping to the last day of shorter months.
 * See `generateDueDates` for the full rule.
 */
export function addJalaliMonthsClamped(iso: ISODate, count: number, anchorDay?: number): ISODate {
  const start = toJalali(iso);
  const target = addJalaliMonths({ jy: start.jy, jm: start.jm }, count);
  const day = Math.min(anchorDay ?? start.jd, jalaliMonthLength(target.jy, target.jm));
  return fromJalali(target.jy, target.jm, day);
}

/** Saturday = 0 … Friday = 6 */
export function weekdayIndex(iso: ISODate): number {
  const jsDay = new Date(isoToUTCms(iso)).getUTCDay(); // Sunday = 0
  return (jsDay + 1) % 7;
}

// ---------------------------------------------------------------------------
// Due-date helpers
// ---------------------------------------------------------------------------

export function getDaysUntilDue(dueDate: ISODate, today: ISODate): number {
  return diffDays(dueDate, today);
}

export function isOverdue(dueDate: ISODate, paidAt: Date | string | null | undefined, today: ISODate): boolean {
  return paidAt == null && dueDate < today;
}

export function isDueToday(dueDate: ISODate, paidAt: Date | string | null | undefined, today: ISODate): boolean {
  return paidAt == null && dueDate === today;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function jalaliMonthName(jm: number): string {
  return JALALI_MONTH_NAMES[jm - 1] ?? '';
}

export interface FormatPersianDateOptions {
  /** 'always' | 'never' | 'auto' (show year only when it differs from `today`'s year) */
  year?: 'always' | 'never' | 'auto';
  today?: ISODate;
  weekday?: boolean;
}

/** '2026-09-27' → «۵ مهر ۱۴۰۵» */
export function formatPersianDate(iso: ISODate, options: FormatPersianDateOptions = {}): string {
  const { jy, jm, jd } = toJalali(iso);
  const yearMode = options.year ?? 'always';
  let showYear = yearMode === 'always';
  if (yearMode === 'auto') {
    showYear = options.today ? toJalali(options.today).jy !== jy : true;
  }
  const base = `${toPersianDigits(jd)} ${jalaliMonthName(jm)}${showYear ? ` ${toPersianDigits(jy)}` : ''}`;
  return options.weekday ? `${WEEKDAY_NAMES[weekdayIndex(iso)]}، ${base}` : base;
}

/** { jy: 1405, jm: 7 } → «مهر ۱۴۰۵» */
export function formatJalaliMonth(month: JalaliMonth, withYear = true): string {
  return withYear ? `${jalaliMonthName(month.jm)} ${toPersianDigits(month.jy)}` : jalaliMonthName(month.jm);
}

/** Serializes a Jalali month for URLs, e.g. '1405-07'. */
export function jalaliMonthKey(month: JalaliMonth): string {
  return `${month.jy}-${pad2(month.jm)}`;
}

export function parseJalaliMonthKey(key: string | undefined | null): JalaliMonth | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  if (jy < 1300 || jy > 1500 || jm < 1 || jm > 12) return null;
  return { jy, jm };
}
