'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Info } from 'lucide-react';
import { AmountInput, CountStepper, FrequencyOptions, ProviderPicker, TextField, type ProviderOption } from '@/components/installment-fields';
import { JalaliDatePicker } from '@/components/jalali-date-picker';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MAX_CUSTOM_PROVIDER_NAME_LENGTH, MAX_TITLE_LENGTH, type ProviderSlug } from '@/domain/providers';
import type { Frequency } from '@/domain/schedule';
import { MESSAGES } from '@/domain/validation';
import { updateCreditAccountAction } from '@/server/actions/account-actions';
import { formatCount } from '@/lib/format';
import { formatPersianDate, type ISODate } from '@/lib/jalali';
import { COMMON_MESSAGES } from '@/lib/messages';

interface EditState {
  providerSlug: ProviderSlug;
  customProviderName: string;
  title: string;
  amount: number | null;
  count: number | null;
  nextDueDate: ISODate | null;
  frequency: Frequency;
  customDays: number | null;
}

export function EditAccountForm({
  accountId,
  providers,
  initial,
  today,
  paidCount,
}: {
  accountId: string;
  providers: ProviderOption[];
  initial: EditState;
  today: ISODate;
  paidCount: number;
}) {
  const [state, setState] = useState<EditState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hasUnpaid = initial.count !== null && initial.count > 0 && initial.nextDueDate !== null;

  const update = (patch: Partial<EditState>) => {
    setState((s) => ({ ...s, ...patch }));
    setErrors({});
    setFormError(null);
  };

  const scheduleChanged =
    hasUnpaid &&
    (state.amount !== initial.amount ||
      state.count !== initial.count ||
      state.nextDueDate !== initial.nextDueDate ||
      state.frequency !== initial.frequency ||
      (state.frequency === 'custom' && state.customDays !== initial.customDays));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (state.providerSlug === 'other' && !state.customProviderName.trim()) e.customProviderName = MESSAGES.customNameRequired;
    if (scheduleChanged) {
      if (!state.amount || state.amount < 1000) e.amount = state.amount ? MESSAGES.amountTooSmall : MESSAGES.amountRequired;
      if (!state.count || state.count < 1) e.count = MESSAGES.countInvalid;
      if (!state.nextDueDate) e.nextDueDate = MESSAGES.dateInvalid;
      if (state.frequency === 'custom' && !state.customDays) e.customDays = MESSAGES.customDaysInvalid;
    }
    return e;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      setFormError('لطفاً موارد مشخص‌شده رو بررسی کن.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await updateCreditAccountAction(accountId, {
          providerSlug: state.providerSlug,
          customProviderName: state.customProviderName.trim() || null,
          title: state.title.trim() || null,
          schedule: scheduleChanged
            ? {
                installmentAmount: state.amount,
                remainingInstallments: state.count,
                nextDueDate: state.nextDueDate,
                frequency: state.frequency,
                customFrequencyDays: state.frequency === 'custom' ? state.customDays : null,
              }
            : null,
        });
        if (result && !result.ok) setFormError(result.message);
      } catch {
        setFormError(COMMON_MESSAGES.network);
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5 pb-28">
      <Card className="space-y-5 p-4">
        <div>
          <p className="mb-3 text-sm font-semibold text-ink-soft">این قسط برای کجاست؟</p>
          <ProviderPicker providers={providers} value={state.providerSlug} onSelect={(slug) => update({ providerSlug: slug })} />
        </div>
        {(state.providerSlug === 'bank' || state.providerSlug === 'other') && (
          <TextField
            id="custom-name"
            label={state.providerSlug === 'bank' ? 'اسم بانک (اختیاری)' : 'اسم مجموعه'}
            value={state.customProviderName}
            maxLength={MAX_CUSTOM_PROVIDER_NAME_LENGTH}
            onChange={(v) => update({ customProviderName: v })}
            error={errors.customProviderName}
          />
        )}
        <TextField
          id="title"
          label="عنوان (اختیاری)"
          placeholder="مثلاً خرید لپ‌تاپ"
          value={state.title}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(v) => update({ title: v })}
        />
      </Card>

      {hasUnpaid ? (
        <Card className="space-y-5 p-4">
          <div>
            <h2 className="font-bold">برنامه قسط‌های باقی‌مانده</h2>
            <p className="mt-2 flex items-start gap-2 rounded-xl bg-canvas px-3 py-2.5 text-xs leading-6 text-ink-soft">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              فقط قسط‌های پرداخت‌نشده دوباره ساخته می‌شن.
              {paidCount > 0 && ` ${formatCount(paidCount)} قسط پرداخت‌شده بدون تغییر می‌مونه.`}
            </p>
          </div>
          <AmountInput id="amount" label="مبلغ هر قسط" value={state.amount} onChange={(v) => update({ amount: v })} error={errors.amount} />
          <div>
            <p className="mb-3 text-sm font-semibold text-ink-soft">تعداد قسط‌های باقی‌مانده</p>
            <CountStepper id="count" label="تعداد قسط‌های باقی‌مانده" value={state.count} onChange={(v) => update({ count: v })} error={errors.count} />
          </div>
          <div>
            <p id="next-date-label" className="mb-3 text-sm font-semibold text-ink-soft">
              تاریخ قسط بعدی:{' '}
              <span className="num text-ink">{state.nextDueDate ? formatPersianDate(state.nextDueDate) : '—'}</span>
            </p>
            <JalaliDatePicker value={state.nextDueDate} onChange={(v) => update({ nextDueDate: v })} today={today} labelledBy="next-date-label" />
            {errors.nextDueDate && (
              <p role="alert" className="mt-2 text-sm text-danger-700">
                {errors.nextDueDate}
              </p>
            )}
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-ink-soft">دوره پرداخت</p>
            <FrequencyOptions
              value={state.frequency}
              onChange={(f) => update({ frequency: f })}
              customDays={state.customDays}
              onCustomDaysChange={(v) => update({ customDays: v })}
              error={errors.customDays}
            />
          </div>
        </Card>
      ) : (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm leading-7 text-muted shadow-[var(--shadow-card)]">
          همه قسط‌های این مورد پرداخت شده؛ فقط اسم و عنوان قابل ویرایشه.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-4 pt-6 pb-4 safe-bottom">
        {formError && (
          <p role="alert" className="mb-2 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
            {formError}
          </p>
        )}
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <Button type="submit" loading={pending}>
            ذخیره تغییرات
          </Button>
          <Link href={`/installments/${accountId}`} className={buttonClasses({ variant: 'secondary' })}>
            انصراف
          </Link>
        </div>
      </div>
    </form>
  );
}
