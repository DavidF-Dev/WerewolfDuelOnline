import { defineConfig, devices } from '@playwright/test';
import { PORTS } from './e2e/ports.js';

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'online.spec.ts',
  grep: /@parity/,
  globalSetup: './e2e/workerd-referee.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORTS.parityApp}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORTS.parityApp} --strictPort`,
    url: `http://localhost:${PORTS.parityApp}`,
    env: { VITE_REFEREE_URL: `http://127.0.0.1:${PORTS.parityReferee}` },
    // A server already on this port may name another referee.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
