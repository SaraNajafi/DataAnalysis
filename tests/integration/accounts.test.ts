import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createTestDatabase } from '../helpers/db';
import { findOrCreateUserByPhone } from '@/server/repositories/user-repository';
import {
  createCreditAccount,
  deleteCreditAccount,
  getActivationStatus,
  getCreditAccountDetail,
  listCreditAccounts,
  updateCreditAccount,
} from '@/server/services/credit-account-service';
import { markInstallmentPaid, undoInstallmentPayment } from '@/server/services/installment-service';
import { getHomeData, getCalendarData } from '@/server/services/dashboard-service';
import { getAccountReminderSettings, updateAccountReminderSettings } from '@/server/services/reminder-service';
import { getPilotMetrics } from '@/server/services/admin-service';
import { fromJalali, toJalali } from '@/lib/jalali';

let ctx: Awaited<ReturnType<typeof createTestDatabase>>;
const TODAY = fromJalali(1405, 7, 5); // 2026-09-27

beforeAll(async () => {
  ctx = await createTestDatabase();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.db.execute(sql`TRUNCATE users, analytics_events CASCADE`);
});

async function createUser(phone: string) {
  const { user } = await findOrCreateUserByPhone(ctx.db, phone, new Date());
  return user;
}

async function createAccount(userId: string, overrides: Record<string, unknown> = {}) {
  const result = await createCreditAccount(
    userId,
    {
      providerSlug: 'snapp-pay',
      title: 'خرید لپ‌تاپ',
      installmentAmount: 2_500_000,
      remainingInstallments: 4,
      nextDueDate: fromJalali(1405, 7, 5),
      frequency: 'monthly',
      ...overrides,
    },
    { today: TODAY },
  );
  if (!result.ok) throw new Error(`create failed: ${JSON.stringify(result)}`);
  return result.accountId;
}

describe('creating a credit account', () => {
  it('generates the full installment schedule (spec example)', async () => {
    const user = await createUser('+989121111111');
    const id = await createAccount(user.id);
    const detail = await getCreditAccountDetail(user.id, id, TODAY);
    expect(detail).not.toBeNull();
    expect(detail!.installments.map((i) => toJalali(i.dueDate))).toEqual([
      { jy: 1405, jm: 7, jd: 5 },
      { jy: 1405, jm: 8, jd: 5 },
      { jy: 1405, jm: 9, jd: 5 },
      { jy: 1405, jm: 10, jd: 5 },
    ]);
    expect(detail!.installments.every((i) => i.amount === 2_500_000 && i.paidAt === null)).toBe(true);
    expect(detail!.account.progress.remainingDebt).toBe(10_000_000);
    expect(detail!.account.displayName).toBe('اسنپ‌پی');
  });

  it('validates input on the server', async () => {
    const user = await createUser('+989121111111');
    const bad = await createCreditAccount(
      user.id,
      { providerSlug: 'snapp-pay', installmentAmount: 0, remainingInstallments: 0, nextDueDate: 'x', frequency: 'monthly' },
      { today: TODAY },
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.fieldErrors ?? {})).toEqual(
        expect.arrayContaining(['installmentAmount', 'remainingInstallments', 'nextDueDate']),
      );
    }
    const other = await createCreditAccount(
      user.id,
      { providerSlug: 'other', installmentAmount: 10_000, remainingInstallments: 1, nextDueDate: TODAY, frequency: 'monthly' },
      { today: TODAY },
    );
    expect(other.ok).toBe(false);
    const farPast = await createCreditAccount(
      user.id,
      { providerSlug: 'tara', installmentAmount: 10_000, remainingInstallments: 1, nextDueDate: '2020-01-01', frequency: 'monthly' },
      { today: TODAY },
    );
    expect(farPast.ok).toBe(false);
  });

  it('is idempotent for duplicate submissions with the same client request id', async () => {
    const user = await createUser('+989121111111');
    const clientRequestId = randomUUID();
    const a = await createAccount(user.id, { clientRequestId });
    const b = await createAccount(user.id, { clientRequestId });
    expect(b).toBe(a);
    expect((await listCreditAccounts(user.id, TODAY)).active).toHaveLength(1);
  });

  it('stores bank and custom provider names', async () => {
    const user = await createUser('+989121111111');
    const bankId = await createAccount(user.id, { providerSlug: 'bank', customProviderName: 'ملت', title: 'وام' });
    const otherId = await createAccount(user.id, { providerSlug: 'other', customProviderName: 'صندوق خانوادگی' });
    expect((await getCreditAccountDetail(user.id, bankId, TODAY))!.account.displayName).toBe('بانک ملت');
    expect((await getCreditAccountDetail(user.id, otherId, TODAY))!.account.displayName).toBe('صندوق خانوادگی');
  });

  it('tracks activation (≥ 2 credit accounts)', async () => {
    const user = await createUser('+989121111111');
    await createAccount(user.id);
    expect(await getActivationStatus(user.id)).toEqual({ accountCount: 1, activated: false });
    await createAccount(user.id, { providerSlug: 'digipay' });
    expect(await getActivationStatus(user.id)).toEqual({ accountCount: 2, activated: true });
  });
});

