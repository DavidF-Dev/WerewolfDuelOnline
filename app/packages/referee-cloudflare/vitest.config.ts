import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], silent: 'passed-only' },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { ALLOWED_ORIGINS: 'https://play.example.com', TEST_OVERRIDES: '1' },
      },
    }),
  ],
});
