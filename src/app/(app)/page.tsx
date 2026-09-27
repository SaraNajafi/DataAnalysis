import Link from 'next/link';
import { Bell, CalendarClock, ChevronLeft, CircleAlert, Plus, Wallet } from 'lucide-react';
import { MonthSummaryCard } from '@/components/month-summary-card';
import { PayButton } from '@/components/payment-flow';
import { PaymentRow } from '@/components/payment-row';
import { PressureCard } from '@/components/pressure-card';
import { TrackEvent } from '@/components/tracking';
import { ButtonLink } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { ProviderAvatar } from '@/components/ui/provider-avatar';
import { reminderLeadText } from '@/domain/reminders';
import { BRAND_NAME } from '@/lib/brand';
import { formatCount, formatDueRelative, formatToman } from '@/lib/format';
import { diffDays, formatPersianDate, type ISODate } from '@/lib/jalali';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { getHomeData, type HomeData, type PaymentItem } from '@/server/services/dashboard-service';

export const metadata = { title: 'خانه' };

function Greeting() {
  return (
    <header className="mb-5 flex items-center justify-between pt-2">
      <div>
        <h1 className="text-2xl font-extrabold">سلام 👋</h1>
        <p className="mt-1 text-sm text-muted">این وضعیت پرداخت‌های توئه</p>
      </div>
      <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-extrabold text-brand-700 shadow-[var(--shadow-card)]">
        {BRAND_NAME}
      </span>
    </header>
  );
}

function payTarget(item: PaymentItem) {
  return {
    installmentId: item.id,
    providerSlug: item.providerSlug,
    displayName: item.displayName,
    amount: item.amount,
    dueDate: item.dueDate,
  };
}

