'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, CircleCheck, Undo2 } from 'lucide-react';
import { markInstallmentPaidAction, undoInstallmentPaymentAction, type PaymentActionResult } from '@/server/actions/payment-actions';
import { formatCount, formatPercent, formatToman } from '@/lib/format';
import { formatPersianDate, type ISODate } from '@/lib/jalali';
import { COMMON_MESSAGES } from '@/lib/messages';
import { BottomSheet } from './ui/bottom-sheet';
import { Button } from './ui/button';
import { ProviderAvatar } from './ui/provider-avatar';
import { Money } from './ui/money';
import { cn } from '@/lib/cn';

export interface PayTarget {
  installmentId: string;
  providerSlug: string;
  displayName: string;
  amount: number;
  dueDate: ISODate;
}

type SuccessState = { target: PayTarget; result: Extract<PaymentActionResult, { ok: true }> };

interface PaymentFlowContextValue {
  requestPay: (target: PayTarget) => void;
  notify: (message: string) => void;
}

const PaymentFlowContext = createContext<PaymentFlowContextValue | null>(null);

export function usePaymentFlow(): PaymentFlowContextValue {
  const ctx = useContext(PaymentFlowContext);
  if (!ctx) throw new Error('usePaymentFlow must be used inside <PaymentFlowProvider>');
  return ctx;
}

/**
 * Hosts the "mark as paid" confirmation and success sheets at layout level,
 * so they survive the page re-render that follows a payment (the paid row may
 * disappear from the list that opened the sheet).
 */
export function PaymentFlowProvider({ children }: { children: React.ReactNode }) {
  const [confirmTarget, setConfirmTarget] = useState<PayTarget | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [undoPending, startUndo] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const requestPay = useCallback((target: PayTarget) => {
    setError(null);
    setConfirmTarget(target);
  }, []);

  const confirm = () => {
    const target = confirmTarget;
    if (!target || pending) return;
    startTransition(async () => {
      try {
        const result = await markInstallmentPaidAction(target.installmentId);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setConfirmTarget(null);
        setSuccess({ target, result });
      } catch {
        setError(COMMON_MESSAGES.network);
      }
    });
  };

  const undo = () => {
    const current = success;
    if (!current || undoPending) return;
    startUndo(async () => {
      try {
        const result = await undoInstallmentPaymentAction(current.target.installmentId);
        if (!result.ok) {
          notify(result.message);
          return;
        }
        setSuccess(null);
        notify('پرداخت برگردانده شد.');
      } catch {
        notify(COMMON_MESSAGES.network);
      }
    });
  };

  const value = useMemo(() => ({ requestPay, notify }), [requestPay, notify]);
  const month = success?.result.month;

  return (
    <PaymentFlowContext.Provider value={value}>
      {children}

      <BottomSheet
        open={confirmTarget !== null}
        dismissible={!pending}
        onClose={() => setConfirmTarget(null)}
        title="این قسط رو پرداخت کردی؟"
      >
        {confirmTarget && (
          <>
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-canvas p-4">
              <ProviderAvatar slug={confirmTarget.providerSlug} name={confirmTarget.displayName} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{confirmTarget.displayName}</p>
                <p className="mt-0.5 text-sm text-muted">{formatPersianDate(confirmTarget.dueDate, { year: 'never' })}</p>
              </div>
              <Money amount={confirmTarget.amount} className="text-base font-bold" />
            </div>
            <p className="mt-3 text-xs leading-6 text-muted">
              پی‌نو پرداختی انجام نمی‌ده؛ فقط ثبت می‌کنه که این قسط رو خودت پرداخت کردی.
            </p>
            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {error}
              </p>
            )}
            <div className="mt-5 grid gap-2">
              <Button block onClick={confirm} loading={pending}>
                <Check className="size-5" aria-hidden />
                بله، پرداخت کردم
              </Button>
              <Button block variant="ghost" onClick={() => setConfirmTarget(null)} disabled={pending}>
                انصراف
              </Button>
            </div>
          </>
        )}
      </BottomSheet>

      <BottomSheet open={success !== null} dismissible={!undoPending} onClose={() => setSuccess(null)}>
        {success && month && (
          <div className="text-center" role="status" aria-live="polite">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-paid-50 text-paid-600">
              <CircleCheck className="size-9" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-bold">قسط {success.target.displayName} پرداخت شد</h2>
            {success.result.accountCompleted && (
              <p className="mt-2 text-sm font-semibold text-paid-600">این قسط کامل تسویه شد 🎉</p>
            )}
            {month.total > 0 && (
              <div className="mt-4 rounded-2xl bg-canvas p-4 text-sm leading-7 text-ink-soft">
                <p>
                  این ماه <strong className="num text-ink">{formatPercent(month.progressPercent)}</strong> تعهداتت رو پرداخت کردی.
                </p>
                {month.unpaidCount > 0 ? (
                  <p>
                    {formatCount(month.unpaidCount)} پرداخت دیگه باقی مونده:{' '}
                    <strong className="num text-ink">{formatToman(month.remaining)}</strong>
                  </p>
                ) : (
                  <p>همه پرداخت‌های این ماه انجام شده 🎉</p>
                )}
              </div>
            )}
            <div className="mt-5 grid gap-2">
              <Button block onClick={() => setSuccess(null)} disabled={undoPending}>
                باشه
              </Button>
              <Button block variant="ghost" onClick={undo} loading={undoPending}>
                <Undo2 className="size-4" aria-hidden />
                برگرداندن
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      <div
        aria-live="polite"
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-[430px] justify-center px-4 transition-opacity',
          toast ? 'opacity-100' : 'opacity-0',
        )}
      >
        {toast && <p className="rounded-full bg-ink px-4 py-2.5 text-sm text-white shadow-lg">{toast}</p>}
      </div>
    </PaymentFlowContext.Provider>
  );
}

/** «پرداخت کردم» — opens the confirmation sheet. */
export function PayButton({
  target,
  size = 'sm',
  variant = 'soft',
  block,
  className,
}: {
  target: PayTarget;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'soft' | 'secondary';
  block?: boolean;
  className?: string;
}) {
  const { requestPay } = usePaymentFlow();
  return (
    <Button
      size={size}
      variant={variant}
      block={block}
      className={className}
      onClick={() => requestPay(target)}
      aria-label={`پرداخت کردم: ${target.displayName}، ${formatToman(target.amount)}`}
    >
      <Check className="size-4" aria-hidden />
      پرداخت کردم
    </Button>
  );
}

/** «برگرداندن» — undo an accidental payment marking (used on the schedule). */
export function UndoPaymentButton({ installmentId, label = 'برگرداندن' }: { installmentId: string; label?: string }) {
  const { notify } = usePaymentFlow();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await undoInstallmentPaymentAction(installmentId);
            notify(result.ok ? 'پرداخت برگردانده شد.' : result.message);
          } catch {
            notify(COMMON_MESSAGES.network);
          }
        })
      }
    >
      {!pending && <Undo2 className="size-4" aria-hidden />}
      {label}
    </Button>
  );
}
