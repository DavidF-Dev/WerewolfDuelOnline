import { expect, test, type Browser } from '@playwright/test';
import { GALLERY_ENTRIES, openGalleryEntry } from './gallery-entries.js';

/** Opens gallery entry `id` in a fresh page at 360 × 740 in the light look and returns its screenshot. */
async function capture(browser: Browser, baseURL: string, id: string): Promise<Buffer> {
  const page = await browser.newPage({ baseURL, viewport: { width: 360, height: 740 } });
  try {
    await page.goto(`/#/dev/gallery/${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate((shown) => {
      document.documentElement.dataset['theme'] = 'light';
      if (shown !== 'settings-scrolled') window.scrollTo(0, 0);
    }, id);
    return await page.screenshot({ animations: 'disabled' });
  } finally {
    await page.close();
  }
}

/** Raster noise allowed between two captures: how far a colour channel may move, and in how many pixels. */
const NOISE = { levels: 2, pixels: 100 };

/** How two screenshots compare: whether they match, and where and how much they differ. */
interface Comparison {
  same: boolean;
  /** The bounding box of the differing pixels, as [left, top, right, bottom], or null. */
  box: [number, number, number, number] | null;
  /** How many pixels differ, and the largest move of a colour channel among them. */
  differing: number;
  largest: number;
  /** A PNG marking the differing pixels in red over the first image, when they differ. */
  diff: Buffer | null;
}

/** Compares two screenshots, allowing Chromium's raster noise on native controls behind backdrops. */
async function compareImages(browser: Browser, a: Buffer, b: Buffer): Promise<Comparison> {
  if (a.equals(b)) return { same: true, box: null, differing: 0, largest: 0, diff: null };
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(
      async ({ a, b, noise }) => {
        const pixels = async (png: string): Promise<ImageData> => {
          const image = new Image();
          image.src = `data:image/png;base64,${png}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height);
        };
        const [first, second] = [await pixels(a), await pixels(b)];
        if (first.width !== second.width || first.height !== second.height) {
          return { same: false, box: null, differing: -1, largest: 255, diff: null };
        }
        let differing = 0;
        let largest = 0;
        let box: [number, number, number, number] | null = null;
        const marked = new ImageData(new Uint8ClampedArray(first.data), first.width, first.height);
        for (let i = 0; i < first.data.length; i += 4) {
          let moved = 0;
          for (let channel = 0; channel < 4; channel++) {
            moved = Math.max(moved, Math.abs(first.data[i + channel]! - second.data[i + channel]!));
          }
          if (moved === 0) continue;
          differing += 1;
          largest = Math.max(largest, moved);
          const x = (i / 4) % first.width;
          const y = Math.floor(i / 4 / first.width);
          box =
            box === null
              ? [x, y, x, y]
              : [
                  Math.min(box[0], x),
                  Math.min(box[1], y),
                  Math.max(box[2], x),
                  Math.max(box[3], y),
                ];
          marked.data.set([255, 0, 0, 255], i);
        }
        const canvas = new OffscreenCanvas(first.width, first.height);
        canvas.getContext('2d')!.putImageData(marked, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return {
          same: largest <= noise.levels && differing <= noise.pixels,
          box,
          differing,
          largest,
          diff: btoa(binary),
        };
      },
      { a: a.toString('base64'), b: b.toString('base64'), noise: NOISE },
    );
    return { ...result, diff: result.diff === null ? null : Buffer.from(result.diff, 'base64') };
  } finally {
    await page.close();
  }
}

test('capturing the same entry twice gives the same image', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery renders the same in every project');
  test.setTimeout(300_000);
  if (baseURL === undefined) throw new Error('no base URL');
  const list = await browser.newPage({ baseURL });
  await list.goto('/#/dev/gallery');
  await list.locator('[data-entry]').first().waitFor();
  const ids = await list
    .locator('[data-entry]')
    .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['entry'] ?? ''));
  await list.close();
  expect(ids.length).toBeGreaterThan(30);

  const first = new Map<string, Buffer>();
  for (const id of ids) first.set(id, await capture(browser, baseURL, id));
  // Long enough for a running clock to change a countdown's seconds.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  for (const id of ids) {
    const second = await capture(browser, baseURL, id);
    const earlier = first.get(id) ?? Buffer.alloc(0);
    const comparison = await compareImages(browser, earlier, second);
    if (!comparison.same) {
      await info.attach(`${id}-first.png`, { body: earlier, contentType: 'image/png' });
      await info.attach(`${id}-second.png`, { body: second, contentType: 'image/png' });
      if (comparison.diff !== null) {
        await info.attach(`${id}-diff.png`, { body: comparison.diff, contentType: 'image/png' });
      }
    }
    const { box, differing, largest } = comparison;
    expect
      .soft(
        comparison.same,
        `${id}: ${differing} pixels differ by up to ${largest} in ${JSON.stringify(box)}`,
      )
      .toBe(true);
  }
});

