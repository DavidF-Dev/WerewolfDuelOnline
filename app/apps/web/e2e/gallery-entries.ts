import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * Every gallery entry's id, in the gallery's order, read from its source so that each entry can
 * have its own test; `expectGalleryEntries` checks the list against the running gallery.
 */
export const GALLERY_ENTRIES: readonly string[] = Array.from(
  readFileSync(new URL('../src/gallery/entries.ts', import.meta.url), 'utf8').matchAll(
    /^\s*(?:\{ )?id: '([a-z0-9-]+)',/gm,
  ),
  (match) => match[1]!,
);

/** The languages the layout, robustness, wide-screen and accessibility checks run in. */
export const LANGUAGES = ['en', 'de', 'ja'] as const;
/** A real language, or the lengthened pseudo-locale that only the overflow and scrolling checks use. */
export type Language = (typeof LANGUAGES)[number] | 'pseudo';
/** The tag of tests run in the pseudo-locale, so that CI can run them as a step of their own. */
export const PSEUDO_TAG = '@pseudo';

/** The gallery query that shows an entry in `lang`, with `query` after it. */
export function inLanguage(lang: Language, query = ''): string {
  return [lang === 'en' ? '' : `lang=${lang}`, query].filter((part) => part !== '').join('&');
}

/** Every language the overflow and scrolling checks run in: the real ones and the pseudo-locale. */
export const OVERFLOW_LANGUAGES: readonly Language[] = [...LANGUAGES, 'pseudo'];

/** `title` for a test run in `lang`: unchanged for English, else with the language after it. */
export function inLanguageTitle(title: string, lang: Language): string {
  return lang === 'en' ? title : `${title} (${lang})`;
}

/** The details of a test run in `lang`: a pseudo-locale run carries `PSEUDO_TAG`. */
export function languageDetails(lang: Language): { tag?: string } {
  return lang === 'pseudo' ? { tag: PSEUDO_TAG } : {};
}

/** Checks that `GALLERY_ENTRIES` names the running gallery's entries, in its order. */
export async function expectGalleryEntries(page: Page): Promise<void> {
  await page.goto('/#/dev/gallery');
  await page.locator('[data-entry]').first().waitFor();
  const shown = await page
    .locator('[data-entry]')
    .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['entry'] ?? ''));
  expect(shown).toEqual(GALLERY_ENTRIES);
}

/** Opens a gallery entry and waits until it is ready; `query` follows its id, as in `names=long`. */
export async function openGalleryEntry(page: Page, id: string, query = ''): Promise<void> {
  await page.goto(`/#/dev/gallery/${id}${query === '' ? '' : `?${query}`}`);
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
  const lang = new URLSearchParams(query).get('lang');
  if (lang === 'de' || lang === 'ja') {
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${lang}-`));
  }
}
