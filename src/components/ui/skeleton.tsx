import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-xl', className)} />;
}

/** Generic page skeleton used by loading.tsx files. */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4 pt-2">
      <span className="sr-only">در حال بارگذاری…</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-card)]" />
      ))}
    </div>
  );
}
