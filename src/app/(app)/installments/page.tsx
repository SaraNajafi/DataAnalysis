import Link from 'next/link';
import { CircleAlert, CircleCheckBig, Layers, Plus } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProviderAvatar } from '@/components/ui/provider-avatar';
import { formatCount } from '@/lib/format';
import { formatPersianDate, type ISODate } from '@/lib/jalali';
import { cn } from '@/lib/cn';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { listCreditAccounts, type CreditAccountView } from '@/server/services/credit-account-service';

export const metadata = { title: 'قسط‌های من' };

function AccountCard({ account, today }: { account: CreditAccountView; today: ISODate }) {
  const { progress } = account;
  const completed = account.status === 'completed';
  return (
    <li>
      <Link href={`/installments/${account.id}`} className="block">
        <Card className="p-4 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <ProviderAvatar slug={account.providerSlug} name={account.displayName} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{account.displayName}</p>
              {account.title && <p className="truncate text-sm text-muted">{account.title}</p>}
            </div>
            {completed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-paid-50 px-2.5 py-1 text-xs font-semibold text-paid-600">
                <CircleCheckBig className="size-3.5" aria-hidden />
                تسویه‌شده
              </span>
            ) : (
              <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-ink-soft">
                {formatCount(progress.unpaidCount)} قسط باقی‌مانده
              </span>
            )}
          </div>

          {!completed && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">بدهی باقی‌مانده</dt>
                <dd className="mt-1 font-bold">
                  <Money amount={progress.remainingDebt} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">قسط بعدی</dt>
                <dd className="num mt-1 font-bold">
                  {progress.nextDue ? formatPersianDate(progress.nextDue, { year: 'auto', today }) : '—'}
                </dd>
              </div>
            </dl>
          )}

          <div className="mt-4 flex items-center gap-3">
            <ProgressBar
              percent={progress.progressPercent}
              tone={completed ? 'paid' : 'brand'}
              label={`${formatCount(progress.paidCount)} از ${formatCount(progress.totalCount)} قسط پرداخت شده`}
            />
            <span className="num shrink-0 text-xs text-muted">
              {formatCount(progress.paidCount)} از {formatCount(progress.totalCount)}
            </span>
          </div>

          {progress.overdueCount > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-late-50 px-2.5 py-1 text-xs font-semibold text-late-700">
              <CircleAlert className="size-3.5" aria-hidden />
              {formatCount(progress.overdueCount)} قسط عقب‌افتاده
            </p>
          )}
        </Card>
      </Link>
    </li>
  );
}

export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; deleted?: string }> }) {
  const user = await requireOnboardedUser();
  const today = appToday();
  const [{ tab, deleted }, data] = await Promise.all([searchParams, listCreditAccounts(user.id, today)]);
  const showCompleted = tab === 'completed';
  const list = showCompleted ? data.completed : data.active;

  const tabs = [
    { key: 'active', label: 'فعال', count: data.active.length, href: '/installments' },
    { key: 'completed', label: 'تسویه‌شده', count: data.completed.length, href: '/installments?tab=completed' },
  ];

  return (
    <>
      <PageHeader
        title="قسط‌های من"
        action={
          <ButtonLink href="/installments/new" size="sm" variant="soft" aria-label="افزودن قسط">
            <Plus className="size-4" aria-hidden />
            افزودن
          </ButtonLink>
        }
      />

      {deleted === '1' && (
        <p role="status" className="mb-4 rounded-xl bg-surface px-4 py-3 text-sm text-ink-soft shadow-[var(--shadow-card)]">
          قسط حذف شد.
        </p>
      )}

      {data.active.length > 0 && (
        <Card className="mb-5 p-4">
          <p className="text-sm text-muted">مجموع بدهی باقی‌مانده</p>
          <Money amount={data.totalActiveDebt} className="mt-1 block text-2xl font-extrabold" />
          <p className="mt-1 text-sm text-muted">در {formatCount(data.active.length)} قسط فعال</p>
        </Card>
      )}

      <nav aria-label="وضعیت قسط‌ها" className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-line-soft p-1">
        {tabs.map((t) => {
          const active = (t.key === 'completed') === showCompleted;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors',
                active ? 'bg-surface text-ink shadow-sm' : 'text-muted',
              )}
            >
              {t.label}
              <span className="num text-xs text-muted">({formatCount(t.count)})</span>
            </Link>
          );
        })}
      </nav>

      {list.length === 0 ? (
        <Card>
          {showCompleted ? (
            <EmptyState
              icon={<CircleCheckBig className="size-8" aria-hidden />}
              title="هنوز قسطی تسویه نشده"
              description="وقتی همه قسط‌های یک خرید یا وام رو پرداخت کنی، اینجا نمایش داده می‌شه."
            />
          ) : (
            <EmptyState
              icon={<Layers className="size-8" aria-hidden />}
              title="قسط فعالی نداری"
              description="اولین وام یا خرید اقساطی‌ات رو اضافه کن تا پی‌نو برنامه پرداختت رو بسازه."
              action={
                <ButtonLink href="/installments/new" block>
                  <Plus className="size-5" aria-hidden />
                  افزودن قسط
                </ButtonLink>
              }
            />
          )}
        </Card>
      ) : (
        <ul className="space-y-3">
          {list.map((account) => (
            <AccountCard key={account.id} account={account} today={today} />
          ))}
        </ul>
      )}
    </>
  );
}
