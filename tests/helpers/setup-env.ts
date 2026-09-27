// Deterministic, non-secret configuration for tests.
process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-characters-long!!';
process.env.SMS_PROVIDER ??= 'mock';
process.env.APP_TIMEZONE ??= 'Asia/Tehran';
