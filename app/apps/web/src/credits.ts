import theme from './themes/placeholder/theme.json';

export interface Credit {
  name: string;
  licence: string;
}

/** A legal notice, kept as written in every language. */
export const COPYRIGHT = '© 2026 David F Dev';

export const OFL = 'SIL Open Font License 1.1';

export const FONT_CREDITS: readonly Credit[] = [
  { name: 'Atkinson Hyperlegible Next', licence: OFL },
  { name: 'Lexend', licence: OFL },
  { name: 'Marcellus', licence: OFL },
  { name: 'OpenDyslexic', licence: OFL },
];

// Add each further bundled package here when it is installed.
export const SOFTWARE_CREDITS: readonly Credit[] = [
  { name: 'Engine and app', licence: 'MIT OR Apache-2.0' },
  { name: 'idb', licence: 'ISC' },
  { name: 'uqr', licence: 'MIT' },
  { name: 'vite-plugin-pwa', licence: 'MIT' },
  { name: 'Workbox', licence: 'MIT' },
];

/** The placeholder theme's artwork credits. */
export const THEME_CREDITS: readonly string[] = theme.credits;
