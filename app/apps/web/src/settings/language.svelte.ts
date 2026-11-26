import {
  LOCALES,
  createLocaliser,
  isLocaleLoaded,
  loadLocale,
  type Locale,
  type Localiser,
} from '@wwd/client-core';
import { loadFont } from '../theme/fonts.js';
import type { Settings } from './settings.js';

/** Each language's name, as it is written in that language. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  de: 'Deutsch',
  ja: '日本語',
};

const isLocale = (value: string): value is Locale => LOCALES.some((locale) => locale === value);

/** The language the setting asks for: for System, the first of the browser's languages offered. */
export function resolveLanguage(
  setting: Settings['language'],
  navigatorLanguages: readonly string[],
): Locale {
  if (setting !== 'system') return setting;
  for (const tag of navigatorLanguages) {
    const language = tag.split('-')[0]?.toLowerCase() ?? '';
    if (isLocale(language)) return language;
  }
  return 'en';
}

/** The browser's preferred languages, most preferred first. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages !== undefined && navigator.languages.length > 0)
    return navigator.languages;
  return navigator.language === undefined ? [] : [navigator.language];
}

const localisers = new Map<Locale, Localiser>();

/** `locale`'s localiser, once its text has loaded. */
function localiserFor(locale: Locale): Localiser | undefined {
  let localiser = localisers.get(locale);
  if (localiser === undefined && isLocaleLoaded(locale)) {
    localiser = createLocaliser(locale);
    localisers.set(locale, localiser);
  }
  return localiser;
}

let active = $state.raw(localiserFor('en')!);

/** The localiser every screen formats its text with; reading it in a component follows changes. */
export const activeLocaliser = (): Localiser => active;

/** Makes `localiser` the active one, with `root`'s language and the page title following it. */
export function useLocaliser(localiser: Localiser, root: HTMLElement): void {
  active = localiser;
  root.lang = localiser.locale;
  if (typeof document !== 'undefined') document.title = localiser.t('app-title');
}

/** The language asked for last, and its load while its text is not in yet. */
let wanted: Locale = 'en';
let settled: Promise<void> = Promise.resolve();

/**
 * Makes the language the setting asks for the active one. A language whose text has not loaded
 * becomes active once it has; until then the active one stays, and a failed load keeps it.
 */
export function applyLanguage(setting: Settings['language'], root: HTMLElement): void {
  const locale = resolveLanguage(setting, browserLanguages());
  wanted = locale;
  if (locale === 'ja') void loadFont('japanese');
  const localiser = localiserFor(locale);
  if (localiser !== undefined) {
    useLocaliser(localiser, root);
    settled = Promise.resolve();
    return;
  }
  settled = loadLocale(locale).then(
    () => {
      if (wanted === locale) useLocaliser(localiserFor(locale)!, root);
    },
    () => undefined,
  );
}

/** Resolves once the language asked for last is active, or has failed to load. */
export const languageSettled = (): Promise<void> => settled;
