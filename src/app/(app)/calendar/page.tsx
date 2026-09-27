import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { MonthSummaryCard } from '@/components/month-summary-card';
import { PaymentRow } from '@/components/payment-row';
import { PressureCard } from '@/components/pressure-card';
import { TrackEvent } from '@/components/tracking';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { deriveInstallmentStatus } from '@/domain/status';
import { toPersianDigits } from '@/lib/format';
import {
  addJalaliMonths,
  compareJalaliMonths,
  formatJalaliMonth,
  formatPersianDate,
  fromJalali,
  getCurrentJalaliMonth,
  jalaliMonthKey,
  jalaliMonthLength,
  parseJalaliMonthKey,
  toJalali,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  weekdayIndex,
  type ISODate,
} from '@/lib/jalali';
import { cn } from '@/lib/cn';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { getCalendarData, type PaymentItem } from '@/server/services/dashboard-service';

export const metadata = { title: 'تقویم' };

function groupByDate(items: PaymentItem[]): Array<[ISODate, PaymentItem[]]> {
  const map = new Map<ISODate, PaymentItem[]>();
  for (const item of items) {
    const list = map.get(item.dueDate) ?? [];
    list.push(item);
    map.set(item.dueDate, list);
  }
  return [...map.entries()];
}

function MonthGrid({ items, month, today }: { items: PaymentItem[]; month: { jy: number; jm: number }; today: ISODate }) {
  const length = jalaliMonthLength(month.jy, month.jm);
  const offset = weekdayIndex(fromJalali(month.jy, month.jm, 1));
  const byDay = new Map<number, PaymentItem[]>();
  for (const item of items) {
    const { jd } = toJalali(item.dueDate);
    byDay.set(jd, [...(byDay.get(jd) ?? []), item]);
  }

  return (
    <Card className="p-4">
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_SHORT_NAMES.map((d, i) => (
          <span key={d} className="pb-1 text-xs font-semibold text-muted" title={WEEKDAY_NAMES[i]} aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {Array.from({ length }, (_, i) => i + 1).map((day) => {
          const iso = fromJalali(month.jy, month.jm, day);
          const dayItems = byDay.get(day) ?? [];
          const statuses = dayItems.map((it) => deriveInstallmentStatus(it, today));
          const hasOverdue = statuses.includes('overdue');
          const allPaid = dayItems.length > 0 && statuses.every((s) => s === 'paid');
          const isToday = iso === today;
          const cell = (
            <>
              <span className="num">{toPersianDigits(day)}</span>
              {dayItems.length > 0 && (
                <span
                  aria-hidden
                  className={cn('mt-0.5 size-1.5 rounded-full', hasOverdue ? 'bg-late-700' : allPaid ? 'bg-paid-600' : 'bg-brand-600')}
                />
              )}
            </>
          );
          const className = cn(
            'flex h-11 flex-col items-center justify-center rounded-xl text-sm',
            isToday && 'font-bold ring-2 ring-brand-500 ring-inset',
            dayItems.length > 0 ? 'bg-brand-50/70 font-semibold text-ink' : 'text-ink-soft',
          );
          return dayItems.length > 0 ? (
            <a
              key={day}
              href={`#day-${iso}`}
              className={className}
              aria-label={`${formatPersianDate(iso, { weekday: true })}: ${toPersianDigits(dayItems.length)} پرداخت`}
            >
              {cell}
            </a>
          ) : (
            <span key={day} className={className} aria-hidden={!isToday}>
              {cell}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-600" aria-hidden /> در انتظار
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-paid-600" aria-hidden /> پرداخت شده
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-late-700" aria-hidden /> عقب‌افتاده
        </span>
      </div>
    </Card>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireOnboardedUser();
  const today = appToday();
  const { m } = await searchParams;
  const current = getCurrentJalaliMonth(today);
  const month = parseJalaliMonthKey(m) ?? current;
  const data = await getCalendarData(user.id, month, today);
  const prev = addJalaliMonths(month, -1);
  const next = addJalaliMonths(month, 1);
  const isCurrent = compareJalaliMonths(month, current) === 0;

  return (
    <>
      <TrackEvent name="calendar_opened" />
      <PageHeader title="تقویم" />

      <nav aria-label="انتخاب ماه" className="mb-4 flex items-center justify-between rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-card)]">
        <Link
          href={`/calendar?m=${jalaliMonthKey(prev)}`}
          className="flex size-11 items-center justify-center rounded-xl hover:bg-canvas"
          aria-label={`ماه قبل: ${formatJalaliMonth(prev)}`}
        >
          <ChevronRight className="size-5" aria-hidden />
        </Link>
        <div className="text-center">
          <p className="font-bold">{formatJalaliMonth(month)}</p>
          {!isCurrent && (
            <Link href="/calendar" className="text-xs font-semibold text-brand-700">
              برگشت به ماه جاری
            </Link>
          )}
        </div>
        <Link
          href={`/calendar?m=${jalaliMonthKey(next)}`}
          className="flex size-11 items-center justify-center rounded-xl hover:bg-canvas"
          aria-label={`ماه بعد: ${formatJalaliMonth(next)}`}
        >
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      </nav>

      {!data.hasAccounts ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-8" aria-hidden />}
            title="هنوز قسطی ثبت نکردی"
            description="بعد از افزودن اولین قسط، برنامه پرداخت‌هات اینجا ماه به ماه نمایش داده می‌شه."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <MonthSummaryCard
            summary={data.summary}
            title={isCurrent ? 'تعهدات این ماه' : 'تعهدات ماه'}
            emptyText="در این ماه پرداختی نداری."
          />
          <MonthGrid items={data.items} month={month} today={today} />

          {data.items.length > 0 && (
            <section aria-labelledby="month-payments-title" className="space-y-3">
              <h2 id="month-payments-title" className="px-1 text-base font-bold">
                پرداخت‌های {formatJalaliMonth(month, false)}
              </h2>
              {groupByDate(data.items).map(([date, items]) => (
                <div key={date} id={`day-${date}`} className="scroll-mt-4">
                  <p className={cn('mb-2 px-1 text-sm font-semibold', date === today ? 'text-brand-700' : 'text-muted')}>
                    <span className="num">{formatPersianDate(date, { weekday: true, year: 'never' })}</span>
                    {date === today && ' · امروز'}
                  </p>
                  <Card>
                    <ul className="divide-y divide-line-soft">
                      {items.map((item) => (
                        <PaymentRow key={item.id} item={item} today={today} showDate={false} showStatus allowUndo />
                      ))}
                    </ul>
                  </Card>
                </div>
              ))}
            </section>
          )}

          <PressureCard pressure={data.pressure} />
        </div>
      )}
    </>
  );
}
