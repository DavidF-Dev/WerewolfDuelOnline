import { expect, test, type Page } from '@playwright/test';
import { openGalleryEntry } from './gallery-entries.js';

/** Every count both marker rows show, and whether a Potion is held. */
const counts = (page: Page): Promise<string> =>
  page.evaluate(() =>
    ['opponent-markers', 'my-markers']
      .map((id) => {
        const row = document.querySelector(`[data-testid="${id}"]`);
        const shown = Array.from(row?.querySelectorAll('[data-part="count"]') ?? [], (c) =>
          c.closest('[data-marker]')?.getAttribute('data-marker') === 'potion'
            ? 'potion'
            : c.textContent,
        );
        return shown.join(',');
      })
      .join(' | '),
  );

test('replay counts follow the step in both directions', async ({ page }) => {
  await openGalleryEntry(page, 'replay');
  const seen: string[] = [await counts(page)];
  const next = page.getByTestId('replay-next-step');
  while ((await next.getAttribute('aria-disabled')) !== 'true') {
    await next.click();
    await expect(page.getByTestId('replay-position')).toContainText(`${seen.length + 1}`);
    seen.push(await counts(page));
  }
  expect(new Set(seen).size, 'the counts change during the game').toBeGreaterThan(1);
  const previous = page.getByTestId('replay-previous-step');
  for (let index = seen.length - 2; index >= 0; index--) {
    await previous.click();
    await expect.poll(() => counts(page), `step ${index + 1}`).toBe(seen[index]);
  }
});

test('the Potion shows as 1', async ({ page }) => {
  await openGalleryEntry(page, 'table-reveal-potion');
  const potion = page.getByTestId('my-markers').locator('[data-marker="potion"]');
  await expect(potion.locator('[data-part="count"]')).toHaveText('1');
  await expect(potion.locator('.visually-hidden')).toHaveText('Potion');
  await expect(page.getByTestId('my-markers')).not.toContainText('Hourglasses placed');
  await expect(page.getByTestId('opponent-markers')).not.toContainText('Hourglasses placed');
});

test('reduced motion shows a still highlight, with no movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGalleryEntry(page, 'table-marker-gain');
  const cell = page.locator('[data-change="gain"]');
  await expect(cell).toHaveClass(/still/);
  await expect(cell.locator('[data-part="delta"]')).toHaveText('+1');
  const moving = await cell.evaluate(
    (element) =>
      element.getAnimations({ subtree: true }).length +
      getComputedStyle(element, '::before').animationName.replace('none', '').length,
  );
  expect(moving).toBe(0);
});

test("a marker's ±n label stays inside its row at 320 px and 150 % text", async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at a fixed size');
  await page.setViewportSize({ width: 320, height: 640 });
  for (const id of ['table-marker-gain', 'table-marker-loss']) {
    await openGalleryEntry(page, id, 'names=long');
    await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '1.5'));
    const placed = await page.evaluate(() => {
      const label = document.querySelector('[data-part="delta"]')!;
      // The changed marker is made the row's last, as a Potion with no Badge after it is.
      const item = label.closest('li')!;
      while (item.nextElementSibling !== null) item.nextElementSibling.remove();
      const row = label.closest('[data-part="opponent-strip"], [data-part="my-strip"]')!;
      const inner = label.getBoundingClientRect();
      const outer = row.getBoundingClientRect();
      return {
        inside: inner.left >= outer.left && inner.right <= outer.right,
        scrolls: document.scrollingElement!.scrollWidth > document.scrollingElement!.clientWidth,
      };
    });
    expect(placed.inside, `${id}: the label is inside its row`).toBe(true);
    expect(placed.scrolls, `${id}: the page does not scroll sideways`).toBe(false);
  }
});
