'use client';

import Link from 'next/link';
import { useId, useMemo, useState, useTransition } from 'react';
import { ChevronRight, CircleAlert, Pencil, X } from 'lucide-react';
import { AmountInput, CountStepper, FrequencyOptions, ProviderPicker, TextField, type ProviderOption } from '@/components/installment-fields';
import { JalaliDatePicker } from '@/components/jalali-date-picker';
import { TrackEvent } from '@/components/tracking';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { ProviderAvatar } from '@/components/ui/provider-avatar';
import { MAX_CUSTOM_PROVIDER_NAME_LENGTH, MAX_TITLE_LENGTH, providerDisplayName, type ProviderSlug } from '@/domain/providers';
import {
  FREQUENCY_LABELS,
  generateDueDates,
  MAX_CUSTOM_FREQUENCY_DAYS,
  MAX_INSTALLMENT_AMOUNT,
  MAX_INSTALLMENT_COUNT,
  MIN_INSTALLMENT_AMOUNT,
  type Frequency,
} from '@/domain/schedule';
import { MESSAGES } from '@/domain/validation';
import { createCreditAccountAction } from '@/server/actions/account-actions';
import { trackClientEventAction } from '@/server/actions/misc-actions';
import { formatCount, formatToman, toPersianDigits } from '@/lib/format';
import { formatPersianDate, type ISODate } from '@/lib/jalali';
import { randomUuid } from '@/lib/ids';
import { COMMON_MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/cn';

const STEPS = ['provider', 'title', 'amount', 'count', 'date', 'frequency', 'review'] as const;
type Step = (typeof STEPS)[number];

const QUESTIONS: Record<Step, string> = {
  provider: 'این قسط برای کجاست؟',
  title: 'این قسط بابت چیه؟',
  amount: 'مبلغ هر قسط چقدره؟',
  count: 'چند قسط باقی مونده؟',
  date: 'قسط بعدی چه تاریخیه؟',
  frequency: 'هر چند وقت یک‌بار پرداخت می‌کنی؟',
  review: 'همه‌چیز درسته؟',
};

const TITLE_SUGGESTIONS = ['خرید موبایل', 'خرید لپ‌تاپ', 'وام', 'لوازم خانگی'];

interface FormState {
  providerSlug: ProviderSlug | null;
  customProviderName: string;
  title: string;
  amount: number | null;
  count: number | null;
  nextDueDate: ISODate | null;
  frequency: Frequency;
  customDays: number | null;
}

function validateStep(step: Step, s: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  switch (step) {
    case 'provider':
      if (!s.providerSlug) errors.providerSlug = MESSAGES.providerRequired;
      if (s.providerSlug === 'other' && !s.customProviderName.trim()) errors.customProviderName = MESSAGES.customNameRequired;
      break;
    case 'amount':
      if (s.amount === null || s.amount <= 0) errors.amount = MESSAGES.amountRequired;
      else if (s.amount < MIN_INSTALLMENT_AMOUNT) errors.amount = MESSAGES.amountTooSmall;
      else if (s.amount > MAX_INSTALLMENT_AMOUNT) errors.amount = MESSAGES.amountTooLarge;
      break;
    case 'count':
      if (s.count === null || s.count < 1 || s.count > MAX_INSTALLMENT_COUNT) errors.count = MESSAGES.countInvalid;
      break;
    case 'date':
      if (!s.nextDueDate) errors.nextDueDate = MESSAGES.dateInvalid;
      break;
    case 'frequency':
      if (s.frequency === 'custom' && (!s.customDays || s.customDays < 1 || s.customDays > MAX_CUSTOM_FREQUENCY_DAYS)) {
        errors.customDays = MESSAGES.customDaysInvalid;
      }
      break;
    default:
      break;
  }
  return errors;
}

const FIELD_STEP: Record<string, Step> = {
  providerSlug: 'provider',
  customProviderName: 'provider',
  title: 'title',
  installmentAmount: 'amount',
  remainingInstallments: 'count',
  nextDueDate: 'date',
  frequency: 'frequency',
  customFrequencyDays: 'frequency',
};

export function AddInstallmentWizard({
  providers,
  today,
  isFirst,
}: {
  providers: ProviderOption[];
  today: ISODate;
  isFirst: boolean;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<FormState>({
    providerSlug: null,
    customProviderName: '',
    title: '',
    amount: null,
    count: null,
    nextDueDate: null,
    frequency: 'monthly',
    customDays: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [clientRequestId] = useState(() => randomUuid());
  const questionId = useId();

  const step = STEPS[stepIndex] ?? 'provider';
  const provider = providers.find((p) => p.slug === state.providerSlug) ?? null;
  const displayName = provider ? providerDisplayName(provider.slug, provider.name, state.customProviderName) : '';

  const update = (patch: Partial<FormState>) => {
    setState((s) => ({ ...s, ...patch }));
    setErrors({});
    setSubmitError(null);
  };

  const goTo = (target: Step) => {
    setErrors({});
    setStepIndex(STEPS.indexOf(target));
  };

  const next = () => {
    const stepErrors = validateStep(step, state);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    setErrors({});
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const back = () => {
    setErrors({});
    setStepIndex((i) => Math.max(0, i - 1));
  };

  const selectProvider = (slug: ProviderSlug) => {
    update({ providerSlug: slug, customProviderName: slug === state.providerSlug ? state.customProviderName : '' });
    trackClientEventAction('provider_selected', { provider: slug }).catch(() => {});
    if (slug !== 'bank' && slug !== 'other') setStepIndex(STEPS.indexOf('title'));
  };

  const schedule = useMemo(() => {
    if (!state.nextDueDate || !state.count) return [];
    if (state.frequency === 'custom' && !state.customDays) return [];
    return generateDueDates({
      firstDueDate: state.nextDueDate,
      count: state.count,
      frequency: state.frequency,
      customFrequencyDays: state.customDays,
    });
  }, [state.nextDueDate, state.count, state.frequency, state.customDays]);

  const submit = () => {
    if (pending) return;
    for (const s of STEPS) {
      const stepErrors = validateStep(s, state);
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors);
        setStepIndex(STEPS.indexOf(s));
        return;
      }
    }
    setSubmitError(null);
    startTransition(async () => {
      try {
        // Redirects to the new account on success; returns only on failure.
        const result = await createCreditAccountAction({
          providerSlug: state.providerSlug,
          customProviderName: state.customProviderName.trim() || null,
          title: state.title.trim() || null,
          installmentAmount: state.amount,
          remainingInstallments: state.count,
          nextDueDate: state.nextDueDate,
          frequency: state.frequency,
          customFrequencyDays: state.frequency === 'custom' ? state.customDays : null,
          clientRequestId,
        });
        if (result && !result.ok) {
          setSubmitError(result.message);
          const firstField = Object.keys(result.fieldErrors ?? {})[0];
          if (firstField && FIELD_STEP[firstField]) {
            setErrors({ [firstField === 'installmentAmount' ? 'amount' : firstField]: result.fieldErrors![firstField]! });
          }
        }
      } catch {
        setSubmitError(COMMON_MESSAGES.network);
      }
    });
  };

  const isPastDate = state.nextDueDate !== null && state.nextDueDate < today;
  const total = state.amount && state.count ? state.amount * state.count : 0;

  return (
    <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
      <TrackEvent name="add_installment_started" properties={{ source: isFirst ? 'onboarding' : 'app' }} />

      <div className="flex items-center gap-2 pt-1">
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={back}
            aria-label="مرحله قبل"
            className="-ms-2 flex size-11 items-center justify-center rounded-full hover:bg-surface"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        ) : (
          <span className="size-11" aria-hidden />
        )}
        <div className="flex-1 text-center">
          <p className="text-sm font-bold">{isFirst ? 'افزودن اولین قسط' : 'افزودن قسط'}</p>
          <p className="num text-xs text-muted">
            مرحله {toPersianDigits(stepIndex + 1)} از {toPersianDigits(STEPS.length)}
          </p>
        </div>
        <Link href="/" aria-label="بستن" className="-me-2 flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <X className="size-6" aria-hidden />
        </Link>
      </div>

      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-line-soft"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={stepIndex + 1}
        aria-label="پیشرفت"
      >
        <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
      </div>

      <h1 id={questionId} className="mt-7 mb-6 text-2xl leading-10 font-extrabold">
        {QUESTIONS[step]}
      </h1>

      <div className="flex-1 pb-32">
        {step === 'provider' && (
          <div className="space-y-5">
            <ProviderPicker providers={providers} value={state.providerSlug} onSelect={selectProvider} />
            {errors.providerSlug && (
              <p role="alert" className="text-sm text-danger-700">
                {errors.providerSlug}
              </p>
            )}
            {state.providerSlug === 'bank' && (
              <TextField
                id="bank-name"
                label="اسم بانک (اختیاری)"
                placeholder="مثلاً ملت"
                value={state.customProviderName}
                maxLength={MAX_CUSTOM_PROVIDER_NAME_LENGTH}
                onChange={(v) => update({ customProviderName: v })}
                autoFocus
              />
            )}
            {state.providerSlug === 'other' && (
              <TextField
                id="org-name"
                label="اسم مجموعه"
                placeholder="مثلاً فروشگاه محله یا وام شخصی"
                value={state.customProviderName}
                maxLength={MAX_CUSTOM_PROVIDER_NAME_LENGTH}
                onChange={(v) => update({ customProviderName: v })}
                error={errors.customProviderName}
                autoFocus
              />
            )}
          </div>
        )}

        {step === 'title' && (
          <div className="space-y-4">
            <TextField
              id="title"
              label="عنوان (اختیاری)"
              placeholder="مثلاً خرید لپ‌تاپ"
              value={state.title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(v) => update({ title: v })}
              autoFocus
            />
            <div className="flex flex-wrap gap-2">
              {TITLE_SUGGESTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update({ title: t })}
                  aria-pressed={state.title === t}
                  className={cn(
                    'h-9 rounded-full border px-3.5 text-sm',
                    state.title === t ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-soft',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'amount' && (
          <AmountInput
            id="amount"
            label="مبلغ هر قسط"
            value={state.amount}
            onChange={(v) => update({ amount: v })}
            error={errors.amount}
            autoFocus
            large
          />
        )}

        {step === 'count' && (
          <CountStepper
            id="count"
            label="تعداد قسط‌های باقی‌مانده"
            value={state.count}
            onChange={(v) => update({ count: v })}
            error={errors.count}
          />
        )}

        {step === 'date' && (
          <div className="space-y-4">
            <JalaliDatePicker
              value={state.nextDueDate}
              onChange={(v) => update({ nextDueDate: v })}
              today={today}
              labelledBy={questionId}
            />
            {state.nextDueDate && (
              <p className="text-center text-sm text-ink-soft" aria-live="polite">
                قسط بعدی: <strong className="num text-ink">{formatPersianDate(state.nextDueDate, { weekday: true })}</strong>
              </p>
            )}
            {isPastDate && (
              <p className="flex items-start gap-2 rounded-xl bg-late-50 px-3 py-2.5 text-sm leading-6 text-late-700">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                این تاریخ گذشته. اگه این قسط رو هنوز پرداخت نکردی، به‌عنوان «عقب‌افتاده» نمایش داده می‌شه.
              </p>
            )}
            {errors.nextDueDate && (
              <p role="alert" className="text-center text-sm text-danger-700">
                {errors.nextDueDate}
              </p>
            )}
          </div>
        )}

        {step === 'frequency' && (
          <FrequencyOptions
            value={state.frequency}
            onChange={(f) => update({ frequency: f })}
            customDays={state.customDays}
            onCustomDaysChange={(v) => update({ customDays: v })}
            error={errors.customDays}
          />
        )}

        {step === 'review' && provider && state.amount && state.count && state.nextDueDate && (
          <div className="space-y-4">
            <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-3">
                <ProviderAvatar slug={provider.slug} name={displayName} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{displayName}</p>
                  {state.title.trim() && <p className="truncate text-sm text-muted">{state.title.trim()}</p>}
                </div>
                <button type="button" onClick={() => goTo('provider')} className="text-sm font-semibold text-brand-700" aria-label="ویرایش ارائه‌دهنده و عنوان">
                  <Pencil className="size-4" aria-hidden />
                </button>
              </div>
              <dl className="mt-5 divide-y divide-line-soft text-[15px]">
                <ReviewRow label="قسط‌های باقی‌مانده" onEdit={() => goTo('count')}>
                  {formatCount(state.count)} قسط
                </ReviewRow>
                <ReviewRow label="هر قسط" onEdit={() => goTo('amount')}>
                  <Money amount={state.amount} />
                </ReviewRow>
                <ReviewRow label="قسط بعدی" onEdit={() => goTo('date')}>
                  <span className="num">{formatPersianDate(state.nextDueDate)}</span>
                </ReviewRow>
                <ReviewRow label="دوره پرداخت" onEdit={() => goTo('frequency')}>
                  {state.frequency === 'custom' && state.customDays
                    ? `هر ${formatCount(state.customDays)} روز`
                    : FREQUENCY_LABELS[state.frequency]}
                </ReviewRow>
              </dl>
              <div className="mt-4 rounded-2xl bg-brand-50 p-4">
                <p className="text-sm text-brand-800">کل بدهی باقی‌مانده</p>
                <Money amount={total} className="mt-1 block text-2xl font-extrabold text-brand-800" />
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
              <h2 className="mb-3 text-sm font-bold text-ink-soft">برنامه پرداخت</h2>
              <ol className="space-y-2">
                {schedule.slice(0, 4).map((d, i) => (
                  <li key={d} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="num flex size-6 items-center justify-center rounded-full bg-canvas text-xs text-muted">
                        {toPersianDigits(i + 1)}
                      </span>
                      <span className="num">{formatPersianDate(d, { year: 'auto', today })}</span>
                    </span>
                    <span className="num text-ink-soft">{formatToman(state.amount!)}</span>
                  </li>
                ))}
              </ol>
              {schedule.length > 4 && (
                <p className="mt-3 text-sm text-muted">
                  و {formatCount(schedule.length - 4)} قسط دیگه تا{' '}
                  <span className="num">{formatPersianDate(schedule[schedule.length - 1]!)}</span>
                </p>
              )}
            </div>

            {submitError && (
              <p role="alert" className="rounded-xl bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-4 pt-6 pb-4 safe-bottom">
        {step === 'review' ? (
          <div className="grid gap-2">
            <Button block onClick={submit} loading={pending}>
              ثبت قسط
            </Button>
            <Button block variant="ghost" onClick={() => goTo('provider')} disabled={pending}>
              ویرایش
            </Button>
          </div>
        ) : step === 'title' ? (
          <div className="grid gap-2">
            <Button block onClick={next}>
              ادامه
            </Button>
            <Button
              block
              variant="ghost"
              onClick={() => {
                update({ title: '' });
                goTo('amount');
              }}
            >
              رد کردن
            </Button>
          </div>
        ) : step === 'provider' && state.providerSlug !== 'bank' && state.providerSlug !== 'other' ? null : (
          <Button block onClick={next}>
            ادامه
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-bold">
        {children}
        <button type="button" onClick={onEdit} className="text-brand-700" aria-label={`ویرایش ${label}`}>
          <Pencil className="size-3.5" aria-hidden />
        </button>
      </dd>
    </div>
  );
}
