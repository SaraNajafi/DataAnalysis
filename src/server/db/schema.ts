/**
 * Database schema (PostgreSQL, via Drizzle ORM).
 *
 * Conventions:
 * - Money: integer Toman in `bigint` columns (mapped to JS number; safe up to 9e15).
 * - Calendar dates (due dates): Postgres `date`, Gregorian, as 'YYYY-MM-DD' strings.
 * - Instants: `timestamptz`.
 * - Installment status (upcoming / dueToday / overdue) is derived, never stored.
 *   Paid ⇔ paid_at IS NOT NULL.
 * - Every credit account belongs to exactly one user; installments belong to a
 *   user only through their credit account. All queries are scoped by the
 *   authenticated user's id in the repository layer.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const providerTypeEnum = pgEnum('provider_type', ['bnpl', 'bank', 'loan', 'other']);
export const creditAccountStatusEnum = pgEnum('credit_account_status', ['active', 'completed', 'archived']);
export const installmentFrequencyEnum = pgEnum('installment_frequency', ['monthly', 'biweekly', 'weekly', 'custom']);
/**
 * Where a credit account's data comes from. The MVP only creates `manual`
 * accounts; the other values are reserved for future integrations.
 */
export const creditAccountSourceEnum = pgEnum('credit_account_source', ['manual', 'provider_api', 'bank_api', 'import']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Normalized E.164, e.g. +989121234567 */
    phoneNumber: text('phone_number').notNull(),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_phone_number_key').on(t.phoneNumber),
    check('users_phone_number_format', sql`${t.phoneNumber} ~ '^\\+989[0-9]{9}$'`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the random session token; the raw token only lives in the cookie. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('sessions_token_hash_key').on(t.tokenHash), index('sessions_user_id_idx').on(t.userId)],
);

export const otpRequests = pgTable(
  'otp_requests',
  {
    id: uuid('id').primaryKey(),
    phoneNumber: text('phone_number').notNull(),
    /** HMAC-SHA256(secret, id:phone:code). The plain code is never stored. */
    otpHash: text('otp_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** Set when a newer code is issued for the same phone number. */
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    /** HMAC of the requester IP (used only for rate limiting). */
    requestIpHash: text('request_ip_hash'),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    index('otp_requests_phone_created_idx').on(t.phoneNumber, t.createdAt),
    index('otp_requests_ip_created_idx').on(t.requestIpHash, t.createdAt),
  ],
);

export const providers = pgTable(
  'providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    type: providerTypeEnum('type').notNull(),
    icon: text('icon'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('providers_slug_key').on(t.slug)],
);

export const creditAccounts = pgTable(
  'credit_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'restrict' }),
    /** Bank name (provider = bank) or organization name (provider = other). */
    customProviderName: text('custom_provider_name'),
    title: text('title'),
    /** Current per-installment amount (Toman) for unpaid installments. */
    installmentAmount: bigint('installment_amount', { mode: 'number' }).notNull(),
    /** Number of installments generated when the plan was created. */
    initialInstallmentCount: integer('initial_installment_count').notNull(),
    /** Cached count of unpaid installments; recomputed in every mutating transaction. */
    remainingInstallments: integer('remaining_installments').notNull(),
    firstDueDate: date('first_due_date', { mode: 'string' }).notNull(),
    frequency: installmentFrequencyEnum('frequency').notNull().default('monthly'),
    customFrequencyDays: integer('custom_frequency_days'),
    /** installmentAmount × initialInstallmentCount at creation time (historical). */
    totalOriginalDebt: bigint('total_original_debt', { mode: 'number' }).notNull(),
    status: creditAccountStatusEnum('status').notNull().default('active'),
    source: creditAccountSourceEnum('source').notNull().default('manual'),
    /** Idempotency key sent by the Add form so double submits create one account. */
    clientRequestId: uuid('client_request_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Soft delete. Deleted accounts are excluded from every query. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('credit_accounts_user_status_idx').on(t.userId, t.status),
    uniqueIndex('credit_accounts_user_client_request_key').on(t.userId, t.clientRequestId),
    check('credit_accounts_amount_positive', sql`${t.installmentAmount} > 0`),
    check('credit_accounts_counts_non_negative', sql`${t.initialInstallmentCount} >= 0 AND ${t.remainingInstallments} >= 0`),
    check(
      'credit_accounts_custom_frequency',
      sql`(${t.frequency} <> 'custom') OR (${t.customFrequencyDays} BETWEEN 1 AND 365)`,
    ),
  ],
);

export const installments = pgTable(
  'installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creditAccountId: uuid('credit_account_id')
      .notNull()
      .references(() => creditAccounts.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    /** Paid ⇔ paid_at IS NOT NULL. */
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('installments_account_due_idx').on(t.creditAccountId, t.dueDate),
    uniqueIndex('installments_account_sequence_key').on(t.creditAccountId, t.sequence),
    check('installments_amount_positive', sql`${t.amount} > 0`),
  ],
);

export const reminderPreferences = pgTable(
  'reminder_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NULL = the user's default; otherwise an override for one credit account. */
    creditAccountId: uuid('credit_account_id').references(() => creditAccounts.id, { onDelete: 'cascade' }),
    /** Advance reminders in days before the due date, e.g. {3,1}. */
    daysBefore: integer('days_before')
      .array()
      .notNull()
      .default(sql`'{1}'::integer[]`),
    dueDateReminder: boolean('due_date_reminder').notNull().default(true),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('reminder_preferences_user_default_key')
      .on(t.userId)
      .where(sql`${t.creditAccountId} IS NULL`),
    uniqueIndex('reminder_preferences_user_account_key')
      .on(t.userId, t.creditAccountId)
      .where(sql`${t.creditAccountId} IS NOT NULL`),
  ],
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventName: text('event_name').notNull(),
    /** Lightweight, non-sensitive properties only (no amounts, no phone numbers). */
    properties: jsonb('properties').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('analytics_events_name_created_idx').on(t.eventName, t.createdAt),
    index('analytics_events_user_created_idx').on(t.userId, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type OtpRequest = typeof otpRequests.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type CreditAccount = typeof creditAccounts.$inferSelect;
export type Installment = typeof installments.$inferSelect;
export type ReminderPreference = typeof reminderPreferences.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
