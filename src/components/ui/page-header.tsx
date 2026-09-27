import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'بازگشت',
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-center gap-2 pt-2">
      {backHref && (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="-ms-2 inline-flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface"
        >
          <ChevronRight className="size-6" aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
