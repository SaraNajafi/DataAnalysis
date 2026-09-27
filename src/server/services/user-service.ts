import 'server-only';
import { getDb } from '../db/client';
import { markOnboardingCompleted } from '../repositories/user-repository';
import { track } from './analytics-service';

export async function completeOnboarding(userId: string, now: Date = new Date()): Promise<void> {
  await markOnboardingCompleted(getDb(), userId, now);
  await track('onboarding_completed', { userId });
}
