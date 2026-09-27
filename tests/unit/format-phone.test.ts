import { describe, expect, it } from 'vitest';
import {
  formatCompactToman,
  formatDueRelative,
  formatNumber,
  formatPercent,
  formatToman,
  parseIntegerInput,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/format';
import { formatPhoneForDisplay, maskPhone, normalizeIranianMobile, toLocalMobile } from '@/lib/phone';

describe('Persian number formatting', () => {
  it('converts digits both ways', () => {
    expect(toPersianDigits(1234567890)).toBe('۱۲۳۴۵۶۷۸۹۰');
    expect(toLatinDigits('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(toLatinDigits('٠٩١٢')).toBe('0912');
  });

  it('formats money with Persian digits and separators', () => {
    expect(formatNumber(1234567)).toBe('۱٬۲۳۴٬۵۶۷');
    expect(formatToman(2500000)).toBe('۲٬۵۰۰٬۰۰۰ تومان');
    expect(formatToman(0)).toBe('۰ تومان');
    expect(formatNumber(999)).toBe('۹۹۹');
  });

  it('formats compact amounts', () => {
    expect(formatCompactToman(18_400_000)).toBe('۱۸٫۴ میلیون');
    expect(formatCompactToman(21_700_000)).toBe('۲۱٫۷ میلیون');
    expect(formatCompactToman(13_000_000)).toBe('۱۳ میلیون');
    expect(formatCompactToman(850_000)).toBe('۸۵۰ هزار');
    expect(formatCompactToman(1_250_000_000)).toBe('۱٫۳ میلیارد');
    expect(formatCompactToman(0)).toBe('۰');
  });

  it('formats percents and relative due text', () => {
    expect(formatPercent(73)).toBe('۷۳٪');
    expect(formatDueRelative(0)).toBe('امروز');
    expect(formatDueRelative(1)).toBe('فردا');
    expect(formatDueRelative(3)).toBe('۳ روز دیگه');
    expect(formatDueRelative(-2)).toBe('۲ روز از سررسید گذشته');
  });

  it('parses amount input with Persian digits and separators', () => {
    expect(parseIntegerInput('۲٬۵۰۰٬۰۰۰')).toBe(2500000);
    expect(parseIntegerInput('2,500,000')).toBe(2500000);
    expect(parseIntegerInput('')).toBeNull();
    expect(parseIntegerInput('12a')).toBeNull();
    expect(parseIntegerInput('-5')).toBeNull();
  });
});

describe('Iranian mobile normalization', () => {
  it.each([
    ['09121234567', '+989121234567'],
    ['+989121234567', '+989121234567'],
    ['989121234567', '+989121234567'],
    ['00989121234567', '+989121234567'],
    ['9121234567', '+989121234567'],
    ['0912 123 4567', '+989121234567'],
    ['0912-123-4567', '+989121234567'],
    ['۰۹۱۲۱۲۳۴۵۶۷', '+989121234567'],
    ['+۹۸۹۱۲۱۲۳۴۵۶۷', '+989121234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIranianMobile(input)).toBe(expected);
  });

  it.each(['', '0912123456', '091212345678', '08121234567', '+19121234567', 'abc', '02112345678'])(
    'rejects %s',
    (input) => {
      expect(normalizeIranianMobile(input)).toBeNull();
    },
  );

  it('different formats map to the same identity (no duplicate users)', () => {
    const variants = ['09121234567', '+989121234567', '989121234567'].map(normalizeIranianMobile);
    expect(new Set(variants).size).toBe(1);
  });

  it('formats phones for display and SMS gateways', () => {
    expect(toLocalMobile('+989121234567')).toBe('09121234567');
    expect(formatPhoneForDisplay('+989121234567')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷');
    expect(maskPhone('+989121234567')).toBe('۰۹۱۲ ••• ۴۵۶۷');
  });
});
