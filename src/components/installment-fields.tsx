'use client';

import { Check, Minus, Plus } from 'lucide-react';
import { FREQUENCIES, FREQUENCY_LABELS, MAX_INSTALLMENT_COUNT, type Frequency } from '@/domain/schedule';
import type { ProviderSlug } from '@/domain/providers';
import { formatCompactToman, formatNumber, parseIntegerInput, toPersianDigits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ProviderAvatar } from './ui/provider-avatar';

export interface ProviderOption {
  slug: ProviderSlug;
  name: string;
}

export function ProviderPicker({
  providers,
  value,
  onSelect,
}: {
  providers: ProviderOption[];
  value: ProviderSlug | null;
  onSelect: (slug: ProviderSlug) => void;
}) {
  return (
    <div role="radiogroup" aria-label="ارائه‌دهنده" className="grid grid-cols-2 gap-3">
      {providers.map((p) => {
        const selected = p.slug === value;
        return (
          <button
            key={p.slug}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(p.slug)}
            className={cn(
              'relative flex min-h-[72px] items-center gap-3 rounded-2xl border bg-surface px-3.5 py-3 text-start transition-colors',
              selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line hover:border-brand-100 hover:bg-brand-50/40',
            )}
          >
            <ProviderAvatar slug={p.slug} name={p.name} size="sm" />
            <span className="font-semibold">{p.name}</span>
            {selected && <Check className="absolute top-2 left-2 size-4 text-brand-600" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

const inputClass =
  'w-full rounded-2xl border border-line bg-surface px-4 outline-none placeholder:text-muted/60 focus:border-brand-500 aria-[invalid=true]:border-danger-600';

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  maxLength,
  hint,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  maxLength?: number;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-ink-soft">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClass, 'h-14 text-base')}
        autoFocus={autoFocus}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Integer Toman input with live Persian formatting. */
export function AmountInput({
  id,
  label,
  value,
  onChange,
  error,
  autoFocus,
  large,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  autoFocus?: boolean;
  large?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={cn('mb-2 block text-sm font-semibold text-ink-soft', large && 'sr-only')}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          placeholder="۰"
          value={value === null ? '' : formatNumber(value)}
          onChange={(e) => {
            const parsed = parseIntegerInput(e.target.value);
            onChange(parsed === null ? null : Math.min(parsed, 999_999_999_999));
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          className={cn(inputClass, 'num text-center font-bold', large ? 'h-20 pe-16 text-3xl' : 'h-14 pe-14 text-lg')}
          autoFocus={autoFocus}
        />
        <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sm font-semibold text-muted" dir="rtl">
          تومان
        </span>
      </div>
      <p id={`${id}-help`} className={cn('mt-2 text-sm', error ? 'text-danger-700' : 'text-muted')} role={error ? 'alert' : undefined}>
        {error ?? (value && value >= 1000 ? `معادل ${formatCompactToman(value)} تومان` : 'مبلغ رو به تومان وارد کن.')}
      </p>
    </div>
  );
}

export function CountStepper({
  id,
  label,
  value,
  onChange,
  error,
  presets = [3, 4, 6, 12],
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  presets?: number[];
}) {
  const current = value ?? 0;
  const set = (n: number) => onChange(Math.max(1, Math.min(MAX_INSTALLMENT_COUNT, n)));
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => set(current - 1)}
          disabled={current <= 1}
          aria-label="کم کردن"
          className="flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-ink disabled:text-line"
        >
          <Minus className="size-6" aria-hidden />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={value === null ? '' : toPersianDigits(value)}
          onChange={(e) => {
            const parsed = parseIntegerInput(e.target.value);
            onChange(parsed === null ? null : Math.min(parsed, MAX_INSTALLMENT_COUNT));
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(inputClass, 'num h-20 w-28 text-center text-4xl font-extrabold')}
        />
        <button
          type="button"
          onClick={() => set(current + 1)}
          disabled={current >= MAX_INSTALLMENT_COUNT}
          aria-label="زیاد کردن"
          className="flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-ink disabled:text-line"
        >
          <Plus className="size-6" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-center text-sm text-muted">قسط</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => set(n)}
            aria-pressed={value === n}
            className={cn(
              'num h-10 min-w-12 rounded-full border px-4 text-sm font-semibold',
              value === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-ink-soft',
            )}
          >
            {toPersianDigits(n)}
          </button>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-3 text-center text-sm text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function FrequencyOptions({
  value,
  onChange,
  customDays,
  onCustomDaysChange,
  error,
}: {
  value: Frequency;
  onChange: (value: Frequency) => void;
  customDays: number | null;
  onCustomDaysChange: (value: number | null) => void;
  error?: string;
}) {
  return (
    <div>
      <div role="radiogroup" aria-label="دوره پرداخت" className="grid gap-2.5">
        {FREQUENCIES.map((f) => {
          const selected = f === value;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(f)}
              className={cn(
                'flex h-14 items-center justify-between rounded-2xl border bg-surface px-4 text-start font-semibold',
                selected ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line',
              )}
            >
              <span>
                {FREQUENCY_LABELS[f]}
                {f === 'monthly' && <span className="ms-2 text-xs font-medium text-muted">(رایج‌تر)</span>}
              </span>
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border-2',
                  selected ? 'border-brand-600 bg-brand-600' : 'border-line',
                )}
                aria-hidden
              >
                {selected && <span className="size-2 rounded-full bg-white" />}
              </span>
            </button>
          );
        })}
      </div>
      {value === 'custom' && (
        <div className="mt-4">
          <label htmlFor="custom-days" className="mb-2 block text-sm font-semibold text-ink-soft">
            هر چند روز یک‌بار؟
          </label>
          <input
            id="custom-days"
            type="text"
            inputMode="numeric"
            dir="ltr"
            placeholder="مثلاً ۱۰"
            value={customDays === null ? '' : toPersianDigits(customDays)}
            onChange={(e) => {
              const parsed = parseIntegerInput(e.target.value);
              onCustomDaysChange(parsed === null ? null : Math.min(parsed, 999));
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'custom-days-error' : undefined}
            className={cn(inputClass, 'num h-14 text-center text-lg font-bold')}
          />
          {error && (
            <p id="custom-days-error" role="alert" className="mt-1.5 text-sm text-danger-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
