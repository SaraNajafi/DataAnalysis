'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestOtpAction, verifyOtpAction } from '@/server/actions/auth-actions';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { toLatinDigits, toPersianDigits } from '@/lib/format';
import { COMMON_MESSAGES } from '@/lib/messages';
import { formatPhoneForDisplay, normalizeIranianMobile } from '@/lib/phone';

const CODE_LENGTH = 6;

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return toPersianDigits(`${m}:${String(s).padStart(2, '0')}`);
}

export function LoginFlow({ next }: { next: string }) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [normalized, setNormalized] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [pending, startTransition] = useTransition();
  const codeInput = useRef<HTMLInputElement>(null);
  const lastSubmittedCode = useRef<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'otp') codeInput.current?.focus();
  }, [step]);

  const sendCode = (target: string, isResend: boolean) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        const result = await requestOtpAction(target, { isResend });
        if (result.ok) {
          setNormalized(result.phoneNumber);
          setStep('otp');
          setCode('');
          lastSubmittedCode.current = null;
          setResendIn(result.resendInSeconds);
          if (isResend) setInfo('کد جدید ارسال شد.');
          return;
        }
        if (result.retryAfterSeconds && !isResend) {
          // A code was just sent to this number: continue to the code step.
          setNormalized(normalizeIranianMobile(target));
          setStep('otp');
          setResendIn(result.retryAfterSeconds);
          setInfo('کد قبلی هنوز معتبره. همون رو وارد کن.');
          return;
        }
        setError(result.message);
        if (result.retryAfterSeconds) setResendIn(result.retryAfterSeconds);
      } catch {
        setError(COMMON_MESSAGES.network);
      }
    });
  };

  const submitPhone = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const n = normalizeIranianMobile(phone);
    if (!n) {
      setError('شماره موبایل درست نیست. مثلاً ۰۹۱۲۱۲۳۴۵۶۷ وارد کن.');
      return;
    }
    sendCode(n, false);
  };

  const submitCode = (value: string) => {
    if (pending || !normalized) return;
    if (value.length !== CODE_LENGTH) {
      setError('کد ۶ رقمی رو کامل وارد کن.');
      return;
    }
    lastSubmittedCode.current = value;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      try {
        // On success the server action redirects; it only returns on failure.
        const result = await verifyOtpAction(normalized, value, next);
        if (result && !result.ok) {
          setError(result.message);
          setCode('');
          codeInput.current?.focus();
        }
      } catch {
        setError(COMMON_MESSAGES.network);
      }
    });
  };

  const onCodeChange = (raw: string) => {
    const digits = toLatinDigits(raw).replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH && digits !== lastSubmittedCode.current) submitCode(digits);
  };

  return (
    <div className="flex flex-1 flex-col py-8">
      <div className="flex flex-col items-center pt-6 pb-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-brand-600 text-2xl font-black text-white shadow-lg shadow-brand-600/25">
          پ
        </span>
        <p className="mt-4 text-3xl font-black text-brand-700">{BRAND_NAME}</p>
        <p className="mt-1 text-sm text-muted">{BRAND_TAGLINE}</p>
      </div>

      {step === 'phone' ? (
        <form onSubmit={submitPhone} noValidate className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]">
          <h1 className="text-xl font-extrabold">ورود به {BRAND_NAME}</h1>
          <p className="mt-1.5 text-sm text-muted">شماره موبایلت رو وارد کن</p>

          <label htmlFor="phone" className="mt-5 block text-sm font-semibold text-ink-soft">
            شماره موبایل
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder="۰۹xxxxxxxxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'phone-error' : undefined}
            className="num mt-2 h-14 w-full rounded-2xl border border-line bg-canvas px-4 text-center text-lg font-semibold tracking-wider outline-none placeholder:text-muted/60 focus:border-brand-500 focus:bg-surface"
            autoFocus
          />
          {error && (
            <p id="phone-error" role="alert" className="mt-2 text-sm text-danger-700">
              {error}
            </p>
          )}

          <Button type="submit" block className="mt-5" loading={pending}>
            دریافت کد
          </Button>
          <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            اگه اولین باره وارد می‌شی، حسابت خودکار ساخته می‌شه. رمز عبور لازم نیست.
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCode(code);
          }}
          noValidate
          className="rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]"
        >
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setError(null);
              setInfo(null);
            }}
            className="-ms-1 mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700"
          >
            <ChevronRight className="size-4" aria-hidden />
            ویرایش شماره
          </button>
          <h1 className="text-xl font-extrabold">کد تأیید</h1>
          <p className="mt-1.5 text-sm leading-7 text-muted">
            کد ارسال‌شده به شماره{' '}
            <bdi dir="ltr" className="num font-semibold text-ink">
              {normalized ? formatPhoneForDisplay(normalized) : ''}
            </bdi>{' '}
            را وارد کنید.
          </p>

          <label htmlFor="otp" className="mt-5 block text-sm font-semibold text-ink-soft">
            کد ۶ رقمی
          </label>
          <input
            ref={codeInput}
            id="otp"
            name="otp"
            type="text"
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="––––––"
            value={toPersianDigits(code)}
            onChange={(e) => onCodeChange(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'otp-error' : undefined}
            className="num mt-2 h-16 w-full rounded-2xl border border-line bg-canvas px-4 text-center text-3xl font-bold tracking-[0.5em] outline-none placeholder:text-muted/40 focus:border-brand-500 focus:bg-surface"
          />
          {error && (
            <p id="otp-error" role="alert" className="mt-2 text-sm text-danger-700">
              {error}
            </p>
          )}
          {info && !error && (
            <p role="status" className="mt-2 text-sm text-brand-700">
              {info}
            </p>
          )}

          <Button type="submit" block className="mt-5" loading={pending} disabled={code.length !== CODE_LENGTH}>
            تأیید و ورود
          </Button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => normalized && sendCode(normalized, true)}
              disabled={resendIn > 0 || pending}
              className="text-sm font-semibold text-brand-700 disabled:text-muted"
            >
              ارسال مجدد کد
              {resendIn > 0 && <span className="num ms-1">({formatCountdown(resendIn)})</span>}
            </button>
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <p className="mt-4 rounded-xl bg-canvas px-3 py-2 text-center text-xs text-muted">
              حالت توسعه: کد در کنسول سرور چاپ می‌شه.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
