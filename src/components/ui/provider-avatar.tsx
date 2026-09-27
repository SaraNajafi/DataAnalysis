import { Landmark } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Neutral monogram colors per provider (intentionally not the providers' brand marks). */
const TONES: Record<string, string> = {
  'snapp-pay': 'bg-[#e8efff] text-[#2f4fb8]',
  digipay: 'bg-[#e3f4fb] text-[#12698c]',
  tara: 'bg-[#f1ebff] text-[#6440c9]',
  kipa: 'bg-[#ffecef] text-[#b42a4c]',
  azkivam: 'bg-[#fff3e0] text-[#a35a00]',
  bank: 'bg-brand-50 text-brand-700',
  other: 'bg-line-soft text-ink-soft',
};

export function ProviderAvatar({
  slug,
  name,
  size = 'md',
}: {
  slug: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'lg' ? 'size-14 text-xl' : size === 'sm' ? 'size-9 text-sm' : 'size-11 text-base';
  const letter = Array.from(name.trim())[0] ?? '؟';
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-2xl font-bold', sizeClass, TONES[slug] ?? TONES.other)}
    >
      {slug === 'bank' ? <Landmark className={size === 'lg' ? 'size-7' : 'size-5'} /> : letter}
    </span>
  );
}
