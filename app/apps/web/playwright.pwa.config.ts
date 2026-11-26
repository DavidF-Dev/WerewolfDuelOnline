import { defineConfig, devices } from '@playwright/test';
import { PORTS } from './e2e/ports.js';

const OUT_DIR = 'dist/e2e-pwa';

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'pwa.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORTS.pwaApp}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Service workers need a production build, which the dev server does not serve.
    command: `node scripts/check-ja-fonts.mjs && pnpm exec vite build --outDir ${OUT_DIR} --emptyOutDir && pnpm exec vite preview --outDir ${OUT_DIR} --port ${PORTS.pwaApp} --strictPort`,
    url: `http://localhost:${PORTS.pwaApp}`,
    env: { VITE_REFEREE_URL: `http://127.0.0.1:${PORTS.pwaReferee}` },
    // A server already on this port may be serving another build.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
