import { defineConfig, devices } from '@playwright/test';
import { PORTS } from './e2e/ports.js';

export default defineConfig({
  testDir: 'e2e',
  testMatch: [
    'online.spec.ts',
    'showdown-online.spec.ts',
    'pause.spec.ts',
    'history.spec.ts',
    'a11y.spec.ts',
  ],
  globalSetup: './e2e/node-referee.ts',
  fullyParallel: true,
  // Tests drive two or more pages through whole games, so one worker per core overloads a local machine.
  workers: process.env.CI ? undefined : 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORTS.onlineApp}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORTS.onlineApp} --strictPort`,
    url: `http://localhost:${PORTS.onlineApp}`,
    env: { VITE_REFEREE_URL: `http://127.0.0.1:${PORTS.onlineReferee}` },
    // A server already on this port may name another referee.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
