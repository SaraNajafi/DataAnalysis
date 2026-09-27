import { cn } from '@/lib/cn';

export function ProgressBar({
  percent,
  label,
  className,
  tone = 'brand',
}: {
  percent: number;
  label: string;
  className?: string;
  tone?: 'brand' | 'paid';
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={label}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-line-soft', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', tone === 'paid' ? 'bg-paid-600' : 'bg-brand-500')}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}