describe('payments', () => {
  it('marks paid, updates the dashboard, and undo restores values', async () => {
    const user = await createUser('+989121111111');
    const id = await createAccount(user.id, { installmentAmount: 2_000_000, remainingInstallments: 2 });
    await createAccount(user.id, {
      providerSlug: 'digipay',
      installmentAmount: 1_000_000,
      remainingInstallments: 1,
      nextDueDate: fromJalali(1405, 7, 20),
    });

    const before = await getHomeData(user.id, TODAY);
    expect(before.currentMonth).toMatchObject({ total: 3_000_000, paid: 0, remaining: 3_000_000, progressPercent: 0 });
    expect(before.next7Days).toMatchObject({ amount: 2_000_000, count: 1 });

    const detail = await getCreditAccountDetail(user.id, id, TODAY);
    const first = detail!.installments[0]!;
    const paid = await markInstallmentPaid(user.id, first.id, { today: TODAY });
    expect(paid.ok).toBe(true);
    if (paid.ok) expect(paid.month).toMatchObject({ total: 3_000_000, paid: 2_000_000, remaining: 1_000_000, progressPercent: 67 });

    const after = await getHomeData(user.id, TODAY);
    expect(after.currentMonth.paid).toBe(2_000_000);
    expect(after.next7Days.count).toBe(0);

    // Duplicate request is harmless
    expect((await markInstallmentPaid(user.id, first.id, { today: TODAY })).ok).toBe(true);

    const undone = await undoInstallmentPayment(user.id, first.id, { today: TODAY });
    expect(undone.ok).toBe(true);
    const restored = await getHomeData(user.id, TODAY);
    expect(restored.currentMonth).toMatchObject(before.currentMonth);
    expect(restored.next7Days).toMatchObject({ amount: 2_000_000, count: 1 });
  });

  it('completes the account when every installment is paid and reopens it on undo', async () => {
    const user = await createUser('+989121111111');
    const id = await createAccount(user.id, { remainingInstallments: 2 });
    const { installments } = (await getCreditAccountDetail(user.id, id, TODAY))!;
    await markInstallmentPaid(user.id, installments[0]!.id, { today: TODAY });
    const last = await markInstallmentPaid(user.id, installments[1]!.id, { today: TODAY });
    expect(last.ok && last.accountCompleted).toBe(true);

    let list = await listCreditAccounts(user.id, TODAY);
    expect(list.active).toHaveLength(0);
    expect(list.completed).toHaveLength(1);
    expect(list.totalActiveDebt).toBe(0);
    const home = await getHomeData(user.id, TODAY);
    expect(home.totalActiveDebt).toBe(0);
    expect(home.currentMonth.paid).toBe(2_500_000); // completed accounts still count as paid this month

    await undoInstallmentPayment(user.id, installments[1]!.id, { today: TODAY });
    list = await listCreditAccounts(user.id, TODAY);
    expect(list.active).toHaveLength(1);
    expect(list.completed).toHaveLength(0);
  });

  it('shows overdue installments separately from the next payment', async () => {
    const user = await createUser('+989121111111');
    await createAccount(user.id, { providerSlug: 'digipay', nextDueDate: fromJalali(1405, 7, 3), remainingInstallments: 2 });
    await createAccount(user.id, { nextDueDate: fromJalali(1405, 7, 8), remainingInstallments: 1 });
    const home = await getHomeData(user.id, TODAY);
    expect(home.overdue.count).toBe(1);
    expect(home.overdue.items[0]!.providerSlug).toBe('digipay');
    expect(home.nextPayment?.providerSlug).toBe('snapp-pay');
    expect(home.nextPayment?.dueDate).toBe(fromJalali(1405, 7, 8));
  });
});

