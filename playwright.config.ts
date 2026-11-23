import { defineConfig, devices } from '@playwright/test';
import { testDatabaseServer } from './app/tests/database';

const PORT = Number(process.env.E2E_PORT || 5299);
// Another port gets another database, so runs at the same time do not empty each other's.
const DATABASE = `uteg_test_e2e_${PORT}`;
const url = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  // One long competition, its steps build on each other.
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: url,
    locale: 'de-CH',
    actionTimeout: 10_000,
    trace: 'retain-on-failure',
  },
  webServer: {
    // The app as it is deployed, with an empty database.
    command:
      'node --import tsx e2e/prepare.ts && pnpm build && react-router-serve ./build/server/index.js',
    url: `${url}/healthz`,
    timeout: 3 * 60_000,
    env: {
      PORT: String(PORT),
      APP_URL: url,
      TEST_DB_NAME: DATABASE,
      DATABASE_URL: `${testDatabaseServer}/${DATABASE}`,
      BETTER_AUTH_SECRET: 'only-used-for-end-to-end-tests-0123456789',
    },
  },
});
