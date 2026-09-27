import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/session';
import { safeRedirectPath } from '@/lib/redirect';
import { LoginFlow } from './login-flow';

export const metadata = { title: 'ورود' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const current = await getCurrentSession();
  if (current) redirect(current.user.onboardingCompletedAt ? safeRedirectPath(next) : '/onboarding');

  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-canvas px-5 md:shadow-[0_0_0_1px_var(--color-line)]">
      <LoginFlow next={safeRedirectPath(next)} />
    </div>
  );
}
