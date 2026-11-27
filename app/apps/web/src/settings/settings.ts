import { LOCALES, type Locale } from '@wwd/client-core';

/** The text sizes offered, as percentages. */
export const TEXT_SIZES = [90, 100, 125, 150] as const;

export interface Settings {
  language: 'system' | Locale;
  theme: 'system' | 'light' | 'dark';
  highContrast: boolean;
  /** A percentage, one of `TEXT_SIZES`. */
  textSize: number;
  readingFont: 'default' | 'lexend' | 'opendyslexic';
  extraSpacing: boolean;
  cardText: 'icons-and-text' | 'text-only';
  colourBlindPatterns: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  showdownSpeed: 'step' | 'auto' | 'instant';
  haptics: boolean;
  confirmPlan: boolean;
  rulesHints: boolean;
  /** The referee URL for online games; null uses the default. */
  server: string | null;
  installCardDismissed: boolean;
  firstGameFinished: boolean;
  tutorialFinished: boolean;
  newcomerCardDismissed: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  language: 'system',
  theme: 'system',
  highContrast: false,
  textSize: 100,
  readingFont: 'default',
  extraSpacing: false,
  cardText: 'icons-and-text',
  colourBlindPatterns: false,
  reducedMotion: 'system',
  showdownSpeed: 'step',
  haptics: false,
  confirmPlan: true,
  rulesHints: true,
  server: null,
  installCardDismissed: false,
  firstGameFinished: false,
  tutorialFinished: false,
  newcomerCardDismissed: false,
};

/** The offered text size nearest to `size`, the smaller one on a tie. */
export function nearestTextSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SETTINGS.textSize;
  return TEXT_SIZES.reduce<number>(
    (best, preset) => (Math.abs(preset - size) < Math.abs(best - size) ? preset : best),
    TEXT_SIZES[0],
  );
}

/**
 * Fills any missing settings with defaults, drops keys that are no longer settings and moves the
 * text size to the nearest offered one, so older records stay usable.
 */
export function normaliseSettings(stored: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS } as Record<keyof Settings, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = stored?.[key];
    if (value !== undefined) merged[key] = value;
  }
  const settings = merged as Settings;
  const language = [...LOCALES, 'system'].includes(settings.language)
    ? settings.language
    : DEFAULT_SETTINGS.language;
  return { ...settings, language, textSize: nearestTextSize(settings.textSize) };
}
