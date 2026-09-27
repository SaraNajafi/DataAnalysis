import { BottomNav } from '@/components/bottom-nav';
import { PaymentFlowProvider } from '@/components/payment-flow';
import { ActivityPing } from '@/components/tracking';
import { requireOnboardedUser } from '@/server/auth/session';

/**
 * Shell for all authenticated screens: centered mobile-width container on
 * desktop, bottom navigation, and the global payment confirmation sheets.
 * (Every page also performs its own auth check through the DAL.)
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOnboardedUser();
  return (
    <div className="min-h-dvh md:bg-[#e7eaee] md:py-0">
      <div className="relative mx-auto min-h-dvh max-w-[430px] bg-canvas md:shadow-[0_0_0_1px_var(--color-line),0_12px_40px_rgb(16_24_40/0.08)]">
        <PaymentFlowProvider>
          <main className="px-4 pt-3 pb-32">{children}</main>
          <BottomNav />
        </PaymentFlowProvider>
        <ActivityPing />
      </div>
    </div>
  );
}
