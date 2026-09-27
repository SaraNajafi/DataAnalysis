'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toPersianDigits } from '@/lib/format';
import {
  addJalaliMonths,
  formatJalaliMonth,
  formatPersianDate,
  fromJalali,
  getCurrentJalaliMonth,
  jalaliMonthLength,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  weekdayIndex,
  type ISODate,
  type JalaliMonth,
} from '@/lib/jalali';
import { cn } from '@/lib/cn';

/** Month-grid date picker in the Jalali calendar (Saturday-first weeks). Emits ISO Gregorian dates. */
export function JalaliDatePicker({
  value,
  onChange,
  today,
  labelledBy,
}: {
  value: ISODate | null;
  onChange: (value: ISODate) => void;
  today: ISODate;
  labelledBy?: string;
}) {
  const [view, setView] = useState<JalaliMonth>(() => getCurrentJalaliMonth(value ?? today));
  const length = jalaliMonthLength(view.jy, view.jm);
  const offset = weekdayIndex(fromJalali(view.jy, view.jm, 1));
  const days = Array.from({ length }, (_, i) => i + 1);

  return (
    <div className="rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]" role="group" aria-labelledby={labelledBy}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView((v) => addJalaliMonths(v, -1))}
          className="flex size-10 items-center justify-center rounded-full hover:bg-canvas"
          aria-label="ماه قبل"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
        <p className="font-bold" aria-live="polite">
          {formatJalaliMonth(view)}
        </p>
        <button
          type="button"
          onClick={() => setView((v) => addJalaliMonths(v, 1))}
          className="flex size-10 items-center justify-center rounded-full hover:bg-canvas"
          aria-label="ماه بعد"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_SHORT_NAMES.map((d, i) => (
          <span key={d} className="pb-1 text-xs font-semibold text-muted" title={WEEKDAY_NAMES[i]} aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden />
        ))}
        {days.map((day) => {
          const iso = fromJalali(view.jy, view.jm, day);
          const selected = iso === value;
          const isToday = iso === today;
          const isPast = iso < today;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(iso)}
              aria-pressed={selected}
              aria-label={`${formatPersianDate(iso, { weekday: true })}${isToday ? ' (امروز)' : ''}`}
              className={cn(
                'num flex h-10 items-center justify-center rounded-xl text-[15px] transition-colors',
                selected
                  ? 'bg-brand-600 font-bold text-white'
                  : isToday
                    ? 'font-bold text-brand-700 ring-2 ring-brand-500 ring-inset'
                    : isPast
                      ? 'text-muted hover:bg-canvas'
                      : 'text-ink hover:bg-brand-50',
              )}
            >
              {toPersianDigits(day)}
            </button>
          );
        })}
      </div>
      {getCurrentJalaliMonth(today).jm !== view.jm || getCurrentJalaliMonth(today).jy !== view.jy ? (
        <button
          type="button"
          onClick={() => setView(getCurrentJalaliMonth(today))}
          className="mt-3 w-full text-center text-sm font-semibold text-brand-700"
        >
          برگشت به ماه جاری
        </button>
      ) : null}
    </div>
  );
}
