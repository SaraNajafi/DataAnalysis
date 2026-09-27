import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests of the primary product flow against a real dev server and
 * a real PostgreSQL database (DATABASE_URL from .env.local / env).
 * The mock SMS provider prints OTPs to the server console; the harness writes
 * that output to .e2e/server.log, which the tests read to log in.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    locale: 'fa-IR',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: `mkdir -p .e2e && npx next dev -p ${PORT} > .e2e/server.log 2>&1`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { SMS_PROVIDER: 'mock', OTP_MAX_PER_IP_PER_HOUR: '1000' },
  },
});
