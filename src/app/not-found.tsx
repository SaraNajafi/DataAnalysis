import { SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] items-center justify-center bg-canvas px-4">
      <EmptyState
        icon={<SearchX className="size-8" aria-hidden />}
        title="این صفحه پیدا نشد"
        description="ممکنه حذف شده باشه یا آدرسش درست نباشه."
        action={
          <ButtonLink href="/" block>
            رفتن به خانه
          </ButtonLink>
        }
      />
    </div>
  );
}
