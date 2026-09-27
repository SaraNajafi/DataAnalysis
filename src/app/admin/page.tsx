import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { formatNumber, formatPercent, toPersianDigits } from '@/lib/format';
import { requireAdmin } from '@/server/auth/session';
import { getPilotMetrics } from '@/server/services/admin-service';

export const metadata = { title: 'آمار پایلوت' };

function ratio(part: number, whole: number): string {
  return whole > 0 ? formatPercent((part / whole) * 100) : '—';
}

function decimal(value: number): string {
  return toPersianDigits((Math.round(value * 10) / 10).toString()).replace('.', '٫');
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/**
 * Internal pilot dashboard. Aggregates only — no phone numbers, amounts or
 * individual schedules. Visible only to ADMIN_PHONE_NUMBERS (404 otherwise).
 */
export default async function AdminPage() {
  await requireAdmin();
  const m = await getPilotMetrics();

  return (
    <div className="mx-auto min-h-dvh max-w-[430px] bg-canvas px-4 pt-3 pb-10">
      <PageHeader title="آمار پایلوت" subtitle="فقط آمار تجمیعی — بدون اطلاعات شخصی" backHref="/settings" />

      <h2 className="mb-2 px-1 text-sm font-bold text-ink-soft">قیف فعال‌سازی</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="کل کاربران" value={formatNumber(m.totalUsers)} />
        <Metric label="کاربران با حداقل ۱ قسط" value={formatNumber(m.usersWithAccount)} hint={`${ratio(m.usersWithAccount, m.totalUsers)} از ثبت‌نام‌ها`} />
        <Metric
          label="کاربران فعال‌شده (حداقل ۲ قسط)"
          value={formatNumber(m.activatedUsers)}
          hint={`${ratio(m.activatedUsers, m.usersWithAccount)} از کاربران با قسط`}
        />
        <Metric label="کل قسط‌ها (حساب اعتباری)" value={formatNumber(m.totalCreditAccounts)} />
        <Metric label="میانگین قسط هر کاربر فعال‌شده" value={decimal(m.avgAccountsPerActivatedUser)} />
        <Metric label="میانگین قسط هر کاربر دارای قسط" value={decimal(m.avgAccountsPerUserWithAccount)} />
      </div>

      <h2 className="mt-6 mb-2 px-1 text-sm font-bold text-ink-soft">استفاده</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="کل اقساط زمان‌بندی‌شده" value={formatNumber(m.totalInstallments)} />
        <Metric label="اقساط علامت‌خورده «پرداخت شد»" value={formatNumber(m.installmentsMarkedPaid)} />
        <Metric label="کاربرانی که پرداخت ثبت کردن" value={formatNumber(m.paymentMarkers)} />
        <Metric label="کاربران استفاده‌کننده از تقویم" value={formatNumber(m.calendarUsers)} />
        <Metric label="کاربرانی که عقب‌افتاده دیدن" value={formatNumber(m.overdueSeenUsers)} />
      </div>

      <h2 className="mt-6 mb-2 px-1 text-sm font-bold text-ink-soft">بازگشت کاربران</h2>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="فعال در ۷ روز اخیر" value={formatNumber(m.activeUsers7d)} />
        <Metric label="فعال در ۳۰ روز اخیر" value={formatNumber(m.activeUsers30d)} />
        <Metric
          label="بازگشت روز ۷"
          value={ratio(m.day7Retained, m.day7Eligible)}
          hint={`${formatNumber(m.day7Retained)} از ${formatNumber(m.day7Eligible)} کاربر واجد شرایط`}
        />
        <Metric
          label="بازگشت روز ۳۰"
          value={ratio(m.day30Retained, m.day30Eligible)}
          hint={`${formatNumber(m.day30Retained)} از ${formatNumber(m.day30Eligible)} کاربر واجد شرایط`}
        />
      </div>

      <p className="mt-6 text-xs leading-6 text-muted">
        تعریف‌ها: «فعال‌شده» یعنی حداقل ۲ قسط فعال یا تسویه‌شده. «فعال در N روز» یعنی هر رویداد ثبت‌شده در این بازه. «بازگشت روز N» سهم
        کاربرانی است که حداقل N روز از ثبت‌نامشان گذشته و بعد از روز N دوباره از پی‌نو استفاده کرده‌اند.
      </p>
    </div>
  );
}
