import Link from 'next/link';
import type { ComponentProps } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'lg' | 'md' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-600/50',
  secondary: 'bg-surface text-ink border border-line hover:bg-canvas active:bg-line-soft disabled:text-muted',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-60',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:text-muted',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 disabled:bg-danger-600/50',
};

const sizes: Record<Size, string> = {
  lg: 'h-14 px-6 text-base rounded-2xl gap-2',
  md: 'h-12 px-5 text-[15px] rounded-xl gap-2',
  sm: 'h-10 px-3.5 text-sm rounded-xl gap-1.5',
};

export function buttonClasses(options: { variant?: Variant; size?: Size; block?: boolean; className?: string } = {}) {
  const { variant = 'primary', size = 'lg', block = false, className } = options;
  return cn(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors select-none',
    'disabled:cursor-not-allowed',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  );
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
};

export function Button({ variant, size, block, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; block?: boolean };

export function ButtonLink({ variant, size, block, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClasses({ variant, size, block, className })} {...rest} />;
}
