import { expect, test, type Page } from '@playwright/test';
import { openGalleryEntry } from './gallery-entries.js';

const JAPANESE_FONT = /biz-udpgothic|shippori-mincho/i;

/** The families of the faces the page has loaded. */
const loadedFamilies = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const families: string[] = [];
    document.fonts.forEach((face) => {
      if (face.status === 'loaded')
        families.push(`${face.family.replaceAll('"', '')} ${face.weight}`);
    });
    return families;
  });

test('Japanese fonts load only when Japanese is active', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') requested.push(request.url());
  });
  for (const lang of ['en', 'de']) {
    for (const id of ['home', 'table-plan', 'how-to-play', 'rules-characters']) {
      await page.goto('about:blank');
      await openGalleryEntry(page, id, `lang=${lang}`);
      expect(await loadedFamilies(page), `${id} in ${lang}`).not.toContainEqual(
        expect.stringMatching(/BIZ UDPGothic|Shippori/),
      );
    }
  }
  expect(requested.filter((url) => JAPANESE_FONT.test(url))).toEqual([]);

  await page.goto('about:blank');
  await openGalleryEntry(page, 'table-plan', 'lang=ja');
  await expect
    .poll(() => loadedFamilies(page))
    .toEqual(
      expect.arrayContaining(['BIZ UDPGothic 400', 'BIZ UDPGothic 700', 'Shippori Mincho B1 700']),
    );
  expect(requested.filter((url) => JAPANESE_FONT.test(url))).toHaveLength(3);
  const families = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    heading: getComputedStyle(document.querySelector('h1, h2')!).fontFamily,
    wordBreak: getComputedStyle(document.body).wordBreak,
    synthesis: getComputedStyle(document.body).fontSynthesisWeight,
  }));
  expect(families.body).toMatch(/^"?BIZ UDPGothic/);
  expect(families.heading).toMatch(/^"?Shippori Mincho B1/);
  expect(families.wordBreak).toBe('auto-phrase');
  expect(families.synthesis, 'no faux bold').toBe('none');
});
