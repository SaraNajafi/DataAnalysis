# پی‌نو — همه قسط‌هات، یک‌جا

**پی‌نو** is a Persian, mobile-first web app that shows a person all of their installment obligations in one place: SnappPay, Digipay, Tara, Kipa, AzkiVam, bank loans, personal loans and any other credit.
Users add each plan once. پی‌نو generates the full schedule and answers these questions right away:

- How much do I owe this month? How much is due in the next 7 days?
- What is my next payment? What is overdue?
- How many installments are left? Which of the next three months is the heaviest?

This repository is a **production-like, multi-user MVP** built to run a real pilot. It has no provider or bank APIs, no payments, no wallet and no credit scoring. Users enter their data manually. The pilot tests whether that manual entry is worth it for them.

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Local setup](#local-setup)
4. [Database & migrations](#database--migrations)
5. [Environment variables](#environment-variables)
6. [OTP & SMS](#otp--sms)
7. [Demo data](#demo-data)
8. [Tests](#tests)
9. [Deploying to Vercel + Supabase](#deploying-to-vercel--supabase)
10. [Product rules & calculations](#product-rules--calculations)
11. [Analytics & pilot metrics](#analytics--pilot-metrics)
12. [Security & privacy](#security--privacy)
13. [Known MVP limitations](#known-mvp-limitations)
14. [Future architecture](#future-architecture)

---

## Features

| Area | What it does |
| --- | --- |
| Auth | Mobile number + 6-digit OTP. One flow handles both signup and login. Iranian number normalization (`09…`, `+989…`, `989…`, Persian digits). |
| Onboarding | Two short screens, shown only to new users. |
| Add installment | A 7-step wizard (provider → title → amount → count → Jalali date → frequency → review) that generates the whole schedule. |
| Home | This month's total/paid/remaining with progress, overdue items, the next 7 days, the next payment, upcoming payments, a three-month view, and in-app reminders. |
| My installments | Active and completed (تسویه‌شده) credit accounts, with remaining debt, next due date and progress. |
| Account details | Full schedule, mark as paid, undo, edit, delete (soft delete), and per-account reminders. |
| Calendar | Month-by-month Jalali calendar with totals, a day grid and a payment list. |
| Reminders | Default and per-account reminder settings (3 days / 1 day before / on the due date), evaluated in-app. |
| Settings | Reminders, masked phone number, about, logout. |
| Admin | `/admin`: aggregate pilot metrics only, restricted to `ADMIN_PHONE_NUMBERS`. |

The UI is fully Persian and RTL, uses Persian digits, the Toman currency and the Vazirmatn font. It is designed for 375–430 px screens and shows a centered phone-width container on desktop.

## Architecture

```
Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4)
│
├─ src/app/                  UI routes (server components by default)
│   ├─ login/, onboarding/   public / first-run screens
│   ├─ (app)/                authenticated shell: home, calendar, installments, settings
│   ├─ admin/                aggregate pilot metrics (admin phones only)
│   └─ api/health            liveness probe (no data)
├─ src/proxy.ts              optimistic redirect to /login when no session cookie
├─ src/components/           UI components (payment flow sheets, date picker, cards…)
├─ src/domain/               PURE business logic — schedule generation, status,
│                            calculations, reminders, validation (fully unit-tested)
├─ src/lib/                  Jalali date layer, Persian formatting, phone normalization
└─ src/server/
    ├─ actions/              Server Actions ('use server') — thin, call services
    ├─ auth/                 session cookie + Data Access Layer (requireUser, requireAdmin)
    ├─ services/             auth, session, credit-account, installment, dashboard,
    │                        reminder, analytics, admin
    ├─ repositories/         ALL SQL (Drizzle ORM), always scoped by user id
    ├─ sms/                  SmsProvider interface + mock + Kavenegar adapter
    ├─ integrations/         future ProviderAdapter contract (not implemented)
    └─ db/                   schema + client (postgres.js)
drizzle/                     SQL migrations (schema, provider seed, RLS)
scripts/                     migrate.ts, seed.ts
tests/unit, tests/integration (PGlite), tests/e2e (Playwright)
```

Key choices:

- **Database: PostgreSQL via Drizzle ORM.** The app works with any Postgres and is designed for Supabase. All queries run on the server. The browser never talks to the database.
- **Sessions: server-side.** A random 256-bit token is stored in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only its SHA-256 hash is stored in the `sessions` table. Logout deletes the row.
- **Authorization happens in the data layer.** Every page and Server Action gets the user from the session (`requireUser()`). Every repository query filters by that `userId`. A `userId` is never accepted from the client. `proxy.ts` is only an optimistic redirect.
- **Layers.** Pages and actions → services → repositories. Business rules live in `src/domain` and have no I/O.

## Local setup

Requirements: Node.js ≥ 20.9 (22 recommended) and PostgreSQL 14+ (local, Docker or Supabase).

```bash
npm install
cp .env.example .env.local        # then fill DATABASE_URL and SESSION_SECRET
docker compose up -d              # optional: local Postgres on :5432 (user/pass/db: peyno)
npm run db:migrate                # create tables, seed providers, enable RLS
npm run db:seed                   # optional: demo user 09120000000
npm run dev                       # http://localhost:3000
```

Log in with any Iranian mobile number. With `SMS_PROVIDER=mock`, the OTP is printed in the terminal running `npm run dev`:

```
[mock-sms] OTP for 0912***4567: 482913
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (next/core-web-vitals + TypeScript) |
| `npm test` | Unit + integration tests (Vitest; integration tests use in-process PGlite) |
| `npm run test:e2e` | Playwright end-to-end flow (needs a real database, see below) |
| `npm run db:generate` | Generate a new SQL migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations in `drizzle/` |
| `npm run db:seed` | Development demo data (refuses to run in production) |
| `npm run check` | typecheck + lint + tests + production build |

## Database & migrations

Schema: `src/server/db/schema.ts`. Migrations: `drizzle/`.

| Table | Notes |
| --- | --- |
| `users` | `phone_number` is unique and normalized to `+989XXXXXXXXX` (DB check constraint), plus `onboarding_completed_at` and `last_login_at` |
| `sessions` | `token_hash` (SHA-256) and `expires_at` (30 days) |
| `otp_requests` | `otp_hash` (HMAC), `expires_at`, `attempt_count`, `verified_at`, `invalidated_at`, `request_ip_hash`, `last_sent_at` |
| `providers` | Seeded by migration `0001`: snapp-pay, digipay, tara, kipa, azkivam, bank, other |
| `credit_accounts` | Owned by one user. Fields: `installment_amount` (bigint Toman), counts, `first_due_date`, `frequency`, `custom_frequency_days`, `status` (active/completed/archived), `source` (manual/provider_api/bank_api/import), `client_request_id` (idempotency), `deleted_at` (soft delete) |
| `installments` | Belongs to a user only through its credit account. Fields: `amount`, `due_date` (Postgres `date`), `paid_at`. Status is **derived**, not stored. |
| `reminder_preferences` | One default row per user (`credit_account_id IS NULL`) and optional per-account overrides |
| `analytics_events` | `event_name` and `properties` (jsonb, non-sensitive only) |

- Apply migrations with `npm run db:migrate`. It uses `DATABASE_URL_DIRECT` if set, otherwise `DATABASE_URL`.
- To change the schema, edit `schema.ts`, run `npm run db:generate`, review the SQL, and commit it.
- Migration `0001` enables **Row Level Security with no policies** on every table. The app connects as the table owner, which bypasses RLS. On Supabase, this blocks the auto-generated Data API for the `anon` and `authenticated` roles, so a leaked anon key exposes nothing.

## Environment variables

See `.env.example`. Never commit real values. `.env*.local` is git-ignored.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. On Vercel + Supabase, use the **transaction pooler** URL (port 6543). |
| `DATABASE_URL_DIRECT` | no | Direct connection (port 5432) used for migrations |
| `DATABASE_POOL_MAX` | no | Connections per server instance (default 5) |
| `SESSION_SECRET` | prod | ≥ 32 random characters, e.g. `openssl rand -base64 48`. Used to HMAC OTPs and IPs. |
| `SMS_PROVIDER` | yes | `mock` (dev only) or `kavenegar` |
| `SMS_API_KEY` | kavenegar | Kavenegar API key |
| `SMS_TEMPLATE` | kavenegar* | Verify-lookup template name (template text must contain `%token`) |
| `SMS_SENDER` | kavenegar* | Sender line, used only when no template is set |
| `NEXT_PUBLIC_APP_URL` | no | Public URL of the deployment |
| `APP_TIMEZONE` | no | Time zone that defines "today" (default `Asia/Tehran`) |
| `ADMIN_PHONE_NUMBERS` | no | Comma-separated mobiles allowed to open `/admin` |
| `OTP_MAX_PER_IP_PER_HOUR` | no | Override the per-IP OTP limit (default 20; the e2e suite raises it) |

\* Kavenegar needs either `SMS_TEMPLATE` or `SMS_SENDER`.

## OTP & SMS

- **Code:** 6 digits, cryptographically random, valid for **2 minutes**, **single use**, at most **5 verification attempts**. Each attempt is counted atomically before the code is compared.
- **Rate limits:** 60 s resend cooldown (only while the previous code is unused), 5 codes per phone per hour, and 20 per IP per hour. Issuing a new code invalidates any older unused code.
- **Storage:** only `HMAC-SHA256(SESSION_SECRET, id:phone:code)` is stored. The code never appears in any API response.
- **Mock provider (`SMS_PROVIDER=mock`):** prints the code to the server console with a masked phone number. It **refuses to run when `NODE_ENV=production`**, so codes can never reach production logs.
- **Production:** set `SMS_PROVIDER=kavenegar`, `SMS_API_KEY` and `SMS_TEMPLATE`. Create a Verify Lookup template in the Kavenegar panel, for example `کد ورود شما به پی‌نو: %token`. The adapter is in `src/server/sms/kavenegar-provider.ts`.
- **Another gateway:** implement the `SmsProvider` interface (`sendOtp(phoneNumber, code)`) and register it in `src/server/sms/index.ts`.

## Demo data

`npm run db:seed` refuses to run when `NODE_ENV=production`. It recreates **one** demo user, `09120000000`, with dates relative to today (Tehran time):

| Account | Per installment | State |
| --- | --- | --- |
| اسنپ‌پی · خرید موبایل | ۲٬۳۵۰٬۰۰۰ | 1 paid, **due today**, 3 remaining |
| دیجی‌پی · خرید لپ‌تاپ | ۱٬۸۰۰٬۰۰۰ | 2 paid, **overdue by 2 days**, 4 remaining |
| بانک ملت · وام | ۴٬۲۰۰٬۰۰۰ | 4 paid, next in **5 days**, 8 remaining |
| تارا · لوازم خانگی | ۹۵۰٬۰۰۰ | **completed** (تسویه‌شده) |

To try the admin page locally, add `09120000000` to `ADMIN_PHONE_NUMBERS`.

## Tests

```bash
npm test            # 116 unit + integration tests, no external services needed
npm run test:e2e    # full user journey in a real browser against a real database
```

- **Unit tests** (`tests/unit`) cover Jalali conversion and month boundaries, leap Esfand, schedule generation and day-31 clamping, weekly/biweekly/custom plans, overdue and due-today detection, monthly total/paid/remaining/progress, the next 7 days, next payment, three-month pressure, account completion, reminders, phone normalization, Persian formatting, input validation, redirect safety, analytics property sanitization, and the SMS adapters.
- **Integration tests** (`tests/integration`) run the real migrations on an in-process PostgreSQL ([PGlite](https://pglite.dev)) and cover:
  - OTP hashing, expiry, retry limits, single use, cooldown, per-phone and per-IP rate limits, invalidation of older codes, and signup vs login.
  - Sessions and logout.
  - Account creation, idempotency, editing that keeps paid history, soft delete, mark paid / undo / completion, and dashboard values.
  - **Cross-user authorization:** user B cannot read, pay, undo, edit, delete or configure reminders on user A's account.
- **E2E** (`tests/e2e/primary-flow.spec.ts`, Playwright) starts `next dev` on port 3100 with the mock SMS provider. It reads OTPs from `.e2e/server.log` and walks through: signup → onboarding → empty home → add SnappPay (schedule verified) → add Digipay (activation) → home totals and next 7 days → calendar → mark paid → dashboard update → undo → overdue installment → paying it completes the account → logout → login with a different number format → data still there. It then checks that a second user cannot open the first user's pages by URL, that anonymous visitors are redirected to login, and that normal users get a 404 on `/admin`.
  Run it with `DATABASE_URL` pointing at a migrated database. If Playwright's bundled browser is unavailable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`.

## Deploying to Vercel + Supabase

1. **Supabase:** create a project. Under *Connect*, copy the **Transaction pooler** URI (port 6543) and the **Direct connection** URI (port 5432).
2. **Migrate** from your machine or CI:
   `DATABASE_URL_DIRECT="postgres://…:5432/postgres" npm run db:migrate`
3. **Vercel:** import the repository (framework preset: Next.js, build command `next build`). Set these environment variables:
   - `DATABASE_URL`: the pooler URI (6543). postgres.js already runs with `prepare: false`, which the pooler requires.
   - `SESSION_SECRET`: a long random string.
   - `SMS_PROVIDER=kavenegar`, `SMS_API_KEY`, `SMS_TEMPLATE` (the mock provider is rejected in production).
   - `ADMIN_PHONE_NUMBERS`, `NEXT_PUBLIC_APP_URL`, and optionally `APP_TIMEZONE`.
4. Deploy, then open `/api/health`. It should return `{"status":"ok"}`.
5. Run `npm run db:migrate` again whenever new files appear in `drizzle/`.

The production build needs no runtime secrets. Environment variables are read lazily at request time.

## Product rules & calculations

All money is **integer Toman** (Postgres `bigint`). There is no floating-point arithmetic on money. Due dates are Gregorian `date` values. Jalali is used for display and for month logic only. "Today" is computed in `APP_TIMEZONE` (Tehran), not in the server's UTC.

| Rule | Definition (code) |
| --- | --- |
| Status | `paid` if `paid_at` is set. Otherwise `overdue` if due before today, `dueToday` if due today, else `upcoming`. Derived, never stored (`src/domain/status.ts`). |
| Monthly schedule | The Jalali day of the first due date is the anchor. Each later month uses the anchor day, clamped to the month's last day, and never drifts. Example: 31 Shahrivar → 30 Mehr → … → 29 Esfand → 31 Farvardin (`src/domain/schedule.ts`). |
| Weekly / biweekly / custom | +7, +14 or +N days |
| Current month | Installments due in the current **Jalali** month, including those of completed accounts. Progress = paid ÷ total. It is 0 when nothing is due, never shows 100% before everything is paid, and never shows 0% once something is paid. |
| Next 7 days | Unpaid installments due from today through today + 7. Overdue items are excluded. |
| Overdue | Unpaid installments due before today. They get their own section and are never shown as "next payment". |
| Next payment | The nearest unpaid installment due today or later |
| Total active debt | Sum of unpaid installments of active accounts |
| Three months | Scheduled totals for the current month and the next two, with the peak month named. This is a factual view, not advice. |
| Completion | When no unpaid installments remain, the account becomes `completed`. Undo reopens it. |
| Editing | Only **unpaid** installments are regenerated. Paid history is never changed. |
| Delete | Soft delete: `deleted_at` is set and status becomes `archived`. The account disappears from every view. |
| Activation | A user with ≥ 2 active or completed (non-deleted) credit accounts |

## Analytics & pilot metrics

Events are stored in `analytics_events` through `src/server/services/analytics-service.ts`. `setAnalyticsSink()` lets you plug in PostHog or Mixpanel later.

Events: `login_started`, `otp_requested`, `otp_verified`, `signup_completed`, `login_completed`, `onboarding_completed`, `add_installment_started`, `provider_selected`, `installment_creation_completed`, `credit_account_created`, `credit_account_edited`, `credit_account_deleted`, `credit_account_opened`, `installment_marked_paid`, `installment_payment_undone`, `calendar_opened`, `overdue_installment_seen`, `reminder_changed`, `logout`, plus `app_opened`, a visit marker throttled to one per 30 minutes that powers active-user and retention metrics.

Properties hold only slugs, counts and booleans. They never contain amounts, phone numbers, titles or custom names. Browser-reported events are allow-listed and their properties are sanitized on the server.

`/admin` shows aggregate numbers only:
- **Funnel:** total users, users with ≥ 1 account, activated users.
- **Accounts:** total accounts, average accounts per activated user.
- **Usage:** total installments, installments marked paid, calendar and overdue usage.
- **Activity:** active users over 7 and 30 days, day-7 and day-30 retention.

## Security & privacy

- Data isolation is enforced in SQL. Every credit-account and installment query is filtered by the session user and excludes soft-deleted rows. Invalid IDs return 404. Integration and e2e tests prove the isolation.
- Server Actions get Next.js's built-in Origin/CSRF checks. Cookies are `HttpOnly` and `SameSite=Lax`.
- OTPs and IP addresses are stored only as HMACs. Session tokens are stored only as SHA-256 hashes.
- Logs never contain OTPs in production, full phone numbers or financial values. Users see Persian error messages, never raw backend errors.
- Security headers are set: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`.
- The admin page shows aggregates only and returns 404 for anyone not listed in `ADMIN_PHONE_NUMBERS`.

## Known MVP limitations

- **Reminders are in-app only.** Settings are stored and reminders appear on Home, but no push notification or SMS is delivered yet. The UI says so.
- No provider or bank integrations. All data is entered manually (`source = 'manual'`).
- Editing regenerates the remaining schedule at the plan level. Individual unpaid installments cannot yet be edited one by one.
- Every installment in a plan has the same amount. Irregular plans need to be split into separate accounts or edited later.
- There is no account deletion or data export for users yet.
- Rate limiting uses the database (fine for a pilot). Under heavy traffic, move it to Redis or Upstash.
- Only light mode is available.

## Future architecture

- `src/server/integrations/provider-adapter.ts` defines the `ProviderAdapter` contract: `getAccounts`, `getOutstandingDebt`, `getInstallmentSchedule`, `createPayment`, `getPaymentStatus` and `sync`. Accounts imported by an adapter would use `source = 'provider_api' | 'bank_api' | 'import'` and flow through the same dashboard and calendar logic.
- Notification delivery (Web Push or SMS) can read `reminder_preferences` and the pure `dueReminders()` function from a scheduled job (for example, Vercel Cron).
- Analytics can move to a product-analytics tool by swapping the sink.