describe('editing a credit account', () => {
  it('regenerates only unpaid installments and keeps paid history stable', async () => {
    const user = await createUser('+989121111111');
    const id = await createAccount(user.id, { remainingInstallments: 4, nextDueDate: fromJalali(1405, 6, 5) });
    const { installments } = (await getCreditAccountDetail(user.id, id, TODAY))!;
    const paidOne = installments[0]!;
    await markInstallmentPaid(user.id, paidOne.id, { today: TODAY });
    const paidBefore = (await getCreditAccountDetail(user.id, id, TODAY))!.installments[0]!;

    const res = await updateCreditAccount(
      user.id,
      id,
      {
        providerSlug: 'snapp-pay',
        title: 'خرید موبایل',
        schedule: {
          installmentAmount: 3_000_000,
          remainingInstallments: 2,
          nextDueDate: fromJalali(1405, 7, 10),
          frequency: 'monthly',
        },
      },
      { today: TODAY },
    );
    expect(res.ok).toBe(true);

    const after = (await getCreditAccountDetail(user.id, id, TODAY))!;
    expect(after.account.title).toBe('خرید موبایل');
    expect(after.installments).toHaveLength(3);
    const [paid, ...unpaid] = after.installments;
    expect(paid).toMatchObject({ id: paidBefore.id, amount: 2_500_000, dueDate: paidBefore.dueDate });
    expect(paid!.paidAt?.getTime()).toBe(paidBefore.paidAt?.getTime());
    expect(unpaid.map((i) => [i.amount, toJalali(i.dueDate)])).toEqual([
      [3_000_000, { jy: 1405, jm: 7, jd: 10 }],
      [3_000_000, { jy: 1405, jm: 8, jd: 10 }],
    ]);
    expect(after.account.progress).toMatchObject({ paidCount: 1, unpaidCount: 2, remainingDebt: 6_000_000 });
  });
});

describe('deleting a credit account', () => {
  it('soft-deletes the account and removes it from every view', async () => {
    const user = await createUser('+989121111111');
    const id = await createAccount(user.id);
    expect((await deleteCreditAccount(user.id, id)).ok).toBe(true);
    expect(await getCreditAccountDetail(user.id, id, TODAY)).toBeNull();
    const home = await getHomeData(user.id, TODAY);
    expect(home.hasAccounts).toBe(false);
    expect(home.currentMonth.total).toBe(0);
    const calendar = await getCalendarData(user.id, { jy: 1405, jm: 7 }, TODAY);
    expect(calendar.items).toHaveLength(0);
    // Row still exists in the database (soft delete)
    const rows = await ctx.db.execute(sql`SELECT status, deleted_at FROM credit_accounts`);
    expect((rows as unknown as { rows: Array<{ status: string }> }).rows[0]!.status).toBe('archived');
  });
});

describe('data isolation between users', () => {
  it('user B cannot read, pay, undo, edit, delete or configure user A’s data', async () => {
    const alice = await createUser('+989121111111');
    const bob = await createUser('+989122222222');
    const aliceAccount = await createAccount(alice.id);
    const aliceInstallment = (await getCreditAccountDetail(alice.id, aliceAccount, TODAY))!.installments[0]!;

    // Read by id
    expect(await getCreditAccountDetail(bob.id, aliceAccount, TODAY)).toBeNull();
    // Lists / dashboards
    expect((await listCreditAccounts(bob.id, TODAY)).active).toHaveLength(0);
    expect((await getHomeData(bob.id, TODAY)).hasAccounts).toBe(false);
    expect((await getCalendarData(bob.id, { jy: 1405, jm: 7 }, TODAY)).items).toHaveLength(0);
    // Mark paid / undo
    expect((await markInstallmentPaid(bob.id, aliceInstallment.id, { today: TODAY })).ok).toBe(false);
    await markInstallmentPaid(alice.id, aliceInstallment.id, { today: TODAY });
    expect((await undoInstallmentPayment(bob.id, aliceInstallment.id, { today: TODAY })).ok).toBe(false);
    // Edit
    const edit = await updateCreditAccount(bob.id, aliceAccount, { providerSlug: 'tara', title: 'hacked' }, { today: TODAY });
    expect(edit.ok).toBe(false);
    // Delete
    expect((await deleteCreditAccount(bob.id, aliceAccount)).ok).toBe(false);
    // Reminders
    expect(await getAccountReminderSettings(bob.id, aliceAccount)).toBeNull();
    expect((await updateAccountReminderSettings(bob.id, aliceAccount, null)).ok).toBe(false);

    // Alice's data is untouched
    const detail = (await getCreditAccountDetail(alice.id, aliceAccount, TODAY))!;
    expect(detail.account.title).toBe('خرید لپ‌تاپ');
    expect(detail.account.providerSlug).toBe('snapp-pay');
    expect(detail.installments[0]!.paidAt).not.toBeNull();
  });
});

describe('pilot metrics', () => {
  it('reports aggregate activation metrics only', async () => {
    const a = await createUser('+989121111111');
    const b = await createUser('+989122222222');
    await createUser('+989123333333');
    await createAccount(a.id);
    await createAccount(a.id, { providerSlug: 'digipay' });
    await createAccount(b.id);
    const m = await getPilotMetrics();
    expect(m).toMatchObject({
      totalUsers: 3,
      usersWithAccount: 2,
      activatedUsers: 1,
      totalCreditAccounts: 3,
      avgAccountsPerActivatedUser: 2,
      totalInstallments: 12,
      installmentsMarkedPaid: 0,
    });
  });
});
