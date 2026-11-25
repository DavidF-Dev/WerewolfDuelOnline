import { DEFAULT_SETTINGS, type Settings } from './settings.js';

/** The settings that change how the table is drawn and played, shared with every component. */
export type DisplaySettings = Pick<
  Settings,
  | 'colourBlindPatterns'
  | 'cardText'
  | 'rulesHints'
  | 'confirmPlan'
  | 'showdownSpeed'
  | 'haptics'
  | 'reducedMotion'
>;

export const display: DisplaySettings = $state({
  colourBlindPatterns: DEFAULT_SETTINGS.colourBlindPatterns,
  cardText: DEFAULT_SETTINGS.cardText,
  rulesHints: DEFAULT_SETTINGS.rulesHints,
  confirmPlan: DEFAULT_SETTINGS.confirmPlan,
  showdownSpeed: DEFAULT_SETTINGS.showdownSpeed,
  haptics: DEFAULT_SETTINGS.haptics,
  reducedMotion: DEFAULT_SETTINGS.reducedMotion,
});

/** What the operating system asks for, as last read when the settings were applied. */
export const system: { reducedMotion: boolean } = $state({ reducedMotion: false });

export function setDisplaySettings(settings: DisplaySettings): void {
  display.colourBlindPatterns = settings.colourBlindPatterns;
  display.cardText = settings.cardText;
  display.rulesHints = settings.rulesHints;
  display.confirmPlan = settings.confirmPlan;
  display.showdownSpeed = settings.showdownSpeed;
  display.haptics = settings.haptics;
  display.reducedMotion = settings.reducedMotion;
}
