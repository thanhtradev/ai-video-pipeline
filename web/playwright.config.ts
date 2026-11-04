import { defineConfig, devices } from '@playwright/test';

// The specs start their own service against the local docker-compose.test.yml database. Needs
// `npm run infra:up` and `npm run build -w web` first.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
