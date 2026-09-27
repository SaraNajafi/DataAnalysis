import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { OnboardingFlow } from './onboarding-flow';

export const metadata = { title: 'شروع' };

export default async function OnboardingPage() {
  const user = await requireUser();
  // Onboarding is only for new users.
  if (user.onboardingCompletedAt) redirect('/');
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-canvas px-5 md:shadow-[0_0_0_1px_var(--color-line)]">
      <OnboardingFlow />
    </div>
  );
}
