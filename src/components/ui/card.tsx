import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]', className)} {...rest} />;
}

export function SectionTitle({
  title,
  action,
  id,
}: {
  title: string;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 px-1">
      <h2 id={id} className="text-base font-bold text-ink">
        {title}
      </h2>
      {action}
    </div>
  );
}
