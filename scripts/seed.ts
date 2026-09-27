/**
 * Development seed: creates ONE demo user with realistic credit accounts whose
 * dates are relative to today, so the UI shows paid, due-today, overdue,
 * upcoming and next-month installments, plus one completed account.
 *
 * Usage: npm run db:seed
 * Demo login: 09120000000 (the OTP is printed in the dev server console).
 * Refuses to run when NODE_ENV=production.
 */
import { loadEnvConfig } from '@next/env';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/server/db/schema';
import { generateDueDates, type Frequency } from '../src/domain/schedule';
import { addDays, addJalaliMonthsClamped, formatPersianDate, todayISO, type ISODate } from '../src/lib/jalali';

loadEnvConfig(process.cwd());

const DEMO_PHONE = '+989120000000';

interface SeedAccount {
  providerSlug: string;
  customProviderName?: string;
  title: string;
  amount: number;
  frequency: Frequency;
  /** Due date of the first unpaid installment. */
  nextDueDate: ISODate;
  /** How many installments were already paid before `nextDueDate`. */
  paidBefore: number;
  remaining: number;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data in production.');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  const today = todayISO(process.env.APP_TIMEZONE || 'Asia/Tehran');

  const accounts: SeedAccount[] = [
    {
      providerSlug: 'snapp-pay',
      title: 'خرید موبایل',
      amount: 2_350_000,
      frequency: 'monthly',
      nextDueDate: today, // due today
      paidBefore: 1,
      remaining: 3,
    },
    {
      providerSlug: 'digipay',
      title: 'خرید لپ‌تاپ',
      amount: 1_800_000,
      frequency: 'monthly',
      nextDueDate: addDays(today, -2), // overdue by 2 days
      paidBefore: 2,
      remaining: 4,
    },
    {
      providerSlug: 'bank',
      customProviderName: 'ملت',
      title: 'وام',
      amount: 4_200_000,
      frequency: 'monthly',
      nextDueDate: addDays(today, 5), // upcoming within 7 days
      paidBefore: 4,
      remaining: 8,
    },
    {
      providerSlug: 'tara',
      title: 'لوازم خانگی',
      amount: 950_000,
      frequency: 'monthly',
      nextDueDate: addDays(today, 20),
      paidBefore: 3,
      remaining: 0, // completed
    },
  ];

  await db.transaction(async (tx) => {
    // Idempotent: recreate the demo user from scratch.
    await tx.delete(schema.users).where(eq(schema.users.phoneNumber, DEMO_PHONE));
    const now = new Date();
    const [user] = await tx
      .insert(schema.users)
      .values({ phoneNumber: DEMO_PHONE, onboardingCompletedAt: now, lastLoginAt: now })
      .returning();
    if (!user) throw new Error('Failed to create demo user');

    const providers = await tx.select().from(schema.providers);
    const providerId = (slug: string) => {
      const p = providers.find((x) => x.slug === slug);
      if (!p) throw new Error(`Provider ${slug} missing — run npm run db:migrate first`);
      return p.id;
    };

    for (const a of accounts) {
      const total = a.paidBefore + a.remaining;
      const firstDueDate = addJalaliMonthsClamped(a.nextDueDate, -a.paidBefore);
      const dates = generateDueDates({ firstDueDate, count: total, frequency: a.frequency });
      const completed = a.remaining === 0;
      const [account] = await tx
        .insert(schema.creditAccounts)
        .values({
          userId: user.id,
          providerId: providerId(a.providerSlug),
          customProviderName: a.customProviderName ?? null,
          title: a.title,
          installmentAmount: a.amount,
          initialInstallmentCount: total,
          remainingInstallments: a.remaining,
          firstDueDate,
          frequency: a.frequency,
          totalOriginalDebt: a.amount * total,
          status: completed ? 'completed' : 'active',
          source: 'manual',
          completedAt: completed ? now : null,
        })
        .returning();
      if (!account) throw new Error('Failed to create account');

      await tx.insert(schema.installments).values(
        dates.map((dueDate, i) => ({
          creditAccountId: account.id,
          sequence: i + 1,
          amount: a.amount,
          dueDate,
          paidAt: i < a.paidBefore ? new Date(`${dueDate}T08:00:00Z`) : null,
        })),
      );
    }
  });

  console.info(`✓ Demo data created for 09120000000 (today: ${formatPersianDate(today)})`);
  console.info('  Log in with 09120000000 — the OTP is printed in the `npm run dev` console.');
  await client.end();
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
