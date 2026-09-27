'use client';

import { useState, useTransition } from 'react';
import { BellRing, Check, Info } from 'lucide-react';
import { describeReminderSettings, REMINDER_DAY_OPTIONS, type ReminderSettings } from '@/domain/reminders';
import { updateAccountRemindersAction, updateDefaultRemindersAction } from '@/server/actions/misc-actions';
import { formatCount } from '@/lib/format';
import { COMMON_MESSAGES } from '@/lib/messages';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';
import { Card } from './ui/card';

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className={cn('flex min-h-14 items-center justify-between gap-4 py-3', disabled && 'opacity-50')}>
      <span>
        <span className="block font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="h-7 w-12 rounded-full bg-line transition-colors peer-checked:bg-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
        />
        <span
          aria-hidden
          className="absolute right-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-5"
        />
      </span>
    </label>
  );
}

function SettingsFields({
  value,
  onChange,
  disabled,
}: {
  value: ReminderSettings;
  onChange: (value: ReminderSettings) => void;
  disabled?: boolean;
}) {
  const toggleDay = (day: number, on: boolean) =>
    onChange({
      ...value,
      daysBefore: on ? [...new Set([...value.daysBefore, day])].sort((a, b) => b - a) : value.daysBefore.filter((d) => d !== day),
    });

  return (
    <div className="divide-y divide-line-soft">
      <Toggle
        id="reminders-enabled"
        label="یادآوری‌ها فعال باشه"
        checked={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
        disabled={disabled}
      />
      {REMINDER_DAY_OPTIONS.map((day) => (
        <Toggle
          key={day}
          id={`reminder-${day}`}
          label={`${formatCount(day)} روز قبل از سررسید`}
          checked={value.daysBefore.includes(day)}
          onChange={(on) => toggleDay(day, on)}
          disabled={disabled || !value.enabled}
        />
      ))}
      <Toggle
        id="reminder-due-date"
        label="روز سررسید"
        checked={value.dueDateReminder}
        onChange={(dueDateReminder) => onChange({ ...value, dueDateReminder })}
        disabled={disabled || !value.enabled}
      />
    </div>
  );
}

export function DeliveryNote() {
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm leading-7 text-brand-800">
      <Info className="mt-1 size-4 shrink-0" aria-hidden />
      <span>
        یادآوری‌ها فعلاً <strong>داخل خود پی‌نو</strong> (در صفحه خانه) نمایش داده می‌شن. ارسال اعلان یا پیامک هنوز فعال نشده و در
        نسخه‌های بعدی اضافه می‌شه.
      </span>
    </p>
  );
}

function useSave() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const save = (fn: () => Promise<{ ok: boolean }>) => {
    setStatus('idle');
    startTransition(async () => {
      try {
        const result = await fn();
        setStatus(result.ok ? 'saved' : 'error');
        setMessage(result.ok ? null : COMMON_MESSAGES.unexpected);
      } catch {
        setStatus('error');
        setMessage(COMMON_MESSAGES.network);
      }
    });
  };
  return { pending, status, message, save, reset: () => setStatus('idle') };
}

function SaveFeedback({ status, message }: { status: 'idle' | 'saved' | 'error'; message: string | null }) {
  if (status === 'saved')
    return (
      <p role="status" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-paid-600">
        <Check className="size-4" aria-hidden /> ذخیره شد
      </p>
    );
  if (status === 'error')
    return (
      <p role="alert" className="text-center text-sm text-danger-700">
        {message}
      </p>
    );
  return null;
}

export function DefaultReminderForm({ initial }: { initial: ReminderSettings }) {
  const [value, setValue] = useState(initial);
  const { pending, status, message, save, reset } = useSave();
  return (
    <div className="space-y-4">
      <Card className="px-4">
        <SettingsFields
          value={value}
          onChange={(v) => {
            setValue(v);
            reset();
          }}
        />
      </Card>
      <DeliveryNote />
      <Button block loading={pending} onClick={() => save(() => updateDefaultRemindersAction(value))}>
        ذخیره
      </Button>
      <SaveFeedback status={status} message={message} />
    </div>
  );
}

export function AccountReminderForm({
  accountId,
  override,
  userDefault,
}: {
  accountId: string;
  override: ReminderSettings | null;
  userDefault: ReminderSettings;
}) {
  const [useDefault, setUseDefault] = useState(override === null);
  const [value, setValue] = useState<ReminderSettings>(override ?? userDefault);
  const { pending, status, message, save, reset } = useSave();

  return (
    <div className="space-y-4">
      <Card className="p-2" role="radiogroup" aria-label="نوع یادآوری">
        {[
          { key: true, label: 'مثل تنظیمات کلی', description: describeReminderSettings(userDefault) },
          { key: false, label: 'تنظیم جداگانه برای این قسط', description: undefined },
        ].map((option) => (
          <button
            key={String(option.key)}
            type="button"
            role="radio"
            aria-checked={useDefault === option.key}
            onClick={() => {
              setUseDefault(option.key);
              reset();
            }}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-start',
              useDefault === option.key && 'bg-brand-50',
            )}
          >
            <span>
              <span className="block font-semibold">{option.label}</span>
              {option.description && <span className="num mt-0.5 block text-xs text-muted">{option.description}</span>}
            </span>
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                useDefault === option.key ? 'border-brand-600 bg-brand-600' : 'border-line',
              )}
            >
              {useDefault === option.key && <span className="size-2 rounded-full bg-white" />}
            </span>
          </button>
        ))}
      </Card>

      {!useDefault && (
        <Card className="px-4">
          <SettingsFields
            value={value}
            onChange={(v) => {
              setValue(v);
              reset();
            }}
          />
        </Card>
      )}

      <DeliveryNote />
      <Button
        block
        loading={pending}
        onClick={() => save(() => updateAccountRemindersAction(accountId, useDefault ? null : value))}
      >
        <BellRing className="size-4" aria-hidden />
        ذخیره یادآوری
      </Button>
      <SaveFeedback status={status} message={message} />
    </div>
  );
}