function Reminders({ data }: { data: HomeData }) {
  if (data.reminders.length === 0) return null;
  return (
    <section aria-label="یادآوری‌ها" className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3">
      <ul className="space-y-1.5">
        {data.reminders.slice(0, 3).map(({ item, daysUntilDue }) => (
          <li key={item.id} className="flex items-start gap-2 text-sm leading-6 text-brand-800">
            <Bell className="mt-1 size-4 shrink-0" aria-hidden />
            <span>
              <strong>{reminderLeadText(daysUntilDue)}</strong> سررسید قسط {item.displayName}
              <span className="num whitespace-nowrap"> · {formatToman(item.amount)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverdueSection({ data, today }: { data: HomeData; today: ISODate }) {
  const { overdue } = data;
  if (overdue.count === 0) return null;
  return (
    <section aria-labelledby="overdue-title" className="rounded-[var(--radius-card)] border border-late-300 bg-late-50">
      <TrackEvent name="overdue_installment_seen" properties={{ count: overdue.count }} />
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-late-100 text-late-700">
          <CircleAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="overdue-title" className="font-bold text-ink">
            پرداخت‌های عقب‌افتاده
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {formatCount(overdue.count)} پرداخت · <span className="num">{formatToman(overdue.amount)}</span>
          </p>
        </div>
      </div>
      <ul className="mt-2 divide-y divide-late-100">
        {overdue.items.slice(0, 5).map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/installments/${item.creditAccountId}`} className="flex min-w-0 flex-1 items-center gap-3">
              <ProviderAvatar slug={item.providerSlug} name={item.displayName} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{item.displayName}</span>
                <span className="block text-sm">
                  <Money amount={item.amount} className="font-bold" />
                </span>
                <span className="block text-xs text-late-700">{formatDueRelative(diffDays(item.dueDate, today))}</span>
              </span>
            </Link>
            <PayButton target={payTarget(item)} variant="secondary" />
          </li>
        ))}
      </ul>
      {overdue.count > 5 && (
        <Link href="/calendar" className="block px-4 pb-3 text-sm font-semibold text-late-700">
          و {formatCount(overdue.count - 5)} پرداخت دیگه
        </Link>
      )}
      <p className="px-4 pb-4 text-xs leading-6 text-ink-soft">اگه پرداختشون کردی، ثبتشون کن تا برنامه‌ات دقیق بمونه.</p>
    </section>
  );
}

function NextSevenDays({ data }: { data: HomeData }) {
  const { next7Days } = data;
  return (
    <Card className="flex items-center gap-4 p-4" role="region" aria-labelledby="next7-title">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <CalendarClock className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="next7-title" className="text-sm font-semibold text-muted">
          ۷ روز آینده
        </h2>
        {next7Days.count === 0 ? (
          <p className="mt-1 font-semibold">تا ۷ روز آینده پرداختی نداری 🎉</p>
        ) : (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <Money amount={next7Days.amount} className="text-xl font-extrabold" />
            <span className="text-sm text-muted">{formatCount(next7Days.count)} پرداخت</span>
          </p>
        )}
      </div>
    </Card>
  );
}

function NextPayment({ data, today }: { data: HomeData; today: ISODate }) {
  const next = data.nextPayment;
  if (!next) return null;
  const days = diffDays(next.dueDate, today);
  return (
    <section aria-labelledby="next-payment-title">
      <SectionTitle id="next-payment-title" title="پرداخت بعدی" />
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <ProviderAvatar slug={next.providerSlug} name={next.displayName} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{next.displayName}</p>
            {next.accountTitle && <p className="truncate text-sm text-muted">{next.accountTitle}</p>}
          </div>
          <span
            className={
              days === 0
                ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white'
                : 'rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700'
            }
          >
            {formatDueRelative(days)}
          </span>
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <Money amount={next.amount} className="text-2xl font-extrabold" />
          <span className="num text-sm text-ink-soft">{formatPersianDate(next.dueDate, { year: 'auto', today })}</span>
        </div>
        {data.sameDayCount > 0 && (
          <p className="mt-2 text-xs text-muted">+ {formatCount(data.sameDayCount)} پرداخت دیگه در همین روز</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PayButton target={payTarget(next)} size="md" variant="primary" />
          <ButtonLink href={`/installments/${next.creditAccountId}`} size="md" variant="secondary">
            مشاهده جزئیات
          </ButtonLink>
        </div>
      </Card>
    </section>
  );
}

function Upcoming({ data, today }: { data: HomeData; today: ISODate }) {
  const list = data.upcoming.filter((i) => i.id !== data.nextPayment?.id).slice(0, 4);
  if (list.length === 0) return null;
  return (
    <section aria-labelledby="upcoming-title">
      <SectionTitle
        id="upcoming-title"
        title="پرداخت‌های پیش رو"
        action={
          <Link href="/calendar" className="flex items-center gap-0.5 text-sm font-semibold text-brand-700">
            مشاهده همه
            <ChevronLeft className="size-4" aria-hidden />
          </Link>
        }
      />
      <Card>
        <ul className="divide-y divide-line-soft">
          {list.map((item) => (
            <PaymentRow key={item.id} item={item} today={today} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function ActiveDebt({ data }: { data: HomeData }) {
  if (data.totalActiveDebt === 0) return null;
  return (
    <Link href="/installments" className="block">
      <Card className="flex items-center gap-4 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-canvas text-ink-soft">
          <Wallet className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-muted">کل بدهی باقی‌مانده</h2>
          <Money amount={data.totalActiveDebt} className="mt-1 block text-lg font-extrabold" />
        </div>
        <ChevronLeft className="size-5 text-muted" aria-hidden />
      </Card>
    </Link>
  );
}

export default async function HomePage() {
  const user = await requireOnboardedUser();
  const today = appToday();
  const data = await getHomeData(user.id, today);

  if (!data.hasAccounts) {
    return (
      <>
        <Greeting />
        <Card className="mt-6">
          <EmptyState
            icon={<Plus className="size-8" aria-hidden />}
            title="هنوز قسطی ثبت نکردی"
            description="اولین وام یا خرید اقساطی‌ات رو اضافه کن تا پی‌نو برنامه پرداختت رو بسازه."
            action={
              <ButtonLink href="/installments/new" block>
                <Plus className="size-5" aria-hidden />
                افزودن قسط
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-5">
      <Greeting />
      <Reminders data={data} />
      <MonthSummaryCard summary={data.currentMonth} title="پرداخت‌های این ماه" />
      <OverdueSection data={data} today={today} />
      <NextSevenDays data={data} />
      <NextPayment data={data} today={today} />
      <Upcoming data={data} today={today} />
      <PressureCard pressure={data.pressure} />
      <ActiveDebt data={data} />
    </div>
  );
}
