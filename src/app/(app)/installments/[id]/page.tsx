import { notFound } from 'next/navigation';
import { Bell, CircleCheck, CircleCheckBig, Pencil, Plus } from 'lucide-react';
import { PayButton, UndoPaymentButton } from '@/components/payment-flow';
import { TrackEvent } from '@/components/tracking';
import { ButtonLink } from '@/components/ui/button';
import { Card, SectionTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProviderAvatar } from '@/components/ui/provider-avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { FREQUENCY_LABELS } from '@/domain/schedule';
import { deriveInstallmentStatus } from '@/domain/status';
import { formatCount, formatDueRelative } from '@/lib/format';
import { isUuid } from '@/lib/ids';
import { diffDays, formatPersianDate } from '@/lib/jalali';
import { cn } from '@/lib/cn';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { getActivationStatus, getCreditAccountDetail } from '@/server/services/credit-account-service';
import { DeleteAccountButton } from './delete-account-button';

export const metadata = { title: 'جزئیات قسط' };

export default async function CreditAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const user = await requireOnboardedUser();
  const [{ id }, { created, updated }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();

  const today = appToday();
  // Scoped by the session user: another user's id simply returns null → 404.
  const detail = await getCreditAccountDetail(user.id, id, today);
  if (!detail) notFound();

  const { account, installments } = detail;
  const { progress } = account;
  const completed = account.status === 'completed';
  const activation = created === '1' ? await getActivationStatus(user.id) : null;

  return (
    <>
      <TrackEvent name="credit_account_opened" />
      <PageHeader title={account.displayName} subtitle={account.title ?? undefined} backHref="/installments" backLabel="بازگشت به قسط‌ها" />

      {activation && (
        <Card className="mb-4 border border-paid-600/20 bg-paid-50 p-4" role="status">
          <p className="flex items-center gap-2 font-bold text-paid-600">
            <CircleCheck className="size-5" aria-hidden />
            قسط ثبت شد و برنامه پرداختش ساخته شد.
          </p>
          <p className="mt-2 text-sm leading-7 text-ink-soft">
            {activation.accountCount === 1
              ? 'قسط یا وام دیگه‌ای هم داری؟ اضافه‌اش کن تا همه پرداخت‌هات یک‌جا دیده بشن.'
              : `حالا ${formatCount(activation.accountCount)} قسط در پی‌نو داری. همه پرداخت‌هات یک‌جاست.`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ButtonLink href="/installments/new" size="md">
              <Plus className="size-4" aria-hidden />
              افزودن قسط دیگه
            </ButtonLink>
            <ButtonLink href="/" size="md" variant="secondary">
              رفتن به خانه
            </ButtonLink>
          </div>
        </Card>
      )}
      {updated === '1' && (
        <p role="status" className="mb-4 rounded-xl bg-paid-50 px-4 py-3 text-sm font-semibold text-paid-600">
          تغییرات ذخیره شد.
        </p>
      )}

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <ProviderAvatar slug={account.providerSlug} name={account.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{account.displayName}</p>
            {account.title && <p className="truncate text-sm text-muted">{account.title}</p>}
          </div>
          {completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-paid-50 px-2.5 py-1 text-xs font-semibold text-paid-600">
              <CircleCheckBig className="size-3.5" aria-hidden />
              تسویه‌شده
            </span>
          )}
        </div>

        <div className="mt-5">
          <p className="text-sm text-muted">بدهی باقی‌مانده</p>
          <Money amount={progress.remainingDebt} className="mt-1 block text-3xl font-extrabold" />
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-canvas px-2 py-3">
            <dt className="text-xs text-muted">مبلغ هر قسط</dt>
            <dd className="mt-1 text-sm font-bold">
              <Money amount={account.installmentAmount} wrap />
            </dd>
          </div>
          <div className="rounded-2xl bg-canvas px-2 py-3">
            <dt className="text-xs text-muted">قسط باقی‌مانده</dt>
            <dd className="num mt-1 text-sm font-bold">{formatCount(progress.unpaidCount)}</dd>
          </div>
          <div className="rounded-2xl bg-canvas px-2 py-3">
            <dt className="text-xs text-muted">قسط بعدی</dt>
            <dd className="num mt-1 text-sm font-bold">
              {progress.nextDue ? formatPersianDate(progress.nextDue, { year: 'auto', today }) : '—'}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">
              {formatCount(progress.paidCount)} از {formatCount(progress.totalCount)} قسط پرداخت شده
            </span>
            <span className="text-muted">
              {account.frequency === 'custom' && account.customFrequencyDays
                ? `هر ${formatCount(account.customFrequencyDays)} روز`
                : FREQUENCY_LABELS[account.frequency]}
            </span>
          </div>
          <ProgressBar percent={progress.progressPercent} tone={completed ? 'paid' : 'brand'} label="پیشرفت پرداخت" />
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <ButtonLink href={`/installments/${account.id}/edit`} variant="secondary" size="md">
          <Pencil className="size-4" aria-hidden />
          ویرایش
        </ButtonLink>
        <ButtonLink href={`/installments/${account.id}/reminders`} variant="secondary" size="md">
          <Bell className="size-4" aria-hidden />
          تنظیم یادآوری
        </ButtonLink>
      </div>

      <section className="mt-6" aria-labelledby="schedule-title">
        <SectionTitle id="schedule-title" title="برنامه پرداخت" />
        <Card>
          <ol className="divide-y divide-line-soft">
            {installments.map((inst) => {
              const status = deriveInstallmentStatus(inst, today);
              const days = diffDays(inst.dueDate, today);
              return (
                <li key={inst.id} className={cn('flex items-center gap-3 px-4 py-3.5', status === 'overdue' && 'bg-late-50/60')}>
                  <div className="min-w-0 flex-1">
                    <p className="num font-semibold">{formatPersianDate(inst.dueDate, { year: 'auto', today })}</p>
                    <p className="mt-0.5 text-sm">
                      <Money amount={inst.amount} className={cn(status === 'paid' ? 'text-muted' : 'text-ink-soft')} />
                    </p>
                    {status === 'overdue' && <p className="mt-0.5 text-xs text-late-700">{formatDueRelative(days)}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={status} />
                    {status === 'paid' ? (
                      <UndoPaymentButton installmentId={inst.id} />
                    ) : (
                      <PayButton
                        target={{
                          installmentId: inst.id,
                          providerSlug: account.providerSlug,
                          displayName: account.displayName,
                          amount: inst.amount,
                          dueDate: inst.dueDate,
                        }}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      </section>

      <div className="mt-6">
        <DeleteAccountButton accountId={account.id} name={account.title ? `${account.displayName} · ${account.title}` : account.displayName} />
      </div>
    </>
  );
}
