import { readFileSync } from 'node:fs';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/** The public path the app is served from, from `BASE_PATH` (such as `/repo`), or `/`. */
function basePath(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

/** The Moonlit app bar colour, which the installed app's title bar and splash screen use. */
const THEME_COLOUR = '#1f2a44';

export default defineConfig({
  base: basePath(process.env.BASE_PATH),
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    svelte(),
    svelteTesting(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Werewolf: Duel! Online',
        short_name: 'Werewolf Duel',
        description: 'An unofficial digital version of the two-player card game Werewolf: Duel!',
        lang: 'en-GB',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: THEME_COLOUR,
        background_color: THEME_COLOUR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{html,js,css,wasm}',
          'assets/atkinson-hyperlegible-next-latin-{400,700}-normal-*.woff2',
          'assets/cinzel-latin-700-normal-*.woff2',
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/rooms(\/|$)/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The reading fonts chosen in Settings, cached when first used.
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'reading-fonts',
              expiration: { maxEntries: 16 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
