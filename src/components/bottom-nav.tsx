'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, House, Layers, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/', label: 'خانه', Icon: House, match: (p: string) => p === '/' },
  { href: '/calendar', label: 'تقویم', Icon: CalendarDays, match: (p: string) => p.startsWith('/calendar') },
  { href: '/installments/new', label: 'افزودن', Icon: Plus, primary: true, match: () => false },
  {
    href: '/installments',
    label: 'قسط‌ها',
    Icon: Layers,
    match: (p: string) => p.startsWith('/installments') && p !== '/installments/new',
  },
  { href: '/settings', label: 'تنظیمات', Icon: Settings, match: (p: string) => p.startsWith('/settings') },
] as const;

/** Hidden inside focused flows (add / edit) to keep attention on the task. */
function isFocusedFlow(pathname: string) {
  return pathname === '/installments/new' || /^\/installments\/[^/]+\/edit$/.test(pathname);
}

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  if (isFocusedFlow(pathname)) return null;

  return (
    <nav
      aria-label="منوی اصلی"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] border-t border-line bg-surface/95 backdrop-blur safe-bottom"
    >
      <ul className="grid h-[68px] grid-cols-5 items-center">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          if ('primary' in item && item.primary) {
            return (
              <li key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-label="افزودن قسط"
                  className="-mt-7 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-700"
                >
                  <item.Icon className="size-7" aria-hidden />
                </Link>
              </li>
            );
          }
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
                  active ? 'text-brand-700' : 'text-muted hover:text-ink-soft',
                )}
              >
                <item.Icon className={cn('size-6', active && 'stroke-[2.4]')} aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
