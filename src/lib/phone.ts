import { toLatinDigits, toPersianDigits } from './format';

/**
 * Normalizes common Iranian mobile formats to E.164 (+989XXXXXXXXX).
 *
 * Accepted: 09121234567, +989121234567, 989121234567, 00989121234567,
 * 9121234567 — with optional spaces/dashes and Persian/Arabic digits.
 * Returns null when the input is not a valid Iranian mobile number.
 */
export function normalizeIranianMobile(input: string): string | null {
  if (typeof input !== 'string') return null;
  let s = toLatinDigits(input.trim()).replace(/[\s\-()‎‏]/g, '');

  if (s.startsWith('+98')) s = s.slice(3);
  else if (s.startsWith('0098')) s = s.slice(4);
  else if (s.startsWith('98') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);

  if (!/^9\d{9}$/.test(s)) return null;
  return `+98${s}`;
}

/** +989121234567 → 09121234567 (format expected by Iranian SMS gateways). */
export function toLocalMobile(e164: string): string {
  return e164.startsWith('+98') ? `0${e164.slice(3)}` : e164;
}

/** +989121234567 → «۰۹۱۲ ۱۲۳ ۴۵۶۷» */
export function formatPhoneForDisplay(e164: string): string {
  const local = toLocalMobile(e164);
  const pretty = `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  return toPersianDigits(pretty);
}

/** +989121234567 → «۰۹۱۲ ••• ۴۵۶۷» */
export function maskPhone(e164: string): string {
  const local = toLocalMobile(e164);
  return toPersianDigits(`${local.slice(0, 4)} ••• ${local.slice(7)}`);
}
