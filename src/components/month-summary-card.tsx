import type { MonthSummary } from '@/domain/calculations';
import { formatPercent } from '@/lib/format';
import { formatJalaliMonth } from '@/lib/jalali';
import { cn } from '@/lib/cn';
import { Money } from './ui/money';

/** Hero card: total obligations of a Jalali month, paid vs remaining, and progress. */
export function MonthSummaryCard({
  summary,
  title,
  emptyText = 'این ماه پرداختی نداری 🎉',
}: {
  summary: MonthSummary;
  title: string;
  emptyText?: string;
}) {
  const { total, paid, remaining, progressPercent } = summary;
  return (
    <section
      aria-labelledby="month-summary-title"
      className="rounded-[var(--radius-card)] bg-brand-700 p-5 text-white shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="month-summary-title" className="text-sm font-semibold text-white/80">
          {title}
        </h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/85">{formatJalaliMonth(summary.month)}</span>
      </div>

      <p className="mt-3 text-[34px] leading-tight font-extrabold tracking-tight">
        <Money amount={total} unitClassName="text-white/70 text-base" />
      </p>

      {total === 0 ? (
        <p className="mt-3 text-sm text-white/85">{emptyText}</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label="درصد پرداخت‌شده این ماه"
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15"
          >
            <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-2 text-sm font-semibold text-white/90">{formatPercent(progressPercent)} پرداخت شده</p>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 px-3 py-2.5">
              <dt className="text-xs text-white/75">پرداخت‌شده</dt>
              <dd className="mt-1 text-[15px] font-bold">
                <Money amount={paid} unitClassName="text-white/70" />
              </dd>
            </div>
            <div className={cn('rounded-2xl px-3 py-2.5', remaining > 0 ? 'bg-white text-ink' : 'bg-white/10')}>
              <dt className={cn('text-xs', remaining > 0 ? 'text-muted' : 'text-white/75')}>باقی‌مانده</dt>
              <dd className="mt-1 text-[15px] font-bold">
                <Money amount={remaining} unitClassName={remaining > 0 ? undefined : 'text-white/70'} />
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
