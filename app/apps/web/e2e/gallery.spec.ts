import { expect, test, type Browser } from '@playwright/test';

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

/** Whether two screenshots match, allowing Chromium's raster noise on native controls behind backdrops. */
async function sameImage(browser: Browser, a: Buffer, b: Buffer): Promise<boolean> {
  if (a.equals(b)) return true;
  const page = await browser.newPage();
  try {
    return await page.evaluate(
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
        if (first.width !== second.width || first.height !== second.height) return false;
        let differing = 0;
        for (let i = 0; i < first.data.length; i += 4) {
          let moved = 0;
          for (let channel = 0; channel < 4; channel++) {
            moved = Math.max(moved, Math.abs(first.data[i + channel]! - second.data[i + channel]!));
          }
          if (moved > noise.levels) return false;
          if (moved > 0) differing += 1;
        }
        return differing <= noise.pixels;
      },
      { a: a.toString('base64'), b: b.toString('base64'), noise: NOISE },
    );
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
    expect.soft(await sameImage(browser, first.get(id) ?? Buffer.alloc(0), second), id).toBe(true);
  }
});
