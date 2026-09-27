/**
 * Persian number / money formatting helpers.
 *
 * Money is always an integer number of Toman. These helpers only format; they
 * never do arithmetic on floating point money.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** U+066C ARABIC THOUSANDS SEPARATOR, e.g. ۲٬۵۰۰٬۰۰۰ */
export const THOUSANDS_SEPARATOR = '٬';
/** U+066B ARABIC DECIMAL SEPARATOR, e.g. ۱۸٫۴ */
export const DECIMAL_SEPARATOR = '٫';

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

/** Converts Persian and Arabic-Indic digits to ASCII digits. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

/** 1234567 → «۱٬۲۳۴٬۵۶۷» */
export function formatNumber(value: number): string {
  const sign = value < 0 ? '-' : '';
  const grouped = Math.abs(Math.trunc(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  return sign + toPersianDigits(grouped);
}

/** 2500000 → «۲٬۵۰۰٬۰۰۰ تومان» */
export function formatToman(value: number): string {
  return `${formatNumber(value)} تومان`;
}

function formatOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const [intPart, fraction] = rounded.toFixed(1).split('.');
  const intFormatted = formatNumber(Number(intPart));
  return fraction === '0' ? intFormatted : `${intFormatted}${DECIMAL_SEPARATOR}${toPersianDigits(fraction ?? '')}`;
}

/**
 * Compact amount for charts, e.g. 18_400_000 → «۱۸٫۴ میلیون»,
 * 850_000 → «۸۵۰ هزار», 1_250_000_000 → «۱٫۳ میلیارد».
 */
export function formatCompactToman(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatOneDecimal(value / 1_000_000_000)} میلیارد`;
  if (abs >= 1_000_000) return `${formatOneDecimal(value / 1_000_000)} میلیون`;
  if (abs >= 1_000) return `${formatOneDecimal(value / 1_000)} هزار`;
  return formatNumber(value);
}

/** 73 → «۷۳٪» */
export function formatPercent(percent: number): string {
  return `${toPersianDigits(Math.round(percent))}٪`;
}

/** Integer count in Persian digits, e.g. 3 → «۳» */
export function formatCount(value: number): string {
  return toPersianDigits(Math.trunc(value));
}

/**
 * Parses a user-typed amount that may contain Persian/Arabic digits and
 * thousands separators. Returns null for empty or non-integer input.
 */
export function parseIntegerInput(raw: string): number | null {
  const cleaned = toLatinDigits(raw).replace(/[\s,٬_.،]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Relative due text for an unpaid installment.
 * 0 → «امروز», 1 → «فردا», 5 → «۵ روز دیگه», -2 → «۲ روز از سررسید گذشته»
 */
export function formatDueRelative(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'امروز';
  if (daysUntilDue === 1) return 'فردا';
  if (daysUntilDue > 1) return `${toPersianDigits(daysUntilDue)} روز دیگه`;
  return `${toPersianDigits(-daysUntilDue)} روز از سررسید گذشته`;
}
