import 'server-only';
import { getDb } from '../db/client';
import { insertAnalyticsEvent } from '../repositories/analytics-repository';

/**
 * Lightweight product analytics. Events are stored in the `analytics_events`
 * table; a different sink (PostHog, Mixpanel, …) can be plugged in via
 * `setAnalyticsSink` without touching call sites.
 *
 * PRIVACY: never put amounts, phone numbers, titles or custom provider names
 * into event properties. Use counts, slugs and booleans only.
 */
export const ANALYTICS_EVENTS = [
  'login_started',
  'otp_requested',
  'otp_verified',
  'signup_completed',
  'login_completed',
  'onboarding_completed',
  'add_installment_started',
  'provider_selected',
  'installment_creation_completed',
  'credit_account_created',
  'credit_account_edited',
  'credit_account_deleted',
  'credit_account_opened',
  'installment_marked_paid',
  'installment_payment_undone',
  'calendar_opened',
  'overdue_installment_seen',
  'reminder_changed',
  'logout',
  // Session-level "visit" marker used for active-user and retention metrics.
  'app_opened',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsEventInput {
  name: AnalyticsEventName;
  userId: string | null;
  properties: Record<string, unknown>;
}

export interface AnalyticsSink {
  capture(event: AnalyticsEventInput): Promise<void>;
}

const databaseSink: AnalyticsSink = {
  async capture(event) {
    await insertAnalyticsEvent(getDb(), {
      userId: event.userId,
      eventName: event.name,
      properties: event.properties,
    });
  },
};

let sink: AnalyticsSink = databaseSink;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next ?? databaseSink;
}

/** Records an event. Never throws — analytics must not break product flows. */
export async function track(
  name: AnalyticsEventName,
  options: { userId?: string | null; properties?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await sink.capture({ name, userId: options.userId ?? null, properties: options.properties ?? {} });
  } catch (error) {
    console.error(`[analytics] failed to record "${name}"`, error instanceof Error ? error.message : 'unknown error');
  }
}

/** Events the browser may report (always attributed to the session user). */
export const CLIENT_EVENTS = [
  'add_installment_started',
  'provider_selected',
  'calendar_opened',
  'credit_account_opened',
  'overdue_installment_seen',
] as const satisfies readonly AnalyticsEventName[];

export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export function isClientEventName(value: unknown): value is ClientEventName {
  return typeof value === 'string' && (CLIENT_EVENTS as readonly string[]).includes(value);
}

const SLUG_RE = /^[a-z0-9-]{1,32}$/;

/** Whitelists properties per client event so the browser can't store arbitrary data. */
export function sanitizeClientEventProperties(name: ClientEventName, raw: unknown): Record<string, unknown> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  switch (name) {
    case 'provider_selected':
      return typeof input.provider === 'string' && SLUG_RE.test(input.provider) ? { provider: input.provider } : {};
    case 'overdue_installment_seen': {
      const count = Number(input.count);
      return Number.isInteger(count) && count >= 0 && count < 10_000 ? { count } : {};
    }
    case 'add_installment_started':
      return typeof input.source === 'string' && SLUG_RE.test(input.source) ? { source: input.source } : {};
    default:
      return {};
  }
}
