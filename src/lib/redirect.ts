/**
 * Only allow same-origin, path-only redirects after login (prevents open
 * redirects such as `?next=//evil.example`).
 */
export function safeRedirectPath(next: unknown, fallback = '/'): string {
  if (typeof next !== 'string' || next.length > 512) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  if (/[\s\u0000-\u001f]/.test(next)) return fallback;
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return fallback;
  return next;
}
