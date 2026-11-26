import { expect, test, type Locator, type Page } from '@playwright/test';

/** Opens the gallery's cards entry at `scale` times the default text size and waits until it is ready. */
async function openCards(page: Page, scale = 1, lang = 'en'): Promise<void> {
  await page.goto(`/#/dev/gallery/cards${lang === 'en' ? '' : `?lang=${lang}`}`);
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'cards');
  await page.evaluate((s) => {
    document.documentElement.style.setProperty('--text-scale', String(s));
  }, scale);
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 2; i++) await new Promise((done) => requestAnimationFrame(done));
  });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('the part is not shown');
  return found;
}

const centreX = (b: Box): number => b.x + b.width / 2;
const right = (b: Box): number => b.x + b.width;

/** The card `id` in the gallery's panel of `size` cards in their normal state. */
const card = (page: Page, size: string, id: string): Locator =>
  page.locator(`ul[data-size="${size}"]:not([data-state])`).locator(`li[data-card="${id}"]`);

/** Each card size, in pixels at 100 % text. */
const SIZES = {
  large: { width: 120, height: 176 },
  medium: { width: 98, height: 146 },
  target: { width: 58, height: 84 },
} as const;

const IDS = [
  'hunter',
  'wolf_king',
  'knight',
  'wolfen',
  'seer',
  'witch',
  'wolf_beauty',
  'villager',
  'fool',
];

test('cards have the design note sizes and anatomy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCards(page);
  for (const [size, expected] of Object.entries(SIZES)) {
    for (const id of IDS) {
      const slot = card(page, size, id);
      const where = `${id} at ${size}`;
      const face = await box(slot.getByRole('button'));
      expect(face.width, where).toBeCloseTo(expected.width, 0);
      expect(face.height, where).toBeCloseTo(expected.height, 0);
      const top = await box(slot.locator('[data-part="top"]'));
      const art = await box(slot.locator('[data-part="art"]'));
      const name = await box(slot.locator('[data-part="name"]'));
      expect(Math.abs(centreX(name) - centreX(face)), `${where}: name centred`).toBeLessThan(
        size === 'target' ? 1 : 8,
      );
      expect(art.y, `${where}: art below the top row`).toBeGreaterThanOrEqual(
        top.y + top.height - 0.5,
      );
      const number = await box(slot.locator('[data-part="initiative"]'));
      expect(number.x - face.x, `${where}: number at the left`).toBeLessThan(12);
      if (id !== 'fool') {
        const faction = await box(slot.locator('[data-part="faction"]'));
        expect(right(face) - right(faction), `${where}: faction at the right`).toBeLessThan(12);
        if (size === 'target') {
          expect(faction.y, `${where}: faction in the art`).toBeGreaterThanOrEqual(art.y);
          expect(number.y, `${where}: number in the art`).toBeGreaterThanOrEqual(art.y);
        }
      }
      if (id !== 'fool') {
        const pills = await box(slot.locator('[data-part="pills"]'));
        expect(pills.y, `${where}: pills below the art`).toBeGreaterThanOrEqual(
          art.y + art.height - 0.5,
        );
      }
    }
  }
  // The art panel is the same height on every card of a size.
  for (const size of Object.keys(SIZES)) {
    const heights = await page
      .locator(`ul[data-size="${size}"]:not([data-state]) [data-part="art"]`)
      .evaluateAll((arts) => arts.map((art) => art.getBoundingClientRect().height));
    expect(new Set(heights).size, size).toBe(1);
  }
});

