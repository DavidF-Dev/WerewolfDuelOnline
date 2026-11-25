import { expect, test, type Page } from '@playwright/test';
import { GALLERY_ENTRIES, expectGalleryEntries, openGalleryEntry } from './gallery-entries.js';

/** The column's width in CSS pixels: 30 rem at the default 16 px. */
const COLUMN = 480;
/** How far a measured edge may sit from where it should, for sub-pixel layout. */
const SLACK = 0.5;

interface Box {
  what: string;
  left: number;
  right: number;
  top: number;
}

/** The window's width without its scroll bar, the bands that should span it, and the content that should not. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const box = (what: string, element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { what, left: rect.left, right: rect.right, top: rect.top };
    };
    // Content hidden for screen readers only is clipped to nothing, wherever its box is.
    const shown = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1 && element.closest('.visually-hidden') === null;
    };
    const screen = document.querySelector('[data-part="screen"]');
    const bands = [
      ...['top', 'footer', 'note', 'page-footer']
        .map((part) => screen?.querySelector(`[data-part="${part}"]`))
        .filter((element): element is Element => element != null)
        .map((element) => box((element as HTMLElement).dataset['part']!, element)),
      ...Array.from(screen?.querySelectorAll('main') ?? [], (main) => box('main', main)),
      ...Array.from(screen?.querySelectorAll('[data-part="banners"] > *') ?? [])
        .filter(shown)
        .map((banner) => box('banner', banner)),
    ];
    const contentOf = (what: string, parent: Element | null | undefined): Box[] =>
      Array.from(parent?.children ?? [])
        .filter((child) => child.getAttribute('data-part') !== 'scenery' && shown(child))
        .map((child) => box(`${what} > ${child.tagName.toLowerCase()}`, child));
    const bar = screen?.querySelector('header.app-bar');
    const content = [
      ...Array.from(screen?.querySelectorAll('main') ?? []).flatMap((main) =>
        contentOf('main', main),
      ),
      ...Array.from(bar?.querySelectorAll('h1, button') ?? [])
        .filter(shown)
        .map((element) => box(`bar ${element.tagName.toLowerCase()}`, element)),
      ...contentOf('footer', screen?.querySelector('[data-part="footer"]')),
      ...contentOf('page-footer', screen?.querySelector('[data-part="page-footer"]')),
      ...Array.from(screen?.querySelectorAll('[data-part="banners"] > *') ?? [])
        .filter(shown)
        .flatMap((banner) => contentOf('banner', banner)),
    ];
    const height = (element: Element | null | undefined): number =>
      element?.getBoundingClientRect().height ?? 0;
    // What the top band holds beyond the bar and the banners that are shown; nothing, unless a hidden one takes room.
    const topSpare =
      height(screen?.querySelector('[data-part="top"]')) -
      height(bar) -
      Array.from(screen?.querySelectorAll('[data-part="banners"] > *') ?? [])
        .filter(shown)
        .reduce((sum, banner) => sum + height(banner), 0);
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.scrollingElement?.scrollWidth ?? Infinity,
      bands,
      content,
      topSpare,
    };
  });

test('the gallery list matches the entries measured here', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is the same in every project');
  await expectGalleryEntries(page);
});

test.describe('wide screens paint backgrounds edge to edge and keep content in the column', () => {
  for (const width of [481, 1280, 1920, 2560]) {
    test(`at ${width} px`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'wide screens are desktop screens');
      test.setTimeout(240_000);
      await page.setViewportSize({ width, height: 900 });
      for (const id of GALLERY_ENTRIES) {
        await openGalleryEntry(page, id);
        const m = await measure(page);
        const start = (m.width - COLUMN) / 2;
        const end = (m.width + COLUMN) / 2;
        expect.soft(m.bands.length, `${id}: has bands`).toBeGreaterThan(1);
        for (const band of m.bands) {
          expect
            .soft(band.left, `${id}: the ${band.what} starts at the left edge`)
            .toBeLessThanOrEqual(SLACK);
          expect
            .soft(band.right, `${id}: the ${band.what} ends at the right edge`)
            .toBeGreaterThanOrEqual(m.width - SLACK);
        }
        for (const part of m.content) {
          expect
            .soft(part.left, `${id}: ${part.what} starts in the column`)
            .toBeGreaterThanOrEqual(start - SLACK);
          expect
            .soft(part.right, `${id}: ${part.what} ends in the column`)
            .toBeLessThanOrEqual(end + SLACK);
        }
        expect.soft(m.scrollWidth, `${id}: no horizontal scroll`).toBeLessThanOrEqual(m.width);
        expect
          .soft(Math.abs(m.topSpare), `${id}: the top band holds only what is shown`)
          .toBeLessThanOrEqual(SLACK);
      }
    });
  }
});

test('the sticky bar stays full width while the page scrolls', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'wide screens are desktop screens');
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGalleryEntry(page, 'settings-top');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(300);
  const bar = await page.evaluate(() => {
    const rect = document.querySelector('[data-part="top"]')!.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: document.documentElement.clientWidth,
    };
  });
  expect(bar.left).toBeLessThanOrEqual(SLACK);
  expect(bar.right).toBeGreaterThanOrEqual(bar.width - SLACK);
  expect(Math.abs(bar.top)).toBeLessThanOrEqual(SLACK);
});

/** How the treeline's mask is drawn: each layer's image, drawn size and repeat. */
const treeline = (page: Page) =>
  page.evaluate(async () => {
    const scenery = document.querySelector<HTMLElement>('[data-part="scenery"]')!;
    const style = getComputedStyle(scenery);
    const box = scenery.getBoundingClientRect();
    const images = Array.from(
      style.maskImage.matchAll(/url\("((?:[^"\\]|\\.)*)"\)/g),
      (m) => m[1]!,
    );
    const sizes = style.maskSize.split(',').map((size) => size.trim().split(/\s+/));
    const repeats = style.maskRepeat.split(',').map((repeat) => repeat.trim());
    return Promise.all(
      images.map(async (url, i) => {
        const svg = await (await fetch(url)).text();
        // Small drawings are inlined as data URLs, which quote attributes with single quotes.
        const viewBox = /viewBox=["']([^"']+)["']/.exec(svg)![1]!.split(/\s+/).map(Number);
        const ratio = viewBox[2]! / viewBox[3]!;
        const [w = 'auto', h = 'auto'] = sizes[i % sizes.length]!;
        const length = (value: string, whole: number): number | null =>
          value === 'auto'
            ? null
            : value.endsWith('%')
              ? (parseFloat(value) / 100) * whole
              : parseFloat(value);
        let width = length(w, box.width);
        let height = length(h, box.height);
        if (w === 'cover' || w === 'contain') {
          const scale = (w === 'cover' ? Math.max : Math.min)(box.width / ratio / box.height, 1);
          height = box.height * scale;
          width = height * ratio;
        }
        width ??= height === null ? null : height * ratio;
        height ??= width === null ? null : width / ratio;
        return {
          name: `layer ${i + 1}`,
          ratio,
          width,
          height,
          repeat: repeats[i % repeats.length]!,
        };
      }),
    );
  });

test('the treeline is drawn at its natural height and not stretched', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the drawing depends only on the width');
  for (const width of [360, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await openGalleryEntry(page, 'home');
    const layers = await treeline(page);
    expect(layers.length, `at ${width} px: has a drawing`).toBeGreaterThan(0);
    for (const layer of layers) {
      expect(layer.height, `at ${width} px: ${layer.name} height`).not.toBeNull();
      expect(
        Math.abs(layer.height! - 120),
        `at ${width} px: ${layer.name} at 120 px`,
      ).toBeLessThanOrEqual(SLACK);
      expect(
        Math.abs(layer.width! / layer.height! - layer.ratio),
        `at ${width} px: ${layer.name} keeps its shape`,
      ).toBeLessThan(0.01);
      expect(layer.repeat, `at ${width} px: ${layer.name} tiles are not stretched`).not.toMatch(
        /round|space/,
      );
    }
    if (width === 1920) {
      // The wide drawing is one picture wider than the window, rather than the phone's drawing enlarged.
      expect(
        layers.some((layer) => layer.repeat === 'no-repeat' && layer.width! >= width),
        `at ${width} px: the wide drawing spans the window`,
      ).toBe(true);
    }
  }
});
