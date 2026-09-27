import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { generateDueDates } from '../../src/domain/schedule';
import { formatNumber } from '../../src/lib/format';
import {
  addDays,
  formatPersianDate,
  getCurrentJalaliMonth,
  todayISO,
  type ISODate,
} from '../../src/lib/jalali';

/**
 * Primary pilot flow (spec §61), end to end against the real app + database:
 * signup → onboarding → empty home → add two accounts → activation → dashboard
 * → calendar → mark paid → undo → overdue → logout/login → data isolation.
 */

const LOG_FILE = path.resolve(process.env.E2E_SERVER_LOG ?? '.e2e/server.log');
const TODAY = todayISO(process.env.APP_TIMEZONE || 'Asia/Tehran');

function randomPhone(): string {
  return `0935${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
}

function logSize(): number {
  return fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
}

async function readOtp(phone: string, fromOffset: number): Promise<string> {
  const local = phone.startsWith('+98') ? `0${phone.slice(3)}` : phone;
  const masked = `${local.slice(0, 4)}***${local.slice(-4)}`;
  for (let i = 0; i < 50; i++) {
    // Offsets are in bytes (the log contains multi-byte characters).
    const content = fs.readFileSync(LOG_FILE).subarray(fromOffset).toString('utf8');
    const matches = [...content.matchAll(/\[mock-sms\] OTP for (\S+): (\d{6})/g)].filter((m) => m[1] === masked);
    const last = matches.at(-1);
    if (last?.[2]) return last[2];
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No OTP found in ${LOG_FILE} for ${masked}`);
}

async function login(page: Page, phone: string) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'ورود به پی‌نو' })).toBeVisible();
  await page.getByLabel('شماره موبایل').fill(phone);
  const offset = logSize();
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  await expect(page.getByRole('heading', { name: 'کد تأیید' })).toBeVisible();
  const code = await readOtp(phone, offset);
  await page.getByLabel('کد ۶ رقمی').fill(code); // auto-submits at 6 digits
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function pickDate(page: Page, date: ISODate) {
  const label = formatPersianDate(date, { weekday: true });
  const target = getCurrentJalaliMonth(date);
  const current = getCurrentJalaliMonth(TODAY);
  const diff = target.jy * 12 + target.jm - (current.jy * 12 + current.jm);
  for (let i = 0; i < Math.abs(diff); i++) {
    await page.getByRole('button', { name: diff < 0 ? 'ماه قبل' : 'ماه بعد' }).click();
  }
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
}

async function addInstallment(
  page: Page,
  opts: { provider: string; title: string; amount: number; count: number; date: ISODate },
): Promise<string> {
  await page.goto('/installments/new');
  await expect(page.getByRole('heading', { name: 'این قسط برای کجاست؟' })).toBeVisible();
  await page.getByRole('radio', { name: opts.provider, exact: true }).click();

  await expect(page.getByRole('heading', { name: 'این قسط بابت چیه؟' })).toBeVisible();
  await page.getByLabel('عنوان (اختیاری)').fill(opts.title);
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByRole('heading', { name: 'مبلغ هر قسط چقدره؟' })).toBeVisible();
  await page.getByLabel('مبلغ هر قسط').fill(String(opts.amount));
  await expect(page.getByLabel('مبلغ هر قسط')).toHaveValue(formatNumber(opts.amount));
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByRole('heading', { name: 'چند قسط باقی مونده؟' })).toBeVisible();
  await page.getByLabel('تعداد قسط‌های باقی‌مانده').fill(String(opts.count));
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByRole('heading', { name: 'قسط بعدی چه تاریخیه؟' })).toBeVisible();
  await pickDate(page, opts.date);
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByRole('heading', { name: 'هر چند وقت یک‌بار پرداخت می‌کنی؟' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /ماهانه/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'ادامه' }).click();

  await expect(page.getByRole('heading', { name: 'همه‌چیز درسته؟' })).toBeVisible();
  await expect(page.getByText(formatNumber(opts.amount * opts.count)).first()).toBeVisible();
  await page.getByRole('button', { name: 'ثبت قسط' }).click();

  await page.waitForURL(/\/installments\/[0-9a-f-]{36}\?created=1$/);
  const id = /\/installments\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error('No account id in URL');
  return id;
}

function monthRegion(page: Page) {
  return page.getByRole('region', { name: 'پرداخت‌های این ماه' });
}

