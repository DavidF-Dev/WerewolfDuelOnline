import { expect, test, type Page } from '@playwright/test';

/** Opens gallery entry `id` and waits until it is ready. */
async function openEntry(page: Page, id: string): Promise<void> {
  await page.goto(`/#/dev/gallery/${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-gallery-ready', id);
}

/** The heights that show whether the page and the screen's body scroll. */
const scrollState = (page: Page) =>
  page.evaluate(() => {
    const body = document.querySelector('main')!;
    return {
      page: document.scrollingElement?.scrollHeight ?? Infinity,
      viewport: window.innerHeight,
      content: body.scrollHeight,
      shown: body.clientHeight,
      overflow: getComputedStyle(body).overflowY,
    };
  });

/** Where the bar and the footer are, from the top of the viewport. */
const frameEdges = async (page: Page) => ({
  bar: (await page.getByRole('banner').boundingBox())?.y,
  footer: await page.getByTestId('kit-fit-footer').boundingBox(),
});

test('fit screens never scroll at 100% text', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openEntry(page, 'kit-fit');
  const state = await scrollState(page);
  expect(state.content).toBeLessThanOrEqual(state.shown);
  expect(state.page).toBeLessThanOrEqual(state.viewport);
  const { bar, footer } = await frameEdges(page);
  expect(bar).toBe(0);
  expect((footer?.y ?? Infinity) + (footer?.height ?? 0)).toBeLessThanOrEqual(640);
  await expect(page.getByTestId('unofficial-notice')).toHaveCount(0);
});

test('a fit screen with more than fits scrolls only its body', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openEntry(page, 'kit-fit-overflow');
  const state = await scrollState(page);
  expect(state.overflow).toBe('auto');
  expect(state.content).toBeGreaterThan(state.shown);
  expect(state.page).toBeLessThanOrEqual(state.viewport);
  const before = await frameEdges(page);
  await page.locator('main').evaluate((body) => body.scrollTo(0, body.scrollHeight));
  expect(await page.locator('main').evaluate((body) => body.scrollTop)).toBeGreaterThan(0);
  const after = await frameEdges(page);
  expect(after).toEqual(before);
  expect((after.footer?.y ?? Infinity) + (after.footer?.height ?? 0)).toBeLessThanOrEqual(640);
});

test('every interactive kit element has a 44 px hit area', async ({ page }) => {
  for (const [id, scope] of [
    ['kit', 'main button, main select, main input, main a[href], header button'],
    ['kit-sheet', 'dialog button'],
  ] as const) {
    await page.setViewportSize({ width: 360, height: 740 });
    await openEntry(page, id);
    const misses = await page.evaluate((selector) => {
      const HALF = 21;
      const owners = Array.from(document.querySelectorAll<HTMLElement>(selector)).map((control) =>
        control instanceof HTMLInputElement ? control.closest('label') : control,
      );
      const found: string[] = [];
      const name = (owner: HTMLElement): string => owner.outerHTML.slice(0, 80);
      const targets: Array<{ owner: HTMLElement; box: DOMRect }> = [];
      for (const owner of owners) {
        if (owner === null) {
          found.push('a radio has no label to tap');
          continue;
        }
        owner.scrollIntoView({ block: 'center', inline: 'center' });
        const box = owner.getBoundingClientRect();
        const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
        for (const [dx, dy] of [
          [-HALF, -HALF],
          [HALF, -HALF],
          [-HALF, HALF],
          [HALF, HALF],
        ] as const) {
          const hit = document.elementFromPoint(x + dx, y + dy);
          if (hit === null || !owner.contains(hit)) {
            found.push(`${name(owner)} misses (${dx}, ${dy})`);
            break;
          }
        }
        targets.push({ owner, box });
      }
      // At the top of the page the bar, which stays put as the page scrolls, is where it is laid out.
      scrollTo(0, 0);
      // Each target, grown to 44 px around its centre as the widened hit areas are, in page coordinates.
      const areas = targets.map(({ owner }) => {
        const box = owner.getBoundingClientRect();
        const [x, y] = [box.left + scrollX + box.width / 2, box.top + scrollY + box.height / 2];
        const [w, h] = [Math.max(box.width, 44) / 2, Math.max(box.height, 44) / 2];
        return { owner, left: x - w, right: x + w, top: y - h, bottom: y + h };
      });
      for (const [i, a] of areas.entries()) {
        for (const b of areas.slice(i + 1)) {
          const overlap =
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
          if (overlap) found.push(`${name(a.owner)} overlaps ${name(b.owner)}`);
        }
      }
      return { count: owners.length, found };
    }, scope);
    expect(misses.count, id).toBeGreaterThan(id === 'kit' ? 10 : 2);
    expect(misses.found, id).toEqual([]);
  }
});

/** Each entry that waits on someone or the network, and the element its spinner follows. */
const WAITS = [
  ['table-plan-sealed', 'phase-instruction'],
  ['invite-waiting', 'invite-waiting'],
  ['connection-banners', 'connection-phase'],
  ['connection-banners', 'opponent-away'],
] as const;

/** How the spinner in or beside `testId` is drawn. */
const spinnerIn = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((owner) => {
    const spinner =
      owner.querySelector<HTMLElement>('[data-part="spinner"]') ??
      owner.closest('.panel')?.querySelector<HTMLElement>('[data-part="spinner"]') ??
      null;
    if (spinner === null) return null;
    const style = getComputedStyle(spinner);
    return {
      hidden: spinner.getAttribute('aria-hidden'),
      animation: style.animationName,
      iterations: style.animationIterationCount,
      running: spinner.getAnimations().length,
      width: spinner.offsetWidth,
      height: spinner.offsetHeight,
    };
  });

test('a spinner turns beside each wait while motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const [id, testId] of WAITS) {
    await openEntry(page, id);
    const spinner = await spinnerIn(page, testId);
    expect(spinner, `${id}: ${testId}`).not.toBeNull();
    expect(spinner?.hidden, `${id}: decorative`).toBe('true');
    expect(spinner?.animation, `${id}: turns`).not.toBe('none');
    expect(spinner?.iterations, `${id}: for as long as the wait`).toBe('infinite');
    expect(spinner?.running, `${id}: running`).toBeGreaterThan(0);
    expect(spinner?.width, `${id}: small`).toBeLessThanOrEqual(16);
  }
});

test('under reduced motion each spinner is a steady dot', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [id, testId] of WAITS) {
    await openEntry(page, id);
    const spinner = await spinnerIn(page, testId);
    expect(spinner, `${id}: ${testId}`).not.toBeNull();
    expect(spinner?.animation, `${id}: still`).toBe('none');
    expect(spinner?.running, `${id}: nothing running`).toBe(0);
    const dot = await page.getByTestId(testId).evaluate((owner) => {
      const spinner =
        owner.querySelector('[data-part="spinner"]') ??
        owner.closest('.panel')!.querySelector('[data-part="spinner"]')!;
      const style = getComputedStyle(spinner);
      return { radius: style.borderRadius, ring: style.borderTopColor === style.borderRightColor };
    });
    expect(dot.radius, `${id}: round`).toBe('50%');
    expect(dot.ring, `${id}: no turning arc`).toBe(true);
  }
});

test('a heading the app focuses shows no outline, a control focused from the keyboard does', async ({
  page,
}) => {
  for (const [id, selector] of [
    ['game-over', '[data-focus="game-over"]'],
    ['table-paused', '[data-focus="paused"]'],
  ] as const) {
    await openEntry(page, id);
    const heading = page.locator(selector);
    await heading.focus();
    await expect(heading).toBeFocused();
    expect(await heading.evaluate((h) => h.matches(':focus-visible')), `${id}: focus-visible`).toBe(
      true,
    );
    expect(await heading.evaluate((h) => getComputedStyle(h).outlineStyle), id).toBe('none');
    await page.keyboard.press('Tab');
    const control = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      const style = getComputedStyle(active);
      return {
        tag: active.tagName,
        outline: style.outlineStyle,
        width: parseFloat(style.outlineWidth),
      };
    });
    expect(control.tag, `${id}: Tab reaches a control`).toMatch(/^(BUTTON|A|INPUT|SUMMARY)$/);
    expect(control.outline, `${id}: ${control.tag} outline`).not.toBe('none');
    expect(control.width, `${id}: ${control.tag} outline width`).toBeGreaterThan(0);
  }
  await openEntry(page, 'home');
  const title = page.getByRole('heading', { level: 1 });
  await title.focus();
  await expect(title).toBeFocused();
  expect(await title.evaluate((h) => getComputedStyle(h).outlineStyle)).toBe('none');
});
