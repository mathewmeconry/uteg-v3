import { defineConfig } from 'vitest/config';
import { testDatabaseUrl } from './app/tests/database';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // Test files share one database.
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: ['app/tests/globalSetup.ts'],
    setupFiles: ['vitest.setup.ts'],
    env: { DATABASE_URL: testDatabaseUrl },
    coverage: {
      provider: 'v8',
      include: ['app/**/*.{ts,tsx}'],
      exclude: ['app/**/*.test.{ts,tsx}', 'app/generated/**', 'app/components/ui/**'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'node', environment: 'node', include: ['app/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'jsdom', environment: 'jsdom', include: ['app/**/*.test.tsx'] },
      },
    ],
  },
});
