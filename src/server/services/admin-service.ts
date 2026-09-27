import 'server-only';
import { getDb } from '../db/client';
import { queryPilotMetrics, type PilotMetrics } from '../repositories/analytics-repository';

export type { PilotMetrics };

/** Aggregate pilot metrics for the internal admin page (no personal data). */
export async function getPilotMetrics(now: Date = new Date()): Promise<PilotMetrics> {
  return queryPilotMetrics(getDb(), now);
}
