/** Shared by the proxy (optimistic check) and the session layer. No server-only imports here. */
export const SESSION_COOKIE_NAME = 'peyno_session';

/** Routes that never require a session. Everything else under the app is protected. */
export const PUBLIC_PATHS = ['/login'] as const;
