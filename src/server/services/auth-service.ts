import 'server-only';
import { randomUUID } from 'node:crypto';
import { toLatinDigits } from '@/lib/format';
import { normalizeIranianMobile } from '@/lib/phone';
import { getDb } from '../db/client';
import {
  consumeOtpAttempt,
  countOtpRequestsForIpSince,
  countOtpRequestsForPhoneSince,
  findActiveOtpRequest,
  findLatestOtpRequest,
  insertOtpRequest,
  invalidateActiveOtpRequests,
  markOtpDeliveryFailed,
  markOtpVerified,
} from '../repositories/otp-repository';
import { findOrCreateUserByPhone } from '../repositories/user-repository';
import { generateNumericCode, hmac, safeEqualHex } from '../security/crypto';
import { getSmsProvider, type SmsProvider } from '../sms';
import { track } from './analytics-service';
import { createSession } from './session-service';

export const OTP_CONFIG = {
  length: 6,
  ttlSeconds: 120,
  resendCooldownSeconds: 60,
  maxAttempts: 5,
  maxPerPhonePerHour: 5,
  /** Override with OTP_MAX_PER_IP_PER_HOUR (e.g. for load/e2e testing behind a single IP). */
  maxPerIpPerHour: Number(process.env.OTP_MAX_PER_IP_PER_HOUR) || 20,
} as const;

export const AUTH_MESSAGES = {
  invalidPhone: 'شماره موبایل درست نیست. مثلاً ۰۹۱۲۱۲۳۴۵۶۷ وارد کن.',
  cooldown: 'کد قبلی همین الان ارسال شده. کمی صبر کن و دوباره امتحان کن.',
  rateLimited: 'تعداد درخواست‌ها زیاد بوده. لطفاً کمی بعد دوباره امتحان کن.',
  smsFailed: 'ارسال پیامک انجام نشد. چند لحظه دیگه دوباره تلاش کن.',
  codeFormat: 'کد ۶ رقمی رو کامل وارد کن.',
  invalidCode: 'کد واردشده درست نیست. دوباره امتحان کن.',
  expired: 'زمان این کد تموم شده. کد جدید بگیر.',
  tooManyAttempts: 'تعداد تلاش‌ها زیاد بود. کد جدید بگیر.',
} as const;

export interface AuthDeps {
  now?: () => Date;
  sms?: SmsProvider;
  generateCode?: () => string;
}

export type RequestOtpResult =
  | { ok: true; phoneNumber: string; expiresInSeconds: number; resendInSeconds: number }
  | {
      ok: false;
      code: 'invalid_phone' | 'cooldown' | 'rate_limited' | 'sms_failed';
      message: string;
      retryAfterSeconds?: number;
    };

function otpHash(id: string, phoneNumber: string, code: string): string {
  return hmac('otp', `${id}:${phoneNumber}:${code}`);
}

export async function requestOtp(
  input: { phone: string; ip?: string | null },
  deps: AuthDeps = {},
): Promise<RequestOtpResult> {
  const phoneNumber = normalizeIranianMobile(input.phone);
  if (!phoneNumber) return { ok: false, code: 'invalid_phone', message: AUTH_MESSAGES.invalidPhone };

  const db = getDb();
  const now = deps.now?.() ?? new Date();
  const hourAgo = new Date(now.getTime() - 3_600_000);

  // Cooldown only while the previous code is still unused; after a successful
  // login the user may request a fresh code right away (e.g. logout → login).
  const latest = await findLatestOtpRequest(db, phoneNumber);
  if (latest && !latest.verifiedAt) {
    const elapsed = (now.getTime() - latest.lastSentAt.getTime()) / 1000;
    if (elapsed < OTP_CONFIG.resendCooldownSeconds) {
      return {
        ok: false,
        code: 'cooldown',
        message: AUTH_MESSAGES.cooldown,
        retryAfterSeconds: Math.ceil(OTP_CONFIG.resendCooldownSeconds - elapsed),
      };
    }
  }

  if ((await countOtpRequestsForPhoneSince(db, phoneNumber, hourAgo)) >= OTP_CONFIG.maxPerPhonePerHour) {
    return { ok: false, code: 'rate_limited', message: AUTH_MESSAGES.rateLimited };
  }

  const requestIpHash = input.ip ? hmac('ip', input.ip) : null;
  if (requestIpHash && (await countOtpRequestsForIpSince(db, requestIpHash, hourAgo)) >= OTP_CONFIG.maxPerIpPerHour) {
    return { ok: false, code: 'rate_limited', message: AUTH_MESSAGES.rateLimited };
  }

  const code = deps.generateCode?.() ?? generateNumericCode(OTP_CONFIG.length);
  const id = randomUUID();

  await db.transaction(async (tx) => {
    // A new code always invalidates older, still-unused codes.
    await invalidateActiveOtpRequests(tx, phoneNumber, now);
    await insertOtpRequest(tx, {
      id,
      phoneNumber,
      otpHash: otpHash(id, phoneNumber, code),
      expiresAt: new Date(now.getTime() + OTP_CONFIG.ttlSeconds * 1000),
      requestIpHash,
      lastSentAt: now,
      createdAt: now,
    });
  });

  try {
    await (deps.sms ?? getSmsProvider()).sendOtp(phoneNumber, code);
  } catch (error) {
    console.error('[auth] OTP delivery failed', error instanceof Error ? error.message : 'unknown error');
    await markOtpDeliveryFailed(db, id, now, OTP_CONFIG.resendCooldownSeconds);
    return { ok: false, code: 'sms_failed', message: AUTH_MESSAGES.smsFailed };
  }

  await track('otp_requested');
  return {
    ok: true,
    phoneNumber,
    expiresInSeconds: OTP_CONFIG.ttlSeconds,
    resendInSeconds: OTP_CONFIG.resendCooldownSeconds,
  };
}

