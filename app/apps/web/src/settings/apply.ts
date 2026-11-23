import { loadReadingFont } from '../theme/fonts.js';
import { setDisplaySettings, system } from './display.svelte.js';
import { clampTextSize, type Settings } from './settings.js';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Whether motion is reduced under the `setting`, using the system preference last read by `applySettings`. */
export const motionReduced = (setting: Settings['reducedMotion']): boolean =>
  setting === 'on' || (setting === 'system' && system.reducedMotion);

let applied: { settings: Settings; root: HTMLElement } | undefined;

/**
 * Reflects the settings onto attributes and a variable of `root` for the stylesheet to read,
 * shares the table settings with the components, and loads a chosen reading font.
 */
export function applySettings(settings: Settings, root: HTMLElement): void {
  applied = { settings, root };
  system.reducedMotion = matches(REDUCED_MOTION_QUERY);
  const systemTheme = matches(DARK_QUERY) ? 'dark' : 'light';
  root.setAttribute('data-theme', settings.theme === 'system' ? systemTheme : settings.theme);

  if (settings.highContrast) root.setAttribute('data-contrast', 'high');
  else root.removeAttribute('data-contrast');

  if (motionReduced(settings.reducedMotion)) root.setAttribute('data-motion', 'reduce');
  else root.removeAttribute('data-motion');

  root.setAttribute('data-font', settings.readingFont);
  void loadReadingFont(settings.readingFont);

  if (settings.extraSpacing) root.setAttribute('data-spacing', 'extra');
  else root.removeAttribute('data-spacing');

  root.style.setProperty('--text-scale', String(clampTextSize(settings.textSize) / 100));

  setDisplaySettings(settings);
}

/**
 * Re-applies the settings last applied whenever the system's colour scheme or motion preference
 * changes, so the System choices follow it; returns a function that stops watching.
 */
export function watchSystemPreferences(): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const reapply = (): void => {
    if (applied !== undefined) applySettings(applied.settings, applied.root);
  };
  const lists = [DARK_QUERY, REDUCED_MOTION_QUERY].map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener('change', reapply);
  return () => {
    for (const list of lists) list.removeEventListener('change', reapply);
  };
}
