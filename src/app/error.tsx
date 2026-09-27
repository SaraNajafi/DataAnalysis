'use client';

import { COMMON_MESSAGES } from '@/lib/messages';

/** Error boundary for routes outside the authenticated shell (login, onboarding, admin). */
export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center bg-canvas px-6 text-center">
      <h1 className="text-lg font-bold">مشکلی پیش اومد</h1>
      <p className="mt-2 text-sm text-muted">{COMMON_MESSAGES.network}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 h-12 w-full max-w-72 rounded-xl bg-brand-600 font-semibold text-white"
      >
        تلاش دوباره
      </button>
    </div>
  );
}