for (const [scale, lang] of [
  [1, 'en'],
  [1.5, 'en'],
  [1, 'de'],
  [1, 'ja'],
] as const) {
  const language = lang === 'en' ? '' : `, ${lang}`;
  test(`card names fit their slot, at 75 % size or more, and pills fit on one line at every size (${scale * 100} % text${language})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openCards(page, scale, lang);
    const problems = await page.locator('[data-testid="cards-gallery"]').evaluate((root) => {
      const found: string[] = [];
      // How far the text runs past the content box, to a fraction of a pixel.
      const overflow = (element: HTMLElement): number => {
        const style = getComputedStyle(element);
        const sides = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'].reduce(
          (sum, side) => sum + parseFloat(style[side as 'paddingLeft']),
          0,
        );
        const range = document.createRange();
        range.selectNodeContents(element);
        return (
          range.getBoundingClientRect().width - (element.getBoundingClientRect().width - sides)
        );
      };
      const where = (el: Element): string => {
        const li = el.closest('li[data-card]') as HTMLElement | null;
        const ul = el.closest('ul[data-size]') as HTMLElement | null;
        return `${li?.dataset['card']} at ${ul?.dataset['size']} ${ul?.dataset['state'] ?? ''}`;
      };
      for (const name of Array.from(
        root.querySelectorAll<HTMLElement>('.face [data-part="name"]'),
      )) {
        const over = overflow(name);
        if (over > 0.01) found.push(`name of ${where(name)} overflows by ${over} px`);
        const shown = parseFloat(getComputedStyle(name).fontSize);
        const fitted = name.style.fontSize;
        name.style.fontSize = '';
        const normal = parseFloat(getComputedStyle(name).fontSize);
        name.style.fontSize = fitted;
        // A name may shrink to fit, but never below 75 % of its normal size.
        if (shown < normal * 0.75 - 0.01) {
          found.push(`name of ${where(name)} is ${shown} px, below 75 % of ${normal} px`);
        }
        if (['Seer', 'Seherin', '占い師'].includes(name.textContent ?? '') && shown !== normal) {
          found.push(`name of ${where(name)} is shrunk though it fits`);
        }
      }
      for (const text of Array.from(
        root.querySelectorAll<HTMLElement>('.face [data-part="text"]'),
      )) {
        if (text.scrollHeight > text.clientHeight + 1)
          found.push(`text of ${where(text)} overflows`);
      }
      for (const row of Array.from(
        root.querySelectorAll<HTMLElement>('.face [data-part="pills"]'),
      )) {
        const own = row.getBoundingClientRect();
        const items = Array.from(row.children).map((item) => item.getBoundingClientRect());
        const tops = new Set(items.map((item) => Math.round(item.top + item.height / 2)));
        if (tops.size > 1) found.push(`pills of ${where(row)} wrap`);
        for (const item of items) {
          if (item.left < own.left - 0.5 || item.right > own.right + 0.5) {
            found.push(`pills of ${where(row)} overflow`);
          }
        }
        if (row.scrollWidth > row.clientWidth) found.push(`pills of ${where(row)} scroll`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });
}

test('a target card shows the large card on keyboard focus and on a long press', async ({
  page,
  isMobile,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCards(page);
  const slot = card(page, 'target', 'villager');
  const button = slot.getByRole('button');
  const popover = slot.locator('[data-part="popover"]');

  await card(page, 'target', 'wolf_beauty').getByRole('button').focus();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();
  await expect(popover).toBeVisible();
  const shown = await box(popover);
  expect(shown.x).toBeGreaterThanOrEqual(0);
  expect(right(shown)).toBeLessThanOrEqual(390);
  expect(shown.width).toBeCloseTo(120, 0);
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);

  await button.blur();
  if (isMobile) await button.tap();
  else await button.click();
  await expect(button).toBeFocused();
  await expect(popover).toHaveCount(0);

  const at = await box(button);
  await page.mouse.move(centreX(at), at.y + at.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(popover).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(popover).toHaveCount(0);
});

test('card icons stay visible in forced colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openCards(page);
  const slot = card(page, 'large', 'hunter');
  const colours = await slot.evaluate((root) => {
    const paint = (selector: string): string => {
      const el = root.querySelector(selector);
      if (el === null) throw new Error(`no ${selector}`);
      return getComputedStyle(el).fill;
    };
    const text = getComputedStyle(root.querySelector('[data-part="name"]')!).color;
    return {
      text,
      glyph: paint('[data-part="glyph"]'),
      faction: paint('[data-part="faction"]'),
      shape: paint('[data-pill] [data-target] svg'),
      token: paint('[data-pill] [data-part="icon"] svg'),
      pill: getComputedStyle(root.querySelector('[data-pill]')!).borderTopColor,
    };
  });
  expect(colours.glyph).toBe(colours.text);
  expect(colours.faction).toBe(colours.text);
  expect(colours.shape).toBe(colours.text);
  expect(colours.token).toBe(colours.text);
  expect(colours.pill).toBe(colours.text);
});

test('marker tokens are neutral: every token glyph is drawn in the same ink', async ({ page }) => {
  await openCards(page);
  const colours = await page
    .locator('[data-testid="cards-gallery"] [data-part="icon"][data-token]')
    .evaluateAll((tokens) =>
      tokens.map((token) => ({
        marker: token.closest('[data-part="marker"]')?.className ?? '',
        colour: getComputedStyle(token.querySelector('svg')!).fill,
      })),
    );
  const known = ['cross', 'fang', 'hourglass', 'potion', 'health', 'badge'];
  const markers = new Set(
    colours.map(({ marker }) => marker.split(' ').find((name) => known.includes(name))),
  );
  expect([...markers].sort()).toEqual(['cross', 'fang', 'hourglass', 'potion']);
  const cross = colours.find(({ marker }) => marker.includes('cross'))!.colour;
  expect(colours.filter(({ colour }) => colour !== cross)).toEqual([]);
});

interface TokenOffset {
  where: string;
  offset: number;
  /** The font size of the text around the token, in pixels. */
  size: number;
}

/**
 * How far each inline marker token's centre sits from the centre of the capitals around it:
 * the cap band runs from the baseline, found with a zero-size probe beside the token, up by the
 * ink ascent of "H" in the surrounding text's computed font.
 */
const tokenOffsets = (page: Page): Promise<TokenOffset[]> =>
  page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) throw new Error('no canvas');
    const found: { where: string; offset: number; size: number }[] = [];
    const icons = document.querySelectorAll<HTMLElement>(
      '[data-part="rich-text"] [data-part="icon"][data-token]',
    );
    for (const icon of Array.from(icons)) {
      const box = icon.getBoundingClientRect();
      if (box.height === 0) continue;
      const text = icon.closest('[data-part="rich-text"]')!.parentElement!;
      const style = getComputedStyle(text);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const cap = context.measureText('H').actualBoundingBoxAscent;
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      icon.before(probe);
      const baseline = probe.getBoundingClientRect().bottom;
      probe.remove();
      found.push({
        where: `${icon.closest('[data-part="marker"]')?.textContent} in "${text.textContent?.trim().slice(0, 40)}"`,
        offset: Math.abs((box.top + box.bottom) / 2 - (baseline - cap / 2)),
        size: parseFloat(style.fontSize),
      });
    }
    return found;
  });

test('inline marker tokens are centred on the capitals', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'text layout is the same in every project');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#/dev/gallery');
  await page.locator('[data-entry]').first().waitFor();
  await page.evaluate(async () => {
    const fonts = (await import(/* @vite-ignore */ '/src/theme/fonts.ts' as string)) as {
      loadReadingFont: (font: string) => Promise<void>;
    };
    await Promise.all([fonts.loadReadingFont('lexend'), fonts.loadReadingFont('opendyslexic')]);
  });
  for (const id of ['cards', 'table-log']) {
    await page.goto(`/#/dev/gallery/${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
    for (const font of ['default', 'lexend', 'opendyslexic']) {
      for (const scale of [1, 1.5, 2]) {
        await page.evaluate(
          async ({ font, scale }) => {
            document.documentElement.setAttribute('data-font', font);
            document.documentElement.style.setProperty('--text-scale', String(scale));
            await document.fonts.ready;
            for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
          },
          { font, scale },
        );
        const offsets = await tokenOffsets(page);
        expect(offsets.length, `${id}: tokens in text`).toBeGreaterThan(0);
        for (const { where, offset } of offsets) {
          expect
            .soft(offset, `${id} (${font}, ${scale * 100} %): ${where}`)
            .toBeLessThanOrEqual(0.5);
        }
      }
    }
  }
});

