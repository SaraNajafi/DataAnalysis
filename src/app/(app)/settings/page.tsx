import Link from 'next/link';
import { BarChart3, Bell, ChevronLeft, Info, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { describeReminderSettings } from '@/domain/reminders';
import { BRAND_NAME } from '@/lib/brand';
import { maskPhone } from '@/lib/phone';
import { requireOnboardedUser } from '@/server/auth/session';
import { isAdminPhone } from '@/server/config';
import { getDefaultReminderSettings } from '@/server/services/reminder-service';
import { LogoutButton } from './logout-button';

export const metadata = { title: 'تنظیمات' };

function Row({
  href,
  Icon,
  label,
  value,
}: {
  href?: string;
  Icon: typeof Bell;
  label: string;
  value?: React.ReactNode;
}) {
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-soft">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {value && <span className="mt-0.5 block truncate text-sm text-muted">{value}</span>}
      </span>
      {href && <ChevronLeft className="size-5 text-muted" aria-hidden />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-canvas/60">
          {content}
        </Link>
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}

export default async function SettingsPage() {
  const user = await requireOnboardedUser();
  const reminders = await getDefaultReminderSettings(user.id);
  const admin = isAdminPhone(user.phoneNumber);

  return (
    <>
      <PageHeader title="تنظیمات" />
      <Card>
        <ul className="divide-y divide-line-soft">
          <Row href="/settings/reminders" Icon={Bell} label="تنظیم یادآوری‌ها" value={describeReminderSettings(reminders)} />
          <Row
            Icon={Smartphone}
            label="شماره موبایل"
            value={
              <bdi dir="ltr" className="num">
                {maskPhone(user.phoneNumber)}
              </bdi>
            }
          />
          <Row href="/settings/about" Icon={Info} label={`درباره ${BRAND_NAME}`} />
          {admin && <Row href="/admin" Icon={BarChart3} label="آمار پایلوت (ادمین)" />}
        </ul>
      </Card>
      <div className="mt-4">
        <LogoutButton />
      </div>
    </>
  );
}
