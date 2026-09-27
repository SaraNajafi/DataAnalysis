'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { BellRing, CalendarRange, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { completeOnboardingAction } from '@/server/actions/misc-actions';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { cn } from '@/lib/cn';

const BENEFITS = [
  { Icon: Layers, title: 'همه قسط‌ها در یک جا', text: 'دیگه لازم نیست چند اپ مختلف رو چک کنی.' },
  { Icon: BellRing, title: 'یادآوری سررسیدها', text: 'بدون چه پرداختی نزدیکه.' },
  { Icon: CalendarRange, title: 'تصویر ماه‌های آینده', text: 'ببین در ماه‌های بعد چقدر تعهد مالی داری.' },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending}>
      افزودن اولین قسط
    </Button>
  );
}

export function OnboardingFlow() {
  const [screen, setScreen] = useState<1 | 2>(1);

  return (
    <div className="flex flex-1 flex-col py-8">
      <div className="flex justify-center gap-1.5" aria-label={`مرحله ${screen === 1 ? '۱' : '۲'} از ۲`}>
        {[1, 2].map((i) => (
          <span key={i} className={cn('h-1.5 rounded-full transition-all', i === screen ? 'w-6 bg-brand-600' : 'w-1.5 bg-line')} />
        ))}
      </div>

      {screen === 1 ? (
        <section className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex size-20 items-center justify-center rounded-[28px] bg-brand-600 text-3xl font-black text-white shadow-lg shadow-brand-600/25">
              پ
            </span>
            <p className="mt-5 text-4xl font-black text-brand-700">{BRAND_NAME}</p>
            <h1 className="mt-6 text-2xl font-extrabold">{BRAND_TAGLINE}</h1>
            <p className="mt-3 max-w-80 text-[15px] leading-8 text-ink-soft">
              قسط‌ها و پرداخت‌های اعتباری‌ات رو در پی‌نو ثبت کن و همیشه بدون چه مبلغی رو چه زمانی باید پرداخت کنی.
            </p>
          </div>
          <Button block onClick={() => setScreen(2)}>
            شروع کنیم
          </Button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <h1 className="mb-6 text-center text-2xl font-extrabold">{BRAND_NAME} چه کمکی بهت می‌کنه؟</h1>
            <ul className="space-y-3">
              {BENEFITS.map(({ Icon, title, text }) => (
                <li key={title} className="flex items-start gap-4 rounded-[var(--radius-card)] bg-surface p-4 shadow-[var(--shadow-card)]">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-bold">{title}</span>
                    <span className="mt-1 block text-sm leading-7 text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <form action={completeOnboardingAction} className="mt-6">
            <SubmitButton />
          </form>
        </section>
      )}
    </div>
  );
}
