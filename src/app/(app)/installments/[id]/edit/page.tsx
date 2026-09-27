import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { isProviderSlug } from '@/domain/providers';
import { isUuid } from '@/lib/ids';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { getCreditAccountDetail, getProviders } from '@/server/services/credit-account-service';
import { EditAccountForm } from './edit-form';

export const metadata = { title: 'ویرایش قسط' };

export default async function EditCreditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const today = appToday();
  const [detail, providers] = await Promise.all([getCreditAccountDetail(user.id, id, today), getProviders()]);
  if (!detail) notFound();
  const { account } = detail;
  const providerSlug = account.providerSlug;
  if (!isProviderSlug(providerSlug)) notFound();

  return (
    <>
      <PageHeader title="ویرایش قسط" subtitle={account.displayName} backHref={`/installments/${account.id}`} />
      <EditAccountForm
        accountId={account.id}
        today={today}
        providers={providers.flatMap((p) => (isProviderSlug(p.slug) ? [{ slug: p.slug, name: p.name }] : []))}
        initial={{
          providerSlug,
          customProviderName: account.customProviderName ?? '',
          title: account.title ?? '',
          amount: account.installmentAmount,
          count: account.progress.unpaidCount,
          nextDueDate: account.progress.nextDue,
          frequency: account.frequency,
          customDays: account.customFrequencyDays,
        }}
        paidCount={account.progress.paidCount}
      />
    </>
  );
}
