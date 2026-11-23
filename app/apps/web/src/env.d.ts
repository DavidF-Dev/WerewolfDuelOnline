/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  /** The default referee URL for online games. */
  readonly VITE_REFEREE_URL?: string;
}

/** The app version from its package file, injected at build time. */
declare const __APP_VERSION__: string;