test('primary pilot flow', async ({ page, browser }) => {
  const phone = randomPhone();
  const inMonth = (d: ISODate) => {
    const a = getCurrentJalaliMonth(d);
    const b = getCurrentJalaliMonth(TODAY);
    return a.jy === b.jy && a.jm === b.jm;
  };

  // 1. New user → OTP → account created → onboarding
  await login(page, phone);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'همه قسط‌هات، یک‌جا' })).toBeVisible();
  await page.getByRole('button', { name: 'شروع کنیم' }).click();
  await expect(page.getByText('همه قسط‌ها در یک جا')).toBeVisible();
  await page.getByRole('button', { name: 'افزودن اولین قسط' }).click();
  await expect(page).toHaveURL(/\/installments\/new\?first=1$/);

  // 2. Empty home (close the wizard)
  await page.getByRole('link', { name: 'بستن' }).click();
  await expect(page.getByRole('heading', { name: 'هنوز قسطی ثبت نکردی' })).toBeVisible();
  await expect(page.getByText('پرداخت‌های این ماه')).toHaveCount(0);

  // 3. Add SnappPay (spec example) and verify the generated schedule
  const snappId = await addInstallment(page, {
    provider: 'اسنپ‌پی',
    title: 'خرید لپ‌تاپ',
    amount: 2_500_000,
    count: 4,
    date: TODAY,
  });
  await expect(page.getByText('قسط ثبت شد و برنامه پرداختش ساخته شد.')).toBeVisible();
  const expectedDates = generateDueDates({ firstDueDate: TODAY, count: 4, frequency: 'monthly' });
  const schedule = page.getByRole('region', { name: 'برنامه پرداخت' }).getByRole('listitem');
  await expect(schedule).toHaveCount(4);
  for (const [i, d] of expectedDates.entries()) {
    await expect(schedule.nth(i)).toContainText(formatPersianDate(d, { year: 'auto', today: TODAY }));
    await expect(schedule.nth(i)).toContainText('۲٬۵۰۰٬۰۰۰');
  }
  await expect(page.getByText('۱۰٬۰۰۰٬۰۰۰').first()).toBeVisible();

  // 4. Add Digipay (second account) → activation message
  await addInstallment(page, { provider: 'دیجی‌پی', title: 'خرید موبایل', amount: 1_800_000, count: 3, date: TODAY });
  await expect(page.getByText(/حالا ۲ قسط در پی‌نو داری/)).toBeVisible();

  // 5. Home dashboard values (both first installments are due today)
  await page.goto('/');
  await expect(monthRegion(page)).toContainText('۴٬۳۰۰٬۰۰۰');
  await expect(monthRegion(page)).toContainText('۰٪ پرداخت شده');
  const next7 = page.getByRole('region', { name: '۷ روز آینده' });
  await expect(next7).toContainText('۴٬۳۰۰٬۰۰۰');
  await expect(next7).toContainText('۲ پرداخت');
  await expect(page.getByRole('region', { name: 'پرداخت بعدی' })).toContainText('امروز');

  // 6. Calendar
  await page.getByRole('link', { name: 'تقویم' }).click();
  await expect(page).toHaveURL(/\/calendar/);
  await expect(page.getByRole('region', { name: /تعهدات این ماه/ })).toContainText('۴٬۳۰۰٬۰۰۰');

  // 7. Open the SnappPay account and mark the first installment as paid
  await page.goto(`/installments/${snappId}`);
  await page.getByRole('button', { name: /^پرداخت کردم/ }).first().click();
  const confirm = page.getByRole('dialog', { name: 'این قسط رو پرداخت کردی؟' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'بله، پرداخت کردم' }).click();
  await expect(page.getByText('قسط اسنپ‌پی پرداخت شد')).toBeVisible();
  await expect(page.getByText(/این ماه\s*۵۸٪\s*تعهداتت رو پرداخت کردی/)).toBeVisible();
  await page.getByRole('button', { name: 'باشه' }).click();
  await expect(page.getByText('۱ از ۴ قسط پرداخت شده')).toBeVisible();

  // Dashboard reflects the payment
  await page.goto('/');
  await expect(monthRegion(page)).toContainText('۵۸٪ پرداخت شده');
  await expect(monthRegion(page)).toContainText('۱٬۸۰۰٬۰۰۰'); // remaining
  await expect(page.getByRole('region', { name: '۷ روز آینده' })).toContainText('۱ پرداخت');

  // 8. Undo from the account details → values return
  await page.goto(`/installments/${snappId}`);
  await page.getByRole('button', { name: 'برگرداندن' }).first().click();
  await expect(page.getByText('پرداخت برگردانده شد.')).toBeVisible();
  await expect(page.getByText('۰ از ۴ قسط پرداخت شده')).toBeVisible();
  await page.goto('/');
  await expect(monthRegion(page)).toContainText('۰٪ پرداخت شده');
  await expect(page.getByRole('region', { name: '۷ روز آینده' })).toContainText('۲ پرداخت');

  // 9. Overdue: an installment whose due date was yesterday
  const yesterday = addDays(TODAY, -1);
  await addInstallment(page, { provider: 'تارا', title: 'لوازم خانگی', amount: 900_000, count: 1, date: yesterday });
  await page.goto('/');
  const overdue = page.getByRole('region', { name: 'پرداخت‌های عقب‌افتاده' });
  await expect(overdue).toBeVisible();
  await expect(overdue).toContainText('تارا');
  await expect(overdue).toContainText('۱ روز از سررسید گذشته');
  // Overdue is never shown as the "next payment"
  await expect(page.getByRole('region', { name: 'پرداخت بعدی' })).not.toContainText('تارا');
  if (inMonth(yesterday)) await expect(monthRegion(page)).toContainText('۵٬۲۰۰٬۰۰۰');

  // Paying the overdue installment completes the Tara account
  await overdue.getByRole('button', { name: /^پرداخت کردم/ }).click();
  await page.getByRole('dialog', { name: 'این قسط رو پرداخت کردی؟' }).getByRole('button', { name: 'بله، پرداخت کردم' }).click();
  await expect(page.getByText('این قسط کامل تسویه شد 🎉')).toBeVisible();
  await page.getByRole('button', { name: 'باشه' }).click();
  await expect(page.getByRole('region', { name: 'پرداخت‌های عقب‌افتاده' })).toHaveCount(0);
  await page.goto('/installments?tab=completed');
  await expect(page.getByText('لوازم خانگی')).toBeVisible();

  // 10. Logout → login again → data still exists (no onboarding)
  await page.goto('/settings');
  await page.getByRole('button', { name: 'خروج از حساب' }).click();
  await page.getByRole('dialog', { name: 'از حسابت خارج می‌شی؟' }).getByRole('button', { name: 'خروج از حساب' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  await login(page, `+98${phone.slice(1)}`); // different format, same account
  await expect(page).toHaveURL(/\/$/);
  await expect(monthRegion(page)).toBeVisible();
  await page.goto('/installments');
  await expect(page.getByText('خرید لپ‌تاپ')).toBeVisible();
  await expect(page.getByText('خرید موبایل')).toBeVisible();

  // 11. Another user cannot see this user's data
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, randomPhone());
  await expect(otherPage).toHaveURL(/\/onboarding$/);
  await otherPage.getByRole('button', { name: 'شروع کنیم' }).click();
  await otherPage.getByRole('button', { name: 'افزودن اولین قسط' }).click();
  await expect(otherPage).toHaveURL(/\/installments\/new/);
  await otherPage.goto('/');
  await expect(otherPage.getByRole('heading', { name: 'هنوز قسطی ثبت نکردی' })).toBeVisible();
  // Changing the id in the URL does not reveal user A's account
  for (const url of [`/installments/${snappId}`, `/installments/${snappId}/edit`, `/installments/${snappId}/reminders`]) {
    await otherPage.goto(url);
    await expect(otherPage.getByText('این صفحه پیدا نشد')).toBeVisible();
    await expect(otherPage.getByText('خرید لپ‌تاپ')).toHaveCount(0);
    await expect(otherPage.getByText('۲٬۵۰۰٬۰۰۰')).toHaveCount(0);
  }
  await otherPage.goto('/installments');
  await expect(otherPage.getByText('خرید لپ‌تاپ')).toHaveCount(0);
  // Normal users cannot open the admin page
  await otherPage.goto('/admin');
  await expect(otherPage.getByText('این صفحه پیدا نشد')).toBeVisible();
  await expect(otherPage.getByText('آمار پایلوت')).toHaveCount(0);
  await other.close();

  // 12. Unauthenticated visitors are sent to login
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto('/');
  await expect(anonPage).toHaveURL(/\/login$/);
  await anonPage.goto(`/installments/${snappId}`);
  await expect(anonPage).toHaveURL(/\/login\?next=/);
  await anonPage.goto('/admin');
  await expect(anonPage).toHaveURL(/\/login/);
  await anon.close();
});

test('login validation and wrong OTP messages', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('شماره موبایل').fill('12345');
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  await expect(page.getByText('شماره موبایل درست نیست. مثلاً ۰۹۱۲۱۲۳۴۵۶۷ وارد کن.')).toBeVisible();

  const phone = randomPhone();
  await page.getByLabel('شماره موبایل').fill(phone);
  const offset = logSize();
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  const code = await readOtp(phone, offset);
  const wrong = code === '000000' ? '111111' : '000000';
  await page.getByLabel('کد ۶ رقمی').fill(wrong);
  await expect(page.getByText('کد واردشده درست نیست. دوباره امتحان کن.')).toBeVisible();
  await expect(page.getByRole('button', { name: /ارسال مجدد کد/ })).toBeDisabled();
});
