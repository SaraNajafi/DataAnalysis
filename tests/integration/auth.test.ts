import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, CapturingSmsProvider, TestClock } from '../helpers/db';
import { OTP_CONFIG, requestOtp, verifyOtp } from '@/server/services/auth-service';
import { revokeSessionToken, validateSessionToken } from '@/server/services/session-service';

let ctx: Awaited<ReturnType<typeof createTestDatabase>>;
let sms: CapturingSmsProvider;
let clock: TestClock;

beforeAll(async () => {
  ctx = await createTestDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE users, otp_requests, sessions, analytics_events CASCADE`);
  sms = new CapturingSmsProvider();
  clock = new TestClock();
});

const deps = () => ({ sms, now: clock.now });

async function loginFlow(phone: string) {
  const req = await requestOtp({ phone, ip: '1.2.3.4' }, deps());
  expect(req.ok).toBe(true);
  return verifyOtp({ phone, code: sms.lastCode() }, deps());
}

describe('OTP request', () => {
  it('rejects invalid phone numbers', async () => {
    const res = await requestOtp({ phone: '12345' }, deps());
    expect(res).toMatchObject({ ok: false, code: 'invalid_phone' });
    expect(sms.sent).toHaveLength(0);
  });

  it('sends a 6-digit code and stores only its hash', async () => {
    const res = await requestOtp({ phone: '09121234567' }, deps());
    expect(res.ok).toBe(true);
    const code = sms.lastCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(sms.sent[0]?.phoneNumber).toBe('+989121234567');

    const rows = await ctx.db.execute(sql`SELECT otp_hash FROM otp_requests`);
    const stored = (rows as unknown as { rows: Array<{ otp_hash: string }> }).rows[0]!.otp_hash;
    expect(stored).not.toContain(code);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never returns the OTP in the API response', async () => {
    const res = await requestOtp({ phone: '09121234567' }, deps());
    expect(JSON.stringify(res)).not.toContain(sms.lastCode());
  });

  it('enforces a resend cooldown', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    clock.advanceSeconds(10);
    const res = await requestOtp({ phone: '09121234567' }, deps());
    expect(res).toMatchObject({ ok: false, code: 'cooldown' });
    if (!res.ok) expect(res.retryAfterSeconds).toBe(OTP_CONFIG.resendCooldownSeconds - 10);
  });

  it('does not apply the cooldown once the previous code was used to log in', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    expect((await verifyOtp({ phone: '09121234567', code: sms.lastCode() }, deps())).ok).toBe(true);
    clock.advanceSeconds(5);
    expect((await requestOtp({ phone: '09121234567' }, deps())).ok).toBe(true);
  });

  it('rate-limits OTP generation per phone number', async () => {
    for (let i = 0; i < OTP_CONFIG.maxPerPhonePerHour; i++) {
      const res = await requestOtp({ phone: '09121234567' }, deps());
      expect(res.ok).toBe(true);
      clock.advanceSeconds(OTP_CONFIG.resendCooldownSeconds + 1);
    }
    const blocked = await requestOtp({ phone: '09121234567' }, deps());
    expect(blocked).toMatchObject({ ok: false, code: 'rate_limited' });
    clock.advanceSeconds(3600);
    expect((await requestOtp({ phone: '09121234567' }, deps())).ok).toBe(true);
  });

  it('rate-limits OTP generation per IP address', async () => {
    for (let i = 0; i < OTP_CONFIG.maxPerIpPerHour; i++) {
      const phone = `0912000${String(i).padStart(4, '0')}`;
      expect((await requestOtp({ phone, ip: '9.9.9.9' }, deps())).ok).toBe(true);
    }
    const blocked = await requestOtp({ phone: '09129999999', ip: '9.9.9.9' }, deps());
    expect(blocked).toMatchObject({ ok: false, code: 'rate_limited' });
  });

  it('invalidates the previous code when a new one is issued', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    const oldCode = sms.lastCode();
    clock.advanceSeconds(OTP_CONFIG.resendCooldownSeconds + 1);
    await requestOtp({ phone: '09121234567' }, deps());
    const newCode = sms.lastCode();
    if (oldCode !== newCode) {
      const res = await verifyOtp({ phone: '09121234567', code: oldCode }, deps());
      expect(res.ok).toBe(false);
    }
    expect((await verifyOtp({ phone: '09121234567', code: newCode }, deps())).ok).toBe(true);
  });

  it('lets the user retry immediately when SMS delivery fails', async () => {
    sms.fail = true;
    const failed = await requestOtp({ phone: '09121234567' }, deps());
    expect(failed).toMatchObject({ ok: false, code: 'sms_failed' });
    sms.fail = false;
    expect((await requestOtp({ phone: '09121234567' }, deps())).ok).toBe(true);
  });
});

describe('OTP verification', () => {
  it('creates a new user on first verification (signup) and logs in afterwards', async () => {
    const first = await loginFlow('09121234567');
    expect(first).toMatchObject({ ok: true, isNewUser: true, needsOnboarding: true });

    clock.advanceSeconds(OTP_CONFIG.resendCooldownSeconds + 1);
    const second = await loginFlow('+989121234567');
    expect(second).toMatchObject({ ok: true, isNewUser: false });
    if (first.ok && second.ok) expect(second.userId).toBe(first.userId);

    const users = await ctx.db.execute(sql`SELECT count(*)::int AS n FROM users`);
    expect((users as unknown as { rows: Array<{ n: number }> }).rows[0]!.n).toBe(1);
  });

  it('rejects a wrong code and reports remaining attempts', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    const wrong = sms.lastCode() === '000000' ? '111111' : '000000';
    const res = await verifyOtp({ phone: '09121234567', code: wrong }, deps());
    expect(res).toMatchObject({ ok: false, code: 'invalid_code', attemptsLeft: OTP_CONFIG.maxAttempts - 1 });
  });

  it('accepts Persian digits in the code', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    const persian = sms.lastCode().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);
    expect((await verifyOtp({ phone: '09121234567', code: persian }, deps())).ok).toBe(true);
  });

  it('expires codes after the TTL', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    clock.advanceSeconds(OTP_CONFIG.ttlSeconds + 1);
    const res = await verifyOtp({ phone: '09121234567', code: sms.lastCode() }, deps());
    expect(res).toMatchObject({ ok: false, code: 'expired' });
  });

  it('locks the code after too many wrong attempts, even if the right code is sent later', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    const right = sms.lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < OTP_CONFIG.maxAttempts - 1; i++) {
      expect(await verifyOtp({ phone: '09121234567', code: wrong }, deps())).toMatchObject({ code: 'invalid_code' });
    }
    expect(await verifyOtp({ phone: '09121234567', code: wrong }, deps())).toMatchObject({ code: 'too_many_attempts' });
    expect(await verifyOtp({ phone: '09121234567', code: right }, deps())).toMatchObject({
      ok: false,
      code: 'too_many_attempts',
    });
  });

  it('codes are single-use', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    const code = sms.lastCode();
    expect((await verifyOtp({ phone: '09121234567', code }, deps())).ok).toBe(true);
    expect((await verifyOtp({ phone: '09121234567', code }, deps())).ok).toBe(false);
  });

  it('a code for one phone number cannot log into another', async () => {
    await requestOtp({ phone: '09121234567' }, deps());
    const res = await verifyOtp({ phone: '09350000000', code: sms.lastCode() }, deps());
    expect(res.ok).toBe(false);
  });
});

describe('sessions', () => {
  it('creates a session that validates, stores only a hash, and is destroyed on logout', async () => {
    const res = await loginFlow('09121234567');
    if (!res.ok) throw new Error('login failed');
    const valid = await validateSessionToken(res.session.token);
    expect(valid?.user.phoneNumber).toBe('+989121234567');

    const rows = await ctx.db.execute(sql`SELECT token_hash FROM sessions`);
    const stored = (rows as unknown as { rows: Array<{ token_hash: string }> }).rows[0]!.token_hash;
    expect(stored).not.toBe(res.session.token);

    await revokeSessionToken(res.session.token);
    expect(await validateSessionToken(res.session.token)).toBeNull();
  });

  it('rejects expired sessions and garbage tokens', async () => {
    const res = await loginFlow('09121234567');
    if (!res.ok) throw new Error('login failed');
    const later = new Date(res.session.expiresAt.getTime() + 1000);
    expect(await validateSessionToken(res.session.token, later)).toBeNull();
    expect(await validateSessionToken('not-a-real-token')).toBeNull();
    expect(await validateSessionToken('x'.repeat(5000))).toBeNull();
  });
});
