import { DefaultReminderForm } from '@/components/reminder-settings-form';
import { PageHeader } from '@/components/ui/page-header';
import { requireOnboardedUser } from '@/server/auth/session';
import { getDefaultReminderSettings } from '@/server/services/reminder-service';

export const metadata = { title: 'تنظیم یادآوری‌ها' };

export default async function ReminderSettingsPage() {
  const user = await requireOnboardedUser();
  const settings = await getDefaultReminderSettings(user.id);
  return (
    <>
      <PageHeader title="تنظیم یادآوری‌ها" subtitle="برای همه قسط‌ها (هر قسط می‌تونه تنظیم جداگانه داشته باشه)" backHref="/settings" />
      <DefaultReminderForm initial={settings} />
    </>
  );
}
