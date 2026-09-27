import { toLocalMobile } from '@/lib/phone';
import { SmsDeliveryError, type SmsProvider } from './types';

/**
 * Development-only provider: prints the OTP to the server console.
 * It refuses to run in production so codes can never leak into production logs.
 */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';

  async sendOtp(phoneNumber: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new SmsDeliveryError('Mock SMS provider cannot be used in production. Configure SMS_PROVIDER.');
    }
    const local = toLocalMobile(phoneNumber);
    console.info(`[mock-sms] OTP for ${local.slice(0, 4)}***${local.slice(-4)}: ${code}`);
  }
}
