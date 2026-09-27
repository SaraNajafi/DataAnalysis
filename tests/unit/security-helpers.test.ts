import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeRedirectPath } from '@/lib/redirect';
import { isUuid } from '@/lib/ids';
import { isClientEventName, sanitizeClientEventProperties } from '@/server/services/analytics-service';
import { KavenegarSmsProvider } from '@/server/sms/kavenegar-provider';
import { MockSmsProvider } from '@/server/sms/mock-provider';
import { createCreditAccountSchema } from '@/domain/validation';

describe('post-login redirect', () => {
  it('allows same-origin paths only', () => {
    expect(safeRedirectPath('/calendar?m=1405-07')).toBe('/calendar?m=1405-07');
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('/\\evil.example')).toBe('/');
    expect(safeRedirectPath('/login')).toBe('/');
    expect(safeRedirectPath(undefined)).toBe('/');
  });
});

describe('id validation', () => {
  it('accepts UUIDs only', () => {
    expect(isUuid('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    expect(isUuid("1' OR '1'='1")).toBe(false);
    expect(isUuid(123)).toBe(false);
  });
});

describe('client analytics events', () => {
  it('only accepts allow-listed events', () => {
    expect(isClientEventName('calendar_opened')).toBe(true);
    expect(isClientEventName('installment_marked_paid')).toBe(false);
    expect(isClientEventName('anything')).toBe(false);
  });

  it('strips unexpected or sensitive properties', () => {
    expect(sanitizeClientEventProperties('provider_selected', { provider: 'snapp-pay', amount: 2_500_000 })).toEqual({
      provider: 'snapp-pay',
    });
    expect(sanitizeClientEventProperties('provider_selected', { provider: '<script>' })).toEqual({});
    expect(sanitizeClientEventProperties('overdue_installment_seen', { count: 2, phone: '0912' })).toEqual({ count: 2 });
    expect(sanitizeClientEventProperties('calendar_opened', { amount: 1 })).toEqual({});
  });
});

describe('SMS providers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('mock provider logs in development and refuses to run in production', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await new MockSmsProvider().sendOtp('+989121234567', '123456');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
    expect(log.mock.calls[0]?.[0]).not.toContain('09121234567'); // phone is masked

    vi.stubEnv('NODE_ENV', 'production');
    await expect(new MockSmsProvider().sendOtp('+989121234567', '123456')).rejects.toThrow();
  });

  it('kavenegar adapter calls the verify lookup API with a local-format receptor', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ return: { status: 200 } }), { status: 200 }));
    const provider = new KavenegarSmsProvider({ apiKey: 'KEY', template: 'peyno-otp' }, fetchMock as unknown as typeof fetch);
    await provider.sendOtp('+989121234567', '654321');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.kavenegar.com/v1/KEY/verify/lookup.json');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('receptor')).toBe('09121234567');
    expect(body.get('token')).toBe('654321');
    expect(body.get('template')).toBe('peyno-otp');
  });

  it('kavenegar adapter throws on API errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ return: { status: 418 } }), { status: 200 }));
    const provider = new KavenegarSmsProvider({ apiKey: 'KEY', sender: '1000' }, fetchMock as unknown as typeof fetch);
    await expect(provider.sendOtp('+989121234567', '654321')).rejects.toThrow();
  });
});

describe('credit account input validation', () => {
  const valid = {
    providerSlug: 'snapp-pay',
    installmentAmount: 2_500_000,
    remainingInstallments: 4,
    nextDueDate: '2026-09-27',
    frequency: 'monthly',
  };

  it('accepts a valid plan', () => {
    expect(createCreditAccountSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['zero amount', { installmentAmount: 0 }],
    ['negative amount', { installmentAmount: -100 }],
    ['fractional amount', { installmentAmount: 1000.5 }],
    ['zero installments', { remainingInstallments: 0 }],
    ['too many installments', { remainingInstallments: 500 }],
    ['invalid date', { nextDueDate: '2026-02-30' }],
    ['unknown provider', { providerSlug: 'paypal' }],
    ['other without a name', { providerSlug: 'other' }],
    ['custom frequency without days', { frequency: 'custom' }],
    ['too long custom name', { providerSlug: 'other', customProviderName: 'x'.repeat(61) }],
  ])('rejects %s', (_label, patch) => {
    expect(createCreditAccountSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
