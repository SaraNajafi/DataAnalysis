export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600">{icon}</div>}
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {description && <p className="mt-2 max-w-72 text-sm leading-7 text-muted">{description}</p>}
      {action && <div className="mt-6 w-full max-w-72">{action}</div>}
    </div>
  );
}