test('without the cap unit, inline marker tokens stay close to the capitals', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'text layout is the same in every project');
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const id of ['cards', 'table-log']) {
    // A fresh page each time, since the rules taken out below stay out across a hash change.
    await page.goto('about:blank');
    await page.goto(`/#/dev/gallery/${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
    // Takes out the rules for browsers with the `cap` unit, so the fallback applies.
    const removed = await page.evaluate(async () => {
      let count = 0;
      for (const sheet of Array.from(document.styleSheets)) {
        for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
          const rule = sheet.cssRules[i];
          if (rule instanceof CSSSupportsRule && rule.conditionText.includes('cap')) {
            sheet.deleteRule(i);
            count++;
          }
        }
      }
      for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
      return count;
    });
    expect(removed, `${id}: the cap rules were found`).toBeGreaterThan(0);
    for (const scale of [1, 1.5, 2]) {
      await page.evaluate(async (value) => {
        document.documentElement.style.setProperty('--text-scale', String(value));
        for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
      }, scale);
      const offsets = await tokenOffsets(page);
      expect(offsets.length, `${id}: tokens in text`).toBeGreaterThan(0);
      for (const { where, offset, size } of offsets) {
        expect.soft(offset, `${id} (${scale * 100} %): ${where}`).toBeLessThanOrEqual(0.1 * size);
      }
    }
  }
});

test('bare marker icons are centred like the tokens beside them', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
  const rows = [
    ['game-over', 'game-over-markers'],
    ['table-plan', 'opponent-markers'],
    ['table-plan', 'my-markers'],
    ['replay', 'opponent-markers'],
  ] as const;
  for (const size of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const [[id, row], scale] of rows.flatMap((r) => [1, 1.5].map((x) => [r, x] as const))) {
      await page.goto(`/#/dev/gallery/${id}`);
      await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
      await page.evaluate(async (x) => {
        document.documentElement.style.setProperty('--text-scale', String(x));
        await document.fonts.ready;
        for (let i = 0; i < 2; i++) await new Promise((done) => requestAnimationFrame(done));
      }, scale);
      const icons = await page.getByTestId(row).evaluate((list) =>
        Array.from(list.querySelectorAll<HTMLElement>('[data-part="icon"]'), (icon) => {
          const token = icon.hasAttribute('data-token');
          // A bare icon is judged by its drawn shape, a token by its round outline.
          const rect = (token ? icon : icon.querySelector('use')!).getBoundingClientRect();
          const item = icon.closest('li')!.getBoundingClientRect();
          return { token, centre: rect.top + rect.height / 2, top: item.top, bottom: item.bottom };
        }),
      );
      const tokens = icons.filter((icon) => icon.token);
      const bare = icons.filter((icon) => !icon.token);
      expect(tokens.length, `${id} ${row}: tokens`).toBeGreaterThan(0);
      expect(bare.length, `${id} ${row}: bare icons`).toBeGreaterThan(0);
      let compared = 0;
      for (const icon of bare) {
        // Only tokens on the same line of the row sit beside it; a wrapped Badge has none.
        const beside = tokens.filter((t) => t.centre > icon.top && t.centre < icon.bottom);
        for (const t of beside) {
          compared++;
          expect
            .soft(
              Math.abs(icon.centre - t.centre),
              `${id} ${row} at ${size.width}, ${scale * 100} %: bare icon centre`,
            )
            .toBeLessThanOrEqual(1);
        }
      }
      expect(compared, `${id} ${row}: a bare icon sits beside a token`).toBeGreaterThan(0);
    }
  }
});

