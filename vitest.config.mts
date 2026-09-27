import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // `server-only` throws when imported outside a React Server environment.
      'server-only': path.resolve(import.meta.dirname, 'tests/helpers/server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/helpers/setup-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration tests each spin up an in-process PGlite database.
    pool: 'forks',
  },
});
