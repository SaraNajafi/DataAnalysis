'use client';

import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { COMMON_MESSAGES } from '@/lib/messages';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<RotateCw className="size-8" aria-hidden />}
      title="صفحه بارگذاری نشد"
      description={COMMON_MESSAGES.network}
      action={
        <Button block onClick={() => reset()}>
          تلاش دوباره
        </Button>
      }
    />
  );
}