test('each ability legend icon is centred on the first line of its text', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scale of [1, 1.5]) {
      await page.goto('/#/dev/gallery/how-to-play');
      await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'how-to-play');
      await page.evaluate(async (s) => {
        document.documentElement.style.setProperty('--text-scale', String(s));
        await document.fonts.ready;
        for (let i = 0; i < 2; i++) await new Promise((done) => requestAnimationFrame(done));
      }, scale);
      const rows = await page
        .getByTestId('ability-legend')
        .locator('[data-legend]')
        .evaluateAll((items) =>
          items.map((row) => {
            const sample = row.querySelector('.sample')!.getBoundingClientRect();
            const text = Array.from(row.querySelector('dd')!.childNodes).find(
              (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '',
            )!;
            const range = document.createRange();
            range.selectNodeContents(text);
            const first = range.getClientRects()[0]!;
            return {
              row: (row as HTMLElement).dataset['legend'],
              icon: sample.top + sample.height / 2,
              line: first.top + first.height / 2,
            };
          }),
        );
      expect(rows).toHaveLength(4);
      for (const { row, icon, line } of rows) {
        expect
          .soft(Math.abs(icon - line), `${row} at ${width} px, ${scale * 100} %`)
          .toBeLessThanOrEqual(1);
      }
    }
  }
});
