/**
 * SMS provider abstraction. Swap implementations via the SMS_PROVIDER env var
 * without touching the authentication flow.
 */
export interface SmsProvider {
  readonly name: string;
  /**
   * Delivers a one-time code to a normalized (+98…) mobile number.
   * Must throw on failure. Implementations must never log the code in production.
   */
  sendOtp(phoneNumber: string, code: string): Promise<void>;
}

export class SmsDeliveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SmsDeliveryError';
  }
}
