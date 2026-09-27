import { isProviderSlug } from '@/domain/providers';
import { requireOnboardedUser } from '@/server/auth/session';
import { appToday } from '@/server/config';
import { getProviders } from '@/server/services/credit-account-service';
import { AddInstallmentWizard } from './add-wizard';

export const metadata = { title: 'افزودن قسط' };

export default async function NewInstallmentPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  await requireOnboardedUser();
  const [{ first }, providers] = await Promise.all([searchParams, getProviders()]);
  const options = providers.flatMap((p) => (isProviderSlug(p.slug) ? [{ slug: p.slug, name: p.name }] : []));
  return <AddInstallmentWizard providers={options} today={appToday()} isFirst={first === '1'} />;
}
