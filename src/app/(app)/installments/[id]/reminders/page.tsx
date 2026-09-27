import { notFound } from 'next/navigation';
import { AccountReminderForm } from '@/components/reminder-settings-form';
import { PageHeader } from '@/components/ui/page-header';
import { isUuid } from '@/lib/ids';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { getCreditAccountDetail } from '@/server/services/credit-account-service';
import { getAccountReminderSettings } from '@/server/services/reminder-service';

export const metadata = { title: 'یادآوری قسط' };

export default async function AccountRemindersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [detail, settings] = await Promise.all([
    getCreditAccountDetail(user.id, id, appToday()),
    getAccountReminderSettings(user.id, id),
  ]);
  if (!detail || !settings) notFound();

  return (
    <>
      <PageHeader title="تنظیم یادآوری" subtitle={detail.account.displayName} backHref={`/installments/${id}`} />
      <AccountReminderForm accountId={id} override={settings.override} userDefault={settings.userDefault} />
    </>
  );
}