export type VerifyOtpResult =
  | {
      ok: true;
      userId: string;
      isNewUser: boolean;
      needsOnboarding: boolean;
      session: { token: string; expiresAt: Date };
    }
  | {
      ok: false;
      code: 'invalid_phone' | 'invalid_code_format' | 'invalid_code' | 'expired' | 'too_many_attempts';
      message: string;
      attemptsLeft?: number;
    };

export async function verifyOtp(input: { phone: string; code: string }, deps: AuthDeps = {}): Promise<VerifyOtpResult> {
  const phoneNumber = normalizeIranianMobile(input.phone);
  if (!phoneNumber) return { ok: false, code: 'invalid_phone', message: AUTH_MESSAGES.invalidPhone };

  const code = toLatinDigits(String(input.code ?? '')).replace(/\s/g, '');
  if (!new RegExp(`^\\d{${OTP_CONFIG.length}}$`).test(code)) {
    return { ok: false, code: 'invalid_code_format', message: AUTH_MESSAGES.codeFormat };
  }

  const db = getDb();
  const now = deps.now?.() ?? new Date();

  const otp = await findActiveOtpRequest(db, phoneNumber);
  if (!otp || otp.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, code: 'expired', message: AUTH_MESSAGES.expired };
  }
  if (otp.attemptCount >= OTP_CONFIG.maxAttempts) {
    return { ok: false, code: 'too_many_attempts', message: AUTH_MESSAGES.tooManyAttempts, attemptsLeft: 0 };
  }

  const attempts = await consumeOtpAttempt(db, otp.id, OTP_CONFIG.maxAttempts);
  if (attempts === null) {
    return { ok: false, code: 'too_many_attempts', message: AUTH_MESSAGES.tooManyAttempts, attemptsLeft: 0 };
  }

  if (!safeEqualHex(otp.otpHash, otpHash(otp.id, phoneNumber, code))) {
    const attemptsLeft = OTP_CONFIG.maxAttempts - attempts;
    return attemptsLeft <= 0
      ? { ok: false, code: 'too_many_attempts', message: AUTH_MESSAGES.tooManyAttempts, attemptsLeft: 0 }
      : { ok: false, code: 'invalid_code', message: AUTH_MESSAGES.invalidCode, attemptsLeft };
  }

  // Single use: only one concurrent request can flip verified_at.
  if (!(await markOtpVerified(db, otp.id, now))) {
    return { ok: false, code: 'expired', message: AUTH_MESSAGES.expired };
  }

  const { user, created } = await findOrCreateUserByPhone(db, phoneNumber, now);
  const session = await createSession(user.id, now);

  await track('otp_verified', { userId: user.id });
  await track(created ? 'signup_completed' : 'login_completed', { userId: user.id });

  return {
    ok: true,
    userId: user.id,
    isNewUser: created,
    needsOnboarding: user.onboardingCompletedAt === null,
    session,
  };
}
