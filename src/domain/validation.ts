/**
 * Input validation shared by the Add/Edit forms (client) and server actions.
 * The server always re-validates; client validation is only for UX.
 */
import { z } from 'zod';
import { isISODate } from '@/lib/jalali';
import { MAX_CUSTOM_PROVIDER_NAME_LENGTH, MAX_TITLE_LENGTH, PROVIDER_SLUGS } from './providers';
import {
  FREQUENCIES,
  MAX_CUSTOM_FREQUENCY_DAYS,
  MAX_INSTALLMENT_AMOUNT,
  MAX_INSTALLMENT_COUNT,
  MIN_CUSTOM_FREQUENCY_DAYS,
  MIN_INSTALLMENT_AMOUNT,
  MIN_INSTALLMENT_COUNT,
} from './schedule';
import { formatCount, formatToman } from '@/lib/format';

export const MESSAGES = {
  amountRequired: 'مبلغ هر قسط رو وارد کن.',
  amountTooSmall: `مبلغ قسط باید حداقل ${formatToman(MIN_INSTALLMENT_AMOUNT)} باشه.`,
  amountTooLarge: 'این مبلغ خیلی بزرگه. دوباره بررسی کن.',
  countInvalid: `تعداد قسط‌ها باید بین ۱ و ${formatCount(MAX_INSTALLMENT_COUNT)} باشه.`,
  dateInvalid: 'تاریخ قسط بعدی رو انتخاب کن.',
  customNameRequired: 'اسم مجموعه رو وارد کن.',
  customNameTooLong: `اسم حداکثر ${formatCount(MAX_CUSTOM_PROVIDER_NAME_LENGTH)} حرف می‌تونه باشه.`,
  titleTooLong: `عنوان حداکثر ${formatCount(MAX_TITLE_LENGTH)} حرف می‌تونه باشه.`,
  customDaysInvalid: 'فاصله پرداخت‌ها رو به روز وارد کن (بین ۱ تا ۳۶۵).',
  providerRequired: 'مشخص کن این قسط برای کجاست.',
} as const;

const optionalTrimmed = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const amountSchema = z
  .number({ error: MESSAGES.amountRequired })
  .int(MESSAGES.amountRequired)
  .min(MIN_INSTALLMENT_AMOUNT, MESSAGES.amountTooSmall)
  .max(MAX_INSTALLMENT_AMOUNT, MESSAGES.amountTooLarge);

const countSchema = z
  .number({ error: MESSAGES.countInvalid })
  .int(MESSAGES.countInvalid)
  .min(MIN_INSTALLMENT_COUNT, MESSAGES.countInvalid)
  .max(MAX_INSTALLMENT_COUNT, MESSAGES.countInvalid);

const isoDateSchema = z.string({ error: MESSAGES.dateInvalid }).refine(isISODate, MESSAGES.dateInvalid);

const customDaysSchema = z
  .number()
  .int(MESSAGES.customDaysInvalid)
  .min(MIN_CUSTOM_FREQUENCY_DAYS, MESSAGES.customDaysInvalid)
  .max(MAX_CUSTOM_FREQUENCY_DAYS, MESSAGES.customDaysInvalid)
  .optional()
  .nullable();

const providerFields = {
  providerSlug: z.enum(PROVIDER_SLUGS, { error: MESSAGES.providerRequired }),
  customProviderName: optionalTrimmed(MAX_CUSTOM_PROVIDER_NAME_LENGTH, MESSAGES.customNameTooLong),
  title: optionalTrimmed(MAX_TITLE_LENGTH, MESSAGES.titleTooLong),
};

type RefineCtx = z.RefinementCtx;

function refineProvider(v: { providerSlug: string; customProviderName: string | null }, ctx: RefineCtx) {
  if (v.providerSlug === 'other' && !v.customProviderName) {
    ctx.addIssue({ code: 'custom', path: ['customProviderName'], message: MESSAGES.customNameRequired });
  }
}

function refineFrequency(v: { frequency: string; customFrequencyDays?: number | null }, ctx: RefineCtx) {
  if (v.frequency === 'custom' && !v.customFrequencyDays) {
    ctx.addIssue({ code: 'custom', path: ['customFrequencyDays'], message: MESSAGES.customDaysInvalid });
  }
}

export const createCreditAccountSchema = z
  .object({
    ...providerFields,
    installmentAmount: amountSchema,
    remainingInstallments: countSchema,
    nextDueDate: isoDateSchema,
    frequency: z.enum(FREQUENCIES),
    customFrequencyDays: customDaysSchema,
    clientRequestId: z.uuid().optional().nullable(),
  })
  .superRefine((v, ctx) => {
    refineProvider(v, ctx);
    refineFrequency(v, ctx);
  });

export type CreateCreditAccountInput = z.input<typeof createCreditAccountSchema>;
export type CreateCreditAccountData = z.output<typeof createCreditAccountSchema>;

/**
 * Editing an account. Schedule fields are optional as a group: when present,
 * only UNPAID installments are regenerated; paid history is never touched.
 */
export const updateCreditAccountSchema = z
  .object({
    ...providerFields,
    schedule: z
      .object({
        installmentAmount: amountSchema,
        remainingInstallments: countSchema,
        nextDueDate: isoDateSchema,
        frequency: z.enum(FREQUENCIES),
        customFrequencyDays: customDaysSchema,
      })
      .superRefine(refineFrequency)
      .optional()
      .nullable(),
  })
  .superRefine(refineProvider);

export type UpdateCreditAccountInput = z.input<typeof updateCreditAccountSchema>;
export type UpdateCreditAccountData = z.output<typeof updateCreditAccountSchema>;

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  daysBefore: z.array(z.number().int()).max(5),
  dueDateReminder: z.boolean(),
});

/** First validation message per field, for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