test('a fitted label is fitted once, before it is first drawn, however late the fonts arrive', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery renders the same in every project');
  // A label refitted after it was drawn is laid out and drawn again, which Chromium may rasterise differently.
  await page.route(/\.woff2(\?.*)?$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.addInitScript(() => {
    const frames: number[] = [];
    (window as { __fitFrames?: number[] }).__fitFrames = frames;
    let frame = 0;
    const count = (): void => {
      frame += 1;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    // The animation frame in which each change to the opponent name's style was made.
    new MutationObserver((records) => {
      for (const record of records) {
        if ((record.target as Element).matches('[data-testid="opponent"] h2')) frames.push(frame);
      }
    }).observe(document, { attributes: true, attributeFilter: ['style'], subtree: true });
  });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/#/dev/gallery/table-plan-long-name');
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', 'table-plan-long-name');
  // As a capture does: waits for the fonts, then for the page to draw them.
  const frames = await page.evaluate(async () => {
    await document.fonts.ready;
    for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
    return (window as { __fitFrames?: number[] }).__fitFrames ?? [];
  });
  expect(frames.length, 'the name was fitted').toBeGreaterThan(0);
  // Mounting sets its one-line styles; the first fit follows in the next animation frame, before paint.
  expect(
    Math.max(...frames) - Math.min(...frames),
    `style changes in frames ${frames.join(', ')}`,
  ).toBeLessThanOrEqual(1);
});

for (const [language, lang] of [
  ['German', 'de'],
  ['Japanese', 'ja'],
] as const) {
  test(`no ${language} label ends in an ellipsis at 100 % and 360 px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 360, height: 640 });
    const cut: string[] = [];
    for (const id of GALLERY_ENTRIES) {
      await page.goto('about:blank');
      await openGalleryEntry(page, id, `lang=${lang}`);
      await page.evaluate(async () => {
        await document.fonts.ready;
        // A label sized by its own text settles over a few frames of fitting.
        for (let i = 0; i < 6; i++) await new Promise((done) => requestAnimationFrame(done));
      });
      const labels = await page.evaluate(() => {
        const range = document.createRange();
        return Array.from(document.querySelectorAll<HTMLElement>('body *')).flatMap((element) => {
          const style = getComputedStyle(element);
          if (style.textOverflow !== 'ellipsis') return [];
          // A showdown step already shown is cut to one line of log by design.
          if (element.closest('[data-testid="showdown-step"], [data-testid="showdown-out"]'))
            return [];
          const box = element.getBoundingClientRect();
          if (box.width === 0 || style.visibility === 'hidden') return [];
          let cutOff: boolean;
          if (element.style.textOverflow === 'ellipsis') {
            // A fitted label, measured as the fitting measures it.
            const sides =
              parseFloat(style.paddingLeft) +
              parseFloat(style.paddingRight) +
              parseFloat(style.borderLeftWidth) +
              parseFloat(style.borderRightWidth);
            const width = parseFloat(style.width);
            const outer = style.boxSizing === 'border-box' ? width : width + sides;
            range.selectNodeContents(element);
            const need = (range.getBoundingClientRect().width * outer) / box.width;
            // Chrome draws no ellipsis for an overflow of a few hundredths of a pixel.
            cutOff = need > outer - sides + 0.1;
          } else {
            cutOff = element.scrollWidth > element.clientWidth;
          }
          return cutOff ? [element.textContent?.trim() ?? ''] : [];
        });
      });
      // The long-name entry cuts the opponent's display name by design; that is a name, not a label.
      const names =
        id === 'table-plan-long-name'
          ? await page.locator('[data-testid="opponent"] h2').allTextContents()
          : [];
      for (const label of labels) if (!names.includes(label)) cut.push(`${id}: "${label}"`);
    }
    expect(cut).toEqual([]);
  });
}

test('an entry can be shown in another language or the pseudo-locale', async ({ page }) => {
  await openGalleryEntry(page, 'settings-top', 'lang=pseudo');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/~/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  // A new hash on the same entry keeps the entry mounted, so each language starts a fresh page.
  await page.goto('about:blank');
  await openGalleryEntry(page, 'settings-top', 'lang=ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja-JP');
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(/~/);
  await page.goto('about:blank');
  await openGalleryEntry(page, 'settings-top');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
});
