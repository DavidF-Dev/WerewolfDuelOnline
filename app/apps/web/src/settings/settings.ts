export const TEXT_SIZE_MIN = 90;
export const TEXT_SIZE_MAX = 150;
export const TEXT_SIZE_STEP = 10;

export interface Settings {
  language: 'system' | 'en';
  theme: 'system' | 'light' | 'dark';
  highContrast: boolean;
  /** A percentage from 90 to 150. */
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
  deductionAutoMark: boolean;
  /** The referee URL for online games; null uses the default. */
  server: string | null;
  installCardDismissed: boolean;
  firstGameFinished: boolean;
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
  deductionAutoMark: true,
  server: null,
  installCardDismissed: false,
  firstGameFinished: false,
};

export function clampTextSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_SETTINGS.textSize;
  return Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, size));
}

/** Fills any missing settings with defaults and clamps the text size, so older records stay usable. */
export function normaliseSettings(stored: Partial<Settings> | undefined): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...stored };
  return { ...merged, textSize: clampTextSize(merged.textSize) };
}
