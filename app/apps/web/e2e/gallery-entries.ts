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
}
