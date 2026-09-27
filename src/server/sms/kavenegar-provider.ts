import { toLocalMobile } from '@/lib/phone';
import { SmsDeliveryError, type SmsProvider } from './types';

/**
 * Kavenegar (kavenegar.com) adapter.
 *
 * - If SMS_TEMPLATE is set, uses the Verify Lookup API (recommended for OTP;
 *   create a template containing %token in the Kavenegar panel).
 * - Otherwise sends a plain SMS from SMS_SENDER.
 *
 * Env: SMS_API_KEY (required), SMS_TEMPLATE, SMS_SENDER.
 */
export class KavenegarSmsProvider implements SmsProvider {
  readonly name = 'kavenegar';

  constructor(
    private readonly config: { apiKey: string; template?: string; sender?: string; timeoutMs?: number },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!config.apiKey) throw new SmsDeliveryError('SMS_API_KEY is required for the kavenegar provider');
    if (!config.template && !config.sender) {
      throw new SmsDeliveryError('Either SMS_TEMPLATE or SMS_SENDER is required for the kavenegar provider');
    }
  }

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    const receptor = toLocalMobile(phoneNumber);
    const base = `https://api.kavenegar.com/v1/${encodeURIComponent(this.config.apiKey)}`;
    let url: string;
    const body = new URLSearchParams({ receptor });

    if (this.config.template) {
      url = `${base}/verify/lookup.json`;
      body.set('token', code);
      body.set('template', this.config.template);
    } else {
      url = `${base}/sms/send.json`;
      body.set('sender', this.config.sender ?? '');
      body.set('message', `کد ورود شما به پی‌نو: ${code}\nاین کد را در اختیار کسی قرار ندهید.`);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new SmsDeliveryError('Kavenegar request failed', { cause: error });
    }

    if (!response.ok) {
      // Do not include the response body: it may echo the receptor/token.
      throw new SmsDeliveryError(`Kavenegar responded with HTTP ${response.status}`);
    }
    const payload = (await response.json().catch(() => null)) as { return?: { status?: number } } | null;
    if (payload?.return?.status !== 200) {
      throw new SmsDeliveryError(`Kavenegar returned status ${payload?.return?.status ?? 'unknown'}`);
    }
  }
}
