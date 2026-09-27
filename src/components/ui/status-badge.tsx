import { CircleAlert, CircleCheck, Clock, Hourglass } from 'lucide-react';
import { STATUS_LABELS, type InstallmentStatus } from '@/domain/status';
import { cn } from '@/lib/cn';

const STYLES: Record<InstallmentStatus, { className: string; Icon: typeof CircleCheck }> = {
  paid: { className: 'bg-paid-50 text-paid-600', Icon: CircleCheck },
  overdue: { className: 'bg-late-50 text-late-700', Icon: CircleAlert },
  dueToday: { className: 'bg-brand-50 text-brand-700', Icon: Clock },
  upcoming: { className: 'bg-line-soft text-ink-soft', Icon: Hourglass },
};

export function StatusBadge({ status, className }: { status: InstallmentStatus; className?: string }) {
  const { className: tone, Icon } = STYLES[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
