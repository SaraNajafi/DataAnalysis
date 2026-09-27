import type { ISODate } from '@/lib/jalali';

/**
 * Installment status is DERIVED, never stored:
 * - paid      → paidAt is not null
 * - overdue   → unpaid and dueDate < today
 * - dueToday  → unpaid and dueDate == today
 * - upcoming  → unpaid and dueDate > today
 */
export type InstallmentStatus = 'paid' | 'overdue' | 'dueToday' | 'upcoming';

export interface StatusInput {
  dueDate: ISODate;
  paidAt: Date | string | null;
}

export function deriveInstallmentStatus(item: StatusInput, today: ISODate): InstallmentStatus {
  if (item.paidAt != null) return 'paid';
  if (item.dueDate < today) return 'overdue';
  if (item.dueDate === today) return 'dueToday';
  return 'upcoming';
}

export const STATUS_LABELS: Record<InstallmentStatus, string> = {
  paid: 'پرداخت شده',
  overdue: 'عقب‌افتاده',
  dueToday: 'امروز',
  upcoming: 'در انتظار',
};
