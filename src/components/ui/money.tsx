import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';

/** Amount in Persian digits with a smaller «تومان» unit. */
export function Money({
  amount,
  className,
  unitClassName,
  wrap = false,
}: {
  amount: number;
  className?: string;
  unitClassName?: string;
  /** Allow «تومان» to wrap onto its own line in narrow cells. */
  wrap?: boolean;
}) {
  return (
    <span className={cn('num', !wrap && 'whitespace-nowrap', className)}>
      {formatNumber(amount)}{' '}
      <span className={cn('text-[0.72em] font-medium text-muted', unitClassName)}>تومان</span>
    </span>
  );
}
