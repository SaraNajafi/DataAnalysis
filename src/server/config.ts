import 'server-only';
import { normalizeIranianMobile } from '@/lib/phone';
import { DEFAULT_TIME_ZONE, todayISO, type ISODate } from '@/lib/jalali';

/**
 * Server configuration read lazily from environment variables, so that
 * `next build` does not require runtime secrets.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

const DEV_FALLBACK_SECRET = 'peyno-dev-only-insecure-secret-change-me-0123456789';
let warnedAboutSecret = false;

/** Secret used for HMAC-ing OTP codes and IP addresses. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (isProduction()) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters');
  }
  if (!warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('[config] SESSION_SECRET is missing or too short — using an insecure development fallback.');
  }
  return DEV_FALLBACK_SECRET;
}

export function getAppTimeZone(): string {
  return process.env.APP_TIMEZONE || DEFAULT_TIME_ZONE;
}

/** Today's calendar date in the app time zone (Asia/Tehran by default). */
export function appToday(now: Date = new Date()): ISODate {
  return todayISO(getAppTimeZone(), now);
}

export function getAdminPhoneNumbers(): Set<string> {
  const raw = process.env.ADMIN_PHONE_NUMBERS ?? '';
  const phones = raw
    .split(/[,\s]+/)
    .map((p) => normalizeIranianMobile(p))
    .filter((p): p is string => p !== null);
  return new Set(phones);
}

export function isAdminPhone(phoneNumber: string): boolean {
  return getAdminPhoneNumbers().has(phoneNumber);
}
