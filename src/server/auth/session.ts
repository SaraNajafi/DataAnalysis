import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { isAdminPhone, isProduction } from '../config';
import type { Session, User } from '../db/schema';
import { validateSessionToken } from '../services/session-service';
import { SESSION_COOKIE_NAME } from './constants';

/**
 * Data Access Layer for authentication. Every protected page, server action
 * and route handler derives the current user from here — never from a
 * client-supplied user id.
 */

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

/** Memoized per request. Returns null when there is no valid, unexpired session. */
export const getCurrentSession = cache(async (): Promise<{ session: Session; user: User } | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
});

/** Redirects to /login when not authenticated. */
export async function requireUser(): Promise<User> {
  const current = await getCurrentSession();
  if (!current) redirect('/login');
  return current.user;
}

/** Like requireUser, but also sends first-time users through onboarding. */
export async function requireOnboardedUser(): Promise<User> {
  const user = await requireUser();
  if (!user.onboardingCompletedAt) redirect('/onboarding');
  return user;
}

/** Admin pages 404 for everyone not listed in ADMIN_PHONE_NUMBERS. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!isAdminPhone(user.phoneNumber)) notFound();
  return user;
}
