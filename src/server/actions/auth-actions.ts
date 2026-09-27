'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { COMMON_MESSAGES } from '@/lib/messages';
import { safeRedirectPath } from '@/lib/redirect';
import { clearSessionCookie, getCurrentSession, getSessionToken, setSessionCookie } from '../auth/session';
import { track } from '../services/analytics-service';
import { requestOtp, verifyOtp } from '../services/auth-service';
import { revokeSessionToken } from '../services/session-service';

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip') || null;
}

export type RequestOtpActionResult =
  | { ok: true; phoneNumber: string; expiresInSeconds: number; resendInSeconds: number }
  | { ok: false; message: string; retryAfterSeconds?: number };

export async function requestOtpAction(phone: string, options: { isResend?: boolean } = {}): Promise<RequestOtpActionResult> {
  try {
    const result = await requestOtp({ phone: String(phone ?? ''), ip: await clientIp() });
    if (!options.isResend && (result.ok || result.code === 'cooldown' || result.code === 'sms_failed')) {
      await track('login_started');
    }
    if (result.ok) return result;
    return { ok: false, message: result.message, retryAfterSeconds: result.retryAfterSeconds };
  } catch (error) {
    console.error('[auth] requestOtpAction failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: COMMON_MESSAGES.unexpected };
  }
}

export type VerifyOtpActionResult = { ok: false; message: string; expired?: boolean };

/** On success this redirects (to onboarding for new users); it only returns on failure. */
export async function verifyOtpAction(phone: string, code: string, next?: string): Promise<VerifyOtpActionResult> {
  let target: string;
  try {
    const result = await verifyOtp({ phone: String(phone ?? ''), code: String(code ?? '') });
    if (!result.ok) {
      return {
        ok: false,
        message: result.message,
        expired: result.code === 'expired' || result.code === 'too_many_attempts',
      };
    }
    await setSessionCookie(result.session.token, result.session.expiresAt);
    target = result.needsOnboarding ? '/onboarding' : safeRedirectPath(next);
  } catch (error) {
    console.error('[auth] verifyOtpAction failed', error instanceof Error ? error.message : 'unknown error');
    return { ok: false, message: COMMON_MESSAGES.unexpected };
  }
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  const current = await getCurrentSession();
  const token = await getSessionToken();
  await revokeSessionToken(token);
  await clearSessionCookie();
  if (current) await track('logout', { userId: current.user.id });
  redirect('/login');
}
