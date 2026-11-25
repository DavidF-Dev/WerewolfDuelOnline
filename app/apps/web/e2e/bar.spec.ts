import { expect, test, type Page } from '@playwright/test';

interface Alignment {
  title: string;
  /** The face that drew the title, or null when no loaded web font of its family did. */
  face: string | null;
  capCentre: number;
  emblemCentre: number;
  buttonCentres: number[];
}

const READING_FONTS = ['default', 'lexend', 'opendyslexic'] as const;
const TEXT_SCALES = [1, 1.25, 1.5, 2] as const;
const TRIMS = ['text-box', 'fallback'] as const;

/**
 * Where the bar title's cap band (cap height to baseline) and the emblem sit. The baselines
 * come from zero-size probes laid out on the first and last lines; the cap height is the ink
 * ascent of "H" in the title's computed font.
 */
const measureBar = (page: Page): Promise<Alignment | null> =>
  page.evaluate(() => {
    const title = document.querySelector<HTMLElement>('[data-part="bar-title"]');
    const emblem = document.querySelector('[data-part="emblem"]');
    const bar = title?.closest('header');
    if (title === null || emblem === null || bar === null || bar === undefined) return null;
    const style = getComputedStyle(title);
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) throw new Error('no canvas');
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const cap = context.measureText('H').actualBoundingBoxAscent;
    const family =
      style.fontFamily
        .split(',')[0]
        ?.trim()
        .replace(/^["']|["']$/g, '') ?? '';
    let loaded = false;
    document.fonts.forEach((face) => {
      if (face.family.replace(/^["']|["']$/g, '') === family && face.status === 'loaded') {
        loaded = true;
      }
    });
    const probe = (): HTMLElement => {
      const mark = document.createElement('span');
      mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      return mark;
    };
    const first = probe();
    const last = probe();
    title.prepend(first);
    title.append(last);
    const top = first.getBoundingClientRect().bottom - cap;
    const bottom = last.getBoundingClientRect().bottom;
    first.remove();
    last.remove();
    const centre = (box: DOMRect): number => (box.top + box.bottom) / 2;
    return {
      title: title.textContent ?? '',
      face: loaded ? family : null,
      capCentre: (top + bottom) / 2,
      emblemCentre: centre(emblem.getBoundingClientRect()),
      buttonCentres: Array.from(bar.querySelectorAll('button')).map((button) =>
        centre(button.getBoundingClientRect()),
      ),
    };
  });

/** Sets the reading font and text size as the settings would, then waits for layout to settle. */
const setLook = (page: Page, font: (typeof READING_FONTS)[number], scale: number): Promise<void> =>
  page.evaluate(
    async ({ font, scale }) => {
      const root = document.documentElement;
      root.setAttribute('data-font', font);
      root.style.setProperty('--text-scale', String(scale));
      await document.fonts.ready;
      for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
    },
    { font, scale },
  );

/**
 * Takes the page's `@supports (text-box: …)` rules out when `on` is false, so the styles for
 * browsers without text-box trimming apply, and puts them back when it is true; then waits for
 * layout to settle.
 */
const setTextBoxRules = (page: Page, on: boolean): Promise<void> =>
  page.evaluate(async (on) => {
    const held = ((
      window as { __textBoxRules?: Array<[CSSStyleSheet, number, string]> }
    ).__textBoxRules ??= []);
    if (on) {
      for (const [sheet, index, rule] of held.splice(0).reverse()) sheet.insertRule(rule, index);
    } else {
      for (const sheet of Array.from(document.styleSheets)) {
        for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
          const rule = sheet.cssRules[i];
          if (rule instanceof CSSSupportsRule && rule.conditionText.includes('text-box')) {
            held.push([sheet, i, rule.cssText]);
            sheet.deleteRule(i);
          }
        }
      }
      if (held.length === 0) throw new Error('no text-box rules were found');
    }
    for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
  }, on);

test('bar title letters are centred on the emblem', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the bar is the same in every project');
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/#/dev/gallery');
  await page.locator('[data-entry]').first().waitFor();
  // The reading fonts load on demand, as when they are chosen in the settings.
  await page.evaluate(async () => {
    const fonts = (await import(/* @vite-ignore */ '/src/theme/fonts.ts' as string)) as {
      loadReadingFont: (font: string) => Promise<void>;
    };
    await Promise.all([fonts.loadReadingFont('lexend'), fonts.loadReadingFont('opendyslexic')]);
  });
  const ids = await page
    .locator('[data-entry]')
    .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['entry'] ?? ''));
  const faces = new Set<string>();
  let checked = 0;
  let worst = { offset: 0, where: '' };
  for (const id of ids) {
    await page.goto(`/#/dev/gallery/${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
    if ((await measureBar(page)) === null) continue;
    checked += 1;
    for (const font of READING_FONTS) {
      for (const scale of TEXT_SCALES) {
        await setLook(page, font, scale);
        for (const trim of TRIMS) {
          if (trim === 'fallback') await setTextBoxRules(page, false);
          const bar = await measureBar(page);
          if (trim === 'fallback') await setTextBoxRules(page, true);
          if (bar === null) throw new Error(`${id}: the bar went away`);
          const where = `${id} (${bar.title}; ${font}, ${scale * 100} %, ${trim})`;
          expect.soft(bar.face, `${where}: drawn by its web font`).not.toBeNull();
          if (bar.face !== null) faces.add(bar.face);
          const offset = Math.abs(bar.capCentre - bar.emblemCentre);
          if (offset > worst.offset) worst = { offset, where };
          expect.soft(offset, where).toBeLessThanOrEqual(1);
          for (const button of bar.buttonCentres) {
            expect
              .soft(Math.abs(button - bar.emblemCentre), `${where}: icon button`)
              .toBeLessThanOrEqual(1);
          }
        }
      }
    }
    await setLook(page, 'default', 1);
  }
  info.annotations.push({
    type: 'worst offset',
    description: `${worst.offset.toFixed(3)} px at ${worst.where}`,
  });
  expect(checked).toBeGreaterThan(10);
  expect([...faces].sort()).toEqual(['Lexend', 'Marcellus', 'OpenDyslexic']);
});
