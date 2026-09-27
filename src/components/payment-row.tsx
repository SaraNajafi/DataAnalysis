import Link from 'next/link';
import { deriveInstallmentStatus } from '@/domain/status';
import { formatDueRelative } from '@/lib/format';
import { diffDays, formatPersianDate, type ISODate } from '@/lib/jalali';
import { cn } from '@/lib/cn';
import type { PaymentItem } from '@/server/services/dashboard-service';
import { PayButton, UndoPaymentButton } from './payment-flow';
import { Money } from './ui/money';
import { ProviderAvatar } from './ui/provider-avatar';
import { StatusBadge } from './ui/status-badge';

/** A single installment in Home / Calendar lists, with its «پرداخت کردم» action. */
export function PaymentRow({
  item,
  today,
  showDate = true,
  showStatus = false,
  allowUndo = false,
}: {
  item: PaymentItem;
  today: ISODate;
  showDate?: boolean;
  showStatus?: boolean;
  allowUndo?: boolean;
}) {
  const status = deriveInstallmentStatus(item, today);
  const days = diffDays(item.dueDate, today);
  const relative = status === 'paid' ? null : formatDueRelative(days);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Link href={`/installments/${item.creditAccountId}`} className="flex min-w-0 flex-1 items-center gap-3">
          <ProviderAvatar slug={item.providerSlug} name={item.displayName} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-ink">{item.displayName}</span>
            {item.accountTitle && <span className="block truncate text-xs text-muted">{item.accountTitle}</span>}
          </span>
        </Link>
        <Money amount={item.amount} className={cn('text-[15px] font-bold', status === 'paid' && 'text-muted')} />
      </div>
      <div className="flex items-center justify-between gap-2 ps-12">
        <p className="text-sm text-ink-soft">
          {showDate && <span className="num">{formatPersianDate(item.dueDate, { year: 'auto', today })}</span>}
          {showDate && relative && <span className="mx-1.5 text-line">|</span>}
          {relative && (
            <span className={cn(status === 'overdue' ? 'font-semibold text-late-700' : status === 'dueToday' ? 'font-semibold text-brand-700' : 'text-muted')}>
              {relative}
            </span>
          )}
          {showStatus && status === 'paid' && <StatusBadge status="paid" />}
        </p>
        {status !== 'paid' ? (
          <PayButton
            target={{
              installmentId: item.id,
              providerSlug: item.providerSlug,
              displayName: item.displayName,
              amount: item.amount,
              dueDate: item.dueDate,
            }}
          />
        ) : (
          allowUndo && <UndoPaymentButton installmentId={item.id} />
        )}
      </div>
    </li>
  );
}
