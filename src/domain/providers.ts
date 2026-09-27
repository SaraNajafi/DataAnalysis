export const PROVIDER_TYPES = ['bnpl', 'bank', 'loan', 'other'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_SLUGS = ['snapp-pay', 'digipay', 'tara', 'kipa', 'azkivam', 'bank', 'other'] as const;
export type ProviderSlug = (typeof PROVIDER_SLUGS)[number];

export interface ProviderDefinition {
  slug: ProviderSlug;
  name: string;
  type: ProviderType;
  sortOrder: number;
}

/** Seeded into the `providers` table by migration 0001. Keep in sync. */
export const PROVIDERS: readonly ProviderDefinition[] = [
  { slug: 'snapp-pay', name: 'اسنپ‌پی', type: 'bnpl', sortOrder: 1 },
  { slug: 'digipay', name: 'دیجی‌پی', type: 'bnpl', sortOrder: 2 },
  { slug: 'tara', name: 'تارا', type: 'bnpl', sortOrder: 3 },
  { slug: 'kipa', name: 'کیپا', type: 'bnpl', sortOrder: 4 },
  { slug: 'azkivam', name: 'ازکی‌وام', type: 'loan', sortOrder: 5 },
  { slug: 'bank', name: 'بانک', type: 'bank', sortOrder: 6 },
  { slug: 'other', name: 'سایر', type: 'other', sortOrder: 7 },
];

export const MAX_CUSTOM_PROVIDER_NAME_LENGTH = 60;
export const MAX_TITLE_LENGTH = 80;

export function isProviderSlug(value: unknown): value is ProviderSlug {
  return typeof value === 'string' && (PROVIDER_SLUGS as readonly string[]).includes(value);
}

/**
 * Name shown to the user for a credit account's provider.
 * - bank + «ملت»       → «بانک ملت»
 * - bank + «بانک ملت»  → «بانک ملت»
 * - other + «صندوق فامیلی» → «صندوق فامیلی»
 */
export function providerDisplayName(slug: string, providerName: string, customName?: string | null): string {
  const custom = customName?.trim();
  if (!custom) return providerName;
  if (slug === 'bank') return custom.startsWith('بانک') ? custom : `بانک ${custom}`;
  if (slug === 'other') return custom;
  return providerName;
}
