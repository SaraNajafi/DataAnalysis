import { Lock, ShieldCheck, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';
import { requireOnboardedUser } from '@/server/auth/session';

export const metadata = { title: 'درباره پی‌نو' };

const POINTS = [
  {
    Icon: Wallet,
    title: 'پی‌نو پرداختی انجام نمی‌ده',
    text: 'پی‌نو فقط برنامه قسط‌هات رو نشون می‌ده. پرداخت رو خودت از طریق سرویس مربوطه انجام می‌دی و اینجا ثبتش می‌کنی.',
  },
  {
    Icon: Lock,
    title: 'به حساب‌هات دسترسی نداره',
    text: 'پی‌نو به حساب بانکی یا اپ‌های اعتباری‌ات وصل نمی‌شه. همه اطلاعات رو خودت وارد می‌کنی.',
  },
  {
    Icon: ShieldCheck,
    title: 'اطلاعاتت فقط برای خودته',
    text: 'قسط‌ها و مبالغ فقط برای حساب خودت نمایش داده می‌شن و در اختیار کسی قرار نمی‌گیرن.',
  },
];

export default async function AboutPage() {
  await requireOnboardedUser();
  return (
    <>
      <PageHeader title={`درباره ${BRAND_NAME}`} backHref="/settings" />
      <Card className="p-5 text-center">
        <p className="text-3xl font-black text-brand-700">{BRAND_NAME}</p>
        <p className="mt-2 text-ink-soft">{BRAND_TAGLINE}</p>
        <p className="mt-4 text-sm leading-7 text-muted">
          قسط‌ها و پرداخت‌های اعتباری‌ات از اسنپ‌پی، دیجی‌پی، تارا، کیپا، ازکی‌وام، بانک‌ها و بقیه رو یک‌جا ببین و همیشه بدون چه مبلغی رو
          چه زمانی باید پرداخت کنی.
        </p>
      </Card>
      <ul className="mt-4 space-y-3">
        {POINTS.map(({ Icon, title, text }) => (
          <li key={title}>
            <Card className="flex items-start gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block font-bold">{title}</span>
                <span className="mt-1 block text-sm leading-7 text-muted">{text}</span>
              </span>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-xs text-muted">نسخه آزمایشی (پایلوت)</p>
    </>
  );
}
