import { TrendingUp } from 'lucide-react';
import type { MonthlyPressure } from '@/domain/calculations';
import { formatCompactToman } from '@/lib/format';
import { compareJalaliMonths, formatJalaliMonth, jalaliMonthName } from '@/lib/jalali';
import { cn } from '@/lib/cn';
import { Card } from './ui/card';

/** Factual view of scheduled obligations in the next three months (not financial advice). */
export function PressureCard({ pressure }: { pressure: MonthlyPressure }) {
  const max = Math.max(...pressure.months.map((m) => m.total), 0);
  if (max === 0) return null;
  const peak = pressure.peak;
  const allEqual = pressure.months.every((m) => m.total === max);

  return (
    <Card className="p-4" aria-labelledby="pressure-title">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="size-5 text-brand-600" aria-hidden />
        <h2 id="pressure-title" className="text-base font-bold">
          سه ماه آینده
        </h2>
      </div>
      <ul className="space-y-3">
        {pressure.months.map(({ month, total }) => {
          const isPeak = peak !== null && compareJalaliMonths(peak, month) === 0;
          const width = max > 0 ? Math.max(4, Math.round((total / max) * 100)) : 0;
          return (
            <li key={`${month.jy}-${month.jm}`} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3">
              <span className={cn('text-sm', isPeak ? 'font-bold text-ink' : 'text-ink-soft')}>{jalaliMonthName(month.jm)}</span>
              <span className="h-3 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                <span
                  className={cn('block h-full rounded-full', isPeak ? 'bg-brand-600' : 'bg-brand-100')}
                  style={{ width: total > 0 ? `${width}%` : '0%' }}
                />
              </span>
              <span className={cn('num text-sm', isPeak ? 'font-bold text-ink' : 'text-ink-soft')}>
                <span className="sr-only">{formatJalaliMonth(month)}: </span>
                {total > 0 ? formatCompactToman(total) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
      {peak && (
        <p className="mt-4 rounded-xl bg-canvas px-3 py-2.5 text-sm leading-7 text-ink-soft">
          {allEqual
            ? 'مبلغ پرداختی تو در سه ماه آینده تقریباً یکسانه.'
            : `بیشترین مبلغ پرداختی تو در سه ماه آینده مربوط به ${jalaliMonthName(peak.jm)}ه.`}
        </p>
      )}
    </Card>
  );
}
