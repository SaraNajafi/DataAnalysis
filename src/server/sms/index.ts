import 'server-only';
import { KavenegarSmsProvider } from './kavenegar-provider';
import { MockSmsProvider } from './mock-provider';
import { SmsDeliveryError, type SmsProvider } from './types';

export type { SmsProvider } from './types';
export { SmsDeliveryError } from './types';

let cached: SmsProvider | null = null;

/**
 * Resolves the SMS provider from SMS_PROVIDER:
 * - `mock` (default outside production): logs the OTP to the server console.
 * - `kavenegar`: Kavenegar HTTP API (SMS_API_KEY + SMS_TEMPLATE or SMS_SENDER).
 *
 * To add another gateway, implement `SmsProvider` and register it here.
 */
export function getSmsProvider(): SmsProvider {
  if (cached) return cached;
  const kind = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
  switch (kind) {
    case 'mock':
      cached = new MockSmsProvider();
      break;
    case 'kavenegar':
      cached = new KavenegarSmsProvider({
        apiKey: process.env.SMS_API_KEY ?? '',
        template: process.env.SMS_TEMPLATE || undefined,
        sender: process.env.SMS_SENDER || undefined,
      });
      break;
    default:
      throw new SmsDeliveryError(`Unknown SMS_PROVIDER "${kind}"`);
  }
  return cached;
}
