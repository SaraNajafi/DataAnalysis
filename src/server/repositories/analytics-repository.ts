import 'server-only';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { analyticsEvents } from '../db/schema';

export async function insertAnalyticsEvent(
  db: Database,
  values: { userId: string | null; eventName: string; properties: Record<string, unknown> },
): Promise<void> {
  await db.insert(analyticsEvents).values(values);
}

export interface PilotMetrics {
  totalUsers: number;
  usersWithAccount: number;
  activatedUsers: number;
  totalCreditAccounts: number;
  avgAccountsPerActivatedUser: number;
  avgAccountsPerUserWithAccount: number;
  totalInstallments: number;
  installmentsMarkedPaid: number;
  activeUsers7d: number;
  activeUsers30d: number;
  day7Eligible: number;
  day7Retained: number;
  day30Eligible: number;
  day30Retained: number;
  calendarUsers: number;
  overdueSeenUsers: number;
  paymentMarkers: number;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aggregate-only pilot metrics. No per-user rows, phone numbers, amounts or
 * schedules are returned.
 *
 * Definitions:
 * - Activated user: ≥ 2 credit accounts that are active or completed (not deleted).
 * - Active user (N days): any analytics event in the last N days.
 * - Day-N retention: among users who signed up ≥ N days ago, the share with
 *   any activity on or after day N after signup.
 */
export async function queryPilotMetrics(db: Database, now: Date): Promise<PilotMetrics> {
  const nowIso = now.toISOString();
  const result = await db.execute(sql`
    WITH account_counts AS (
      SELECT user_id, count(*)::int AS n
      FROM credit_accounts
      WHERE deleted_at IS NULL AND status IN ('active', 'completed')
      GROUP BY user_id
    ),
    activity AS (
      SELECT user_id, created_at FROM analytics_events WHERE user_id IS NOT NULL
    )
    SELECT
      (SELECT count(*) FROM users) AS total_users,
      (SELECT count(*) FROM account_counts WHERE n >= 1) AS users_with_account,
      (SELECT count(*) FROM account_counts WHERE n >= 2) AS activated_users,
      (SELECT coalesce(sum(n), 0) FROM account_counts) AS total_credit_accounts,
      (SELECT coalesce(avg(n), 0) FROM account_counts WHERE n >= 2) AS avg_accounts_activated,
      (SELECT coalesce(avg(n), 0) FROM account_counts WHERE n >= 1) AS avg_accounts_with_account,
      (SELECT count(*) FROM installments i JOIN credit_accounts c ON c.id = i.credit_account_id
         WHERE c.deleted_at IS NULL) AS total_installments,
      (SELECT count(*) FROM installments i JOIN credit_accounts c ON c.id = i.credit_account_id
         WHERE c.deleted_at IS NULL AND i.paid_at IS NOT NULL) AS installments_paid,
      (SELECT count(DISTINCT user_id) FROM activity
         WHERE created_at >= ${nowIso}::timestamptz - interval '7 days') AS active_7d,
      (SELECT count(DISTINCT user_id) FROM activity
         WHERE created_at >= ${nowIso}::timestamptz - interval '30 days') AS active_30d,
      (SELECT count(*) FROM users WHERE created_at <= ${nowIso}::timestamptz - interval '7 days') AS d7_eligible,
      (SELECT count(*) FROM users u WHERE u.created_at <= ${nowIso}::timestamptz - interval '7 days'
         AND EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id
                     AND a.created_at >= u.created_at + interval '7 days')) AS d7_retained,
      (SELECT count(*) FROM users WHERE created_at <= ${nowIso}::timestamptz - interval '30 days') AS d30_eligible,
      (SELECT count(*) FROM users u WHERE u.created_at <= ${nowIso}::timestamptz - interval '30 days'
         AND EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id
                     AND a.created_at >= u.created_at + interval '30 days')) AS d30_retained,
      (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event_name = 'calendar_opened') AS calendar_users,
      (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event_name = 'overdue_installment_seen') AS overdue_seen_users,
      (SELECT count(DISTINCT user_id) FROM analytics_events WHERE event_name = 'installment_marked_paid') AS payment_markers
  `);
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;
  const r = rows[0] ?? {};
  return {
    totalUsers: num(r.total_users),
    usersWithAccount: num(r.users_with_account),
    activatedUsers: num(r.activated_users),
    totalCreditAccounts: num(r.total_credit_accounts),
    avgAccountsPerActivatedUser: num(r.avg_accounts_activated),
    avgAccountsPerUserWithAccount: num(r.avg_accounts_with_account),
    totalInstallments: num(r.total_installments),
    installmentsMarkedPaid: num(r.installments_paid),
    activeUsers7d: num(r.active_7d),
    activeUsers30d: num(r.active_30d),
    day7Eligible: num(r.d7_eligible),
    day7Retained: num(r.d7_retained),
    day30Eligible: num(r.d30_eligible),
    day30Retained: num(r.d30_retained),
    calendarUsers: num(r.calendar_users),
    overdueSeenUsers: num(r.overdue_seen_users),
    paymentMarkers: num(r.payment_markers),
  };
}
