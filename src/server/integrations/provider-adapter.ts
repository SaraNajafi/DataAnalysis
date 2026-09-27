/**
 * FUTURE INTEGRATION CONTRACT — not implemented in the MVP.
 *
 * Today every credit account is entered by the user (`source = 'manual'`).
 * When a BNPL provider, bank or open-banking API becomes available, an
 * adapter implementing this interface can import accounts and schedules and
 * keep them in sync. The rest of the product (dashboard, calendar, payments
 * view) already works on the provider-agnostic CreditAccount / Installment
 * model, so synced accounts appear exactly like manual ones.
 *
 * Mapping to `credit_accounts.source`:
 *   manual        → user-entered (MVP)
 *   provider_api  → e.g. SnappPay / Digipay APIs
 *   bank_api      → bank or open-banking APIs
 *   import        → file/statement import
 *
 * Deliberately out of scope for the MVP: payments, auto-pay, direct debit,
 * credit scoring and any real provider API calls.
 */
import type { ISODate } from '@/lib/jalali';

export type CreditAccountSource = 'manual' | 'provider_api' | 'bank_api' | 'import';

export interface ExternalCreditAccount {
  externalId: string;
  providerSlug: string;
  title: string | null;
  /** Integer Toman */
  outstandingDebt: number;
}

export interface ExternalInstallment {
  externalId: string;
  dueDate: ISODate;
  /** Integer Toman */
  amount: number;
  paidAt: Date | null;
}

export interface ExternalPaymentStatus {
  paymentId: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface SyncResult {
  accountsUpserted: number;
  installmentsUpserted: number;
  syncedAt: Date;
}

export interface ProviderAdapter {
  readonly source: Exclude<CreditAccountSource, 'manual'>;
  readonly providerSlug: string;
  getAccounts(userConnectionId: string): Promise<ExternalCreditAccount[]>;
  getOutstandingDebt(userConnectionId: string, externalAccountId: string): Promise<number>;
  getInstallmentSchedule(userConnectionId: string, externalAccountId: string): Promise<ExternalInstallment[]>;
  /** Not part of the MVP: پی‌نو does not move money. */
  createPayment?(userConnectionId: string, externalInstallmentId: string): Promise<ExternalPaymentStatus>;
  getPaymentStatus?(userConnectionId: string, paymentId: string): Promise<ExternalPaymentStatus>;
  /** Pull the latest accounts/schedules into پی‌نو's database for one user. */
  sync(userId: string, userConnectionId: string): Promise<SyncResult>;
}
