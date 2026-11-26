import { expect, test, type Page } from '@playwright/test';
import {
  GALLERY_ENTRIES,
  LANGUAGES,
  OVERFLOW_LANGUAGES,
  expectGalleryEntries,
  inLanguage,
  inLanguageTitle,
  languageDetails,
  openGalleryEntry,
  type Language,
} from './gallery-entries.js';

const SIZES = [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
];

/** The replay's step buttons, in their order along the footer. */
const REPLAY_STEPS = [
  'replay-previous-round',
  'replay-previous-step',
  'replay-next-step',
  'replay-next-round',
];

/**
 * What each game entry's viewer is offered in the phase bar: the test ids of its buttons, in
 * order. An empty list means the viewer only waits, or (`inline`) acts inside the phase panel.
 * The replay's footer holds its step buttons instead; `footer: false` marks a screen without one.
 */
const ACTIONS: Readonly<Record<string, { bar: string[]; inline?: string; footer?: false }>> = {
  'table-plan': { bar: ['seal-plan'] },
  'table-plan-seal': { bar: ['seal-plan'] },
  'table-plan-long-name': { bar: ['seal-plan'] },
  'table-plan-sealed': { bar: [] },
  'table-reveal-hourglasses': { bar: ['place-hourglasses'] },
  'table-reveal-potion': { bar: ['confirm-potion'] },
  'table-showdown': { bar: ['showdown-next', 'action-next-round'] },
  'table-hunter': { bar: [], inline: 'action-hunter-spend' },
  'table-round-summary': { bar: ['action-next-round'] },
  'table-showdown-elimination': { bar: ['action-next-round'] },
  'table-paused': { bar: ['resume'] },
  'table-rejoin-request': { bar: ['seal-plan'] },
  'table-menu': { bar: ['seal-plan'] },
  'table-log': { bar: ['seal-plan'] },
  'table-continue-elsewhere': { bar: ['seal-plan'] },
  'table-resign': { bar: ['seal-plan'] },
  'game-over-showdown': { bar: ['showdown-next'] },
  'game-over': { bar: [], footer: false },
  replay: { bar: REPLAY_STEPS },
  'replay-showdown': { bar: REPLAY_STEPS },
  'replay-hunter': { bar: REPLAY_STEPS },
  'replay-long-log': { bar: REPLAY_STEPS },
  'replay-menu': { bar: REPLAY_STEPS },
  'connection-banners': { bar: ['seal-plan'] },
  'connection-claim-win': { bar: ['seal-plan'] },
  'kit-fit': { bar: ['kit-fit-action'] },
};

/**
 * Game entries whose phase panels still need more than one screen, the task that fits them, and
 * the sizes they overflow at (all sizes when none are named). Each must still overflow, so an
 * entry that starts fitting fails until it is taken off this list.
 */
const UNFINISHED: Readonly<Record<string, { task: string; sizes?: string[] }>> = {};

/** The task that fits `id` at `size`, or undefined when it fits already. */
function unfinished(id: string, size: string): string | undefined {
  const entry = UNFINISHED[id];
  return entry === undefined || (entry.sizes !== undefined && !entry.sizes.includes(size))
    ? undefined
    : entry.task;
}

async function openEntry(
  page: Page,
  id: string,
  textScale = 1,
  lang: Language = 'en',
): Promise<void> {
  await openGalleryEntry(page, id, inLanguage(lang));
  if (textScale !== 1) {
    await page.evaluate((scale) => {
      document.documentElement.style.setProperty('--text-scale', String(scale));
    }, textScale);
  }
  // Lets layout that reacts to its own size, such as a showdown list collapsing, settle first.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Every game entry of the gallery, in its order. */
async function gameEntries(page: Page): Promise<string[]> {
  await page.goto('/#/dev/gallery');
  await page.locator('[data-entry]').first().waitFor();
  return page
    .locator('[data-entry][data-game="true"]')
    .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset['entry'] ?? ''));
}

/** The page's and the game body's scroll heights, and where the frame's parts are. */
const measure = (page: Page, inline: string | undefined) =>
  page.evaluate((inlineId) => {
    const body = document.querySelector<HTMLElement>('[data-part="screen"] main');
    const bar = document.querySelector<HTMLElement>('header.app-bar');
    const footer = document.querySelector<HTMLElement>('[data-part="screen"] > .footer');
    const box = (element: Element | null) => {
      const rect = element?.getBoundingClientRect();
      return rect === undefined ? null : { top: rect.top, bottom: rect.bottom };
    };
    return {
      page: document.scrollingElement?.scrollHeight ?? Infinity,
      viewport: window.innerHeight,
      content: body?.scrollHeight ?? Infinity,
      shown: body?.clientHeight ?? 0,
      // The height of the banners shown under the bar; hidden ones, kept for screen readers, take none.
      banners: Array.from(document.querySelectorAll('[data-part="banners"] > *'))
        .filter((banner) => !banner.classList.contains('visually-hidden'))
        .reduce((sum, banner) => sum + banner.getBoundingClientRect().height, 0),
      bodyScrolls: body === null ? null : getComputedStyle(body).overflowY,
      bar: box(bar),
      footer: box(footer),
      actions: Array.from(footer?.querySelectorAll('button') ?? []).map((button) => ({
        id: button.dataset['testid'] ?? '',
        ...box(button)!,
      })),
      inline:
        inlineId === undefined ? null : box(document.querySelector(`[data-testid="${inlineId}"]`)),
      strips: [
        box(document.querySelector('[data-testid="opponent"]')),
        box(document.querySelector('[data-testid="my-area"]')),
      ],
    };
  }, inline);

type Measure = Awaited<ReturnType<typeof measure>>;

/** The bar on top, the phase bar at the bottom, and the expected actions inside the viewport. */
function expectFrame(id: string, where: string, m: Measure): void {
  const expected = ACTIONS[id];
  if (expected === undefined) throw new Error(`${id} has no expected actions`);
  expect.soft(m.page, `${where}: the page never scrolls`).toBeLessThanOrEqual(m.viewport);
  expect.soft(m.bodyScrolls, `${where}: only the body scrolls`).toBe('auto');
  expect.soft(m.bar?.top, `${where}: the bar is at the top`).toBe(0);
  if (expected.footer === false) {
    expect.soft(m.footer, `${where}: no phase bar`).toBeNull();
  } else {
    expect
      .soft(m.footer?.bottom ?? Infinity, `${where}: phase bar`)
      .toBeLessThanOrEqual(m.viewport);
  }
  expect
    .soft(
      m.actions.map((action) => action.id),
      `${where}: the phase bar's actions`,
    )
    .toEqual(expected.bar);
  for (const action of m.actions) {
    expect.soft(action.bottom, `${where}: ${action.id} on screen`).toBeLessThanOrEqual(m.viewport);
    expect.soft(action.top, `${where}: ${action.id} on screen`).toBeGreaterThanOrEqual(0);
  }
  if (expected.inline !== undefined) {
    expect.soft(m.inline, `${where}: ${expected.inline} is shown`).not.toBeNull();
    expect
      .soft(m.inline?.bottom ?? Infinity, `${where}: ${expected.inline} on screen`)
      .toBeLessThanOrEqual(m.viewport);
  }
  for (const strip of m.strips) {
    if (strip === null) continue;
    expect
      .soft(strip.top, `${where}: strip below the bar`)
      .toBeGreaterThanOrEqual(m.bar?.bottom ?? 0);
  }
}

test('the table frame keeps its bar, strips and phase bar on screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  test.setTimeout(240_000);
  const ids = await gameEntries(page);
  expect(ids.length).toBeGreaterThan(10);
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const id of ids) {
      await openEntry(page, id);
      expectFrame(
        id,
        `${id} at ${size.width}×${size.height}`,
        await measure(page, ACTIONS[id]?.inline),
      );
    }
  }
});

for (const lang of OVERFLOW_LANGUAGES) {
  test(
    inLanguageTitle('at 150% text only the middle scrolls and the bar and phase bar stay', lang),
    languageDetails(lang),
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 360, height: 640 });
      for (const id of await gameEntries(page)) {
        await openEntry(page, id, 1.5, lang);
        const m = await measure(page, ACTIONS[id]?.inline);
        expectFrame(id, `${id} at 150%`, m);
        expect.soft(m.shown, `${id} at 150%: the middle keeps some room`).toBeGreaterThan(100);
      }
    },
  );
}

test.describe('game screens fit without scrolling', () => {
  test('the action list names every game entry', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'the gallery is the same in every project');
    expect((await gameEntries(page)).sort()).toEqual(Object.keys(ACTIONS).sort());
  });

  for (const lang of OVERFLOW_LANGUAGES) {
    for (const id of Object.keys(ACTIONS)) {
      for (const size of SIZES) {
        const name = `${size.width}×${size.height}`;
        test(
          inLanguageTitle(`${id} at ${name}`, lang),
          languageDetails(lang),
          async ({ page }, info) => {
            test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
            await page.setViewportSize(size);
            await openEntry(page, id, 1, lang);
            const m = await measure(page, ACTIONS[id]?.inline);
            expectFrame(id, name, m);
            const task = unfinished(id, name);
            if (m.banners > 0 && m.content > m.shown) {
              // While a banner is shown, the middle may scroll by as much as the banner takes.
              expect(task, 'a banner entry is never unfinished').toBeUndefined();
              expect(m.content, 'it fits without the banner').toBeLessThanOrEqual(
                m.shown + m.banners,
              );
              expect(m.shown, 'the middle keeps some room').toBeGreaterThan(100);
            } else if (task === undefined) {
              expect(m.content, 'the body never scrolls').toBeLessThanOrEqual(m.shown);
            } else {
              expect(
                m.content,
                `still overflows (${task}); take it off UNFINISHED once it fits`,
              ).toBeGreaterThan(m.shown);
            }
          },
        );
      }
    }
  }
});

test.describe('a German showdown with long names fits at 100 % text', () => {
  for (const id of ['replay-showdown', 'table-round-summary']) {
    test(`${id} at 360×640 (de)`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
      await page.setViewportSize({ width: 360, height: 640 });
      await openGalleryEntry(page, id, inLanguage('de', 'names=long'));
      await page.evaluate(async () => {
        await document.fonts.ready;
        for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
      });
      const m = await measure(page, ACTIONS[id]?.inline);
      expectFrame(id, `${id} with long names`, m);
      expect(m.content, 'the body never scrolls').toBeLessThanOrEqual(m.shown);
    });
  }
});

/** Where the plan's parts are: target rows, the hand's cards and the strips around them. */
const measurePlan = (page: Page) =>
  page.evaluate(() => {
    const box = (element: Element) => element.getBoundingClientRect();
    const frames = Array.from(document.querySelectorAll('[data-testid="plan-characters"] .frame'));
    const outline = (frame: Element) => {
      const style = getComputedStyle(frame);
      return parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    };
    return {
      targetRows: Array.from(document.querySelectorAll('[data-testid^="target-"]'), (card) =>
        Math.round(box(card).top),
      ),
      targetsBottom: box(document.querySelector('[data-testid="plan-targets"]')!).bottom,
      hand: frames.map((frame) => ({
        top: box(frame).top,
        bottom: box(frame).bottom,
        chosen: frame.classList.contains('selected'),
        outline: frame.classList.contains('selected') ? outline(frame) : 0,
      })),
      myStripTop: box(document.querySelector('[data-testid="my-area"]')!).top,
      popovers: document.querySelectorAll('[data-part="popover"], [data-part="reason"]').length,
    };
  });

test('the plan shows five then four targets, the hand along the bottom and no large card', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  for (const size of SIZES) {
    const where = `${size.width}×${size.height}`;
    await page.setViewportSize(size);
    await openEntry(page, 'table-plan');
    const m = await measurePlan(page);
    const rows = [...new Set(m.targetRows)];
    expect(m.targetRows, `${where}: nine targets`).toHaveLength(9);
    expect(rows, `${where}: two rows of targets`).toHaveLength(2);
    expect(
      m.targetRows.filter((top) => top === rows[0]),
      `${where}: five on top`,
    ).toHaveLength(5);
    for (const card of m.hand) {
      expect(card.bottom, `${where}: the hand sits above my strip`).toBeLessThanOrEqual(
        m.myStripTop,
      );
    }
    expect(m.popovers, `${where}: no large card or reason is open`).toBe(0);
  }
});

test('the chosen hand card rises', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  for (const size of SIZES) {
    const where = `${size.width}×${size.height}`;
    await page.setViewportSize(size);
    await openEntry(page, 'table-plan');
    const m = await measurePlan(page);
    const chosen = m.hand.filter((card) => card.chosen);
    expect(chosen, `${where}: one chosen card`).toHaveLength(1);
    const raised = chosen[0]!;
    for (const other of m.hand.filter((card) => !card.chosen)) {
      expect(other.top - raised.top, `${where}: it rises 14 px`).toBeCloseTo(14, 0);
    }
    expect(raised.top, `${where}: it clears the Targets panel by 4 px`).toBeGreaterThanOrEqual(
      m.targetsBottom + 4,
    );
    expect(
      raised.top - raised.outline,
      `${where}: its outline stays off the Targets panel`,
    ).toBeGreaterThan(m.targetsBottom);
  }
});

test('a long opponent name stays on one line and the plan still fits', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  await page.setViewportSize({ width: 360, height: 640 });
  await openEntry(page, 'table-plan-long-name');
  const name = page.getByTestId('opponent').getByRole('heading', { level: 2 });
  await expect(name).toHaveText('Maximiliane-Alexandra-Ro');
  await expect(name).toHaveAttribute('title', 'Maximiliane-Alexandra-Ro');
  await expect(page.getByTestId('opponent')).toHaveAccessibleName(
    'Opponent: Maximiliane-Alexandra-Ro',
  );
  const m = await name.evaluate((heading) => {
    const style = getComputedStyle(heading);
    const body = document.querySelector<HTMLElement>('[data-part="screen"] main')!;
    const connection = document.querySelector('[data-testid="opponent-connection"]')!;
    const range = document.createRange();
    range.selectNodeContents(heading);
    const fitted = heading.style.fontSize;
    heading.style.fontSize = '';
    const normal = parseFloat(getComputedStyle(heading).fontSize);
    heading.style.fontSize = fitted;
    return {
      size: parseFloat(style.fontSize),
      normal,
      height: heading.getBoundingClientRect().height,
      lineHeight: parseFloat(style.lineHeight),
      truncated: range.getBoundingClientRect().width > heading.getBoundingClientRect().width + 0.01,
      sameRow:
        Math.abs(connection.getBoundingClientRect().top - heading.getBoundingClientRect().top) <
        heading.getBoundingClientRect().height,
      content: body.scrollHeight,
      shown: body.clientHeight,
    };
  });
  expect(m.height, 'the name is one line').toBeLessThanOrEqual(m.lineHeight + 1);
  expect(m.size / m.normal, 'the name shrinks to fit').toBeLessThan(1);
  expect(m.size / m.normal, 'the name is 80 % of its size or more').toBeGreaterThanOrEqual(
    0.8 - 1e-3,
  );
  if (m.truncated) {
    expect(m.size / m.normal, 'the name is cut only at 80 %').toBeCloseTo(0.8, 3);
  }
  expect(m.sameRow, 'the connection stays beside the name').toBe(true);
  expect(m.content, 'the plan still fits').toBeLessThanOrEqual(m.shown);
});

/** The showdown's steps: their state, their height and their text's own line height. */
const measureSteps = (page: Page) =>
  page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="showdown-steps"] > li'),
      (li) => {
        const text = li.querySelector<HTMLElement>('[data-part="rich-text"]')!;
        return {
          done: li.classList.contains('done'),
          now: li.classList.contains('now'),
          out: li.classList.contains('out'),
          collapsed: li.classList.contains('collapsed'),
          lines: Math.round(
            text.getBoundingClientRect().height / parseFloat(getComputedStyle(li).lineHeight),
          ),
          cut: text.parentElement!.scrollWidth > text.parentElement!.clientWidth,
        };
      },
    ),
  );

/** How far the middle's content falls short of the room it has: the space left under its last part. */
const slack = (page: Page) =>
  page.evaluate(() => {
    const middle = document.querySelector<HTMLElement>('[data-testid="phase-panels"]')!;
    const parts = Array.from(middle.children).filter(
      (child) => !child.classList.contains('visually-hidden'),
    );
    return middle.getBoundingClientRect().bottom - parts.at(-1)!.getBoundingClientRect().bottom;
  });

test('long showdown lists collapse rather than scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  const ENTRY = 'table-showdown-elimination';
  // Tall enough that the whole list fits uncollapsed, to find how much room it needs.
  await page.setViewportSize({ width: 360, height: 1000 });
  await openEntry(page, ENTRY);
  const roomy = await measureSteps(page);
  expect(
    roomy.every((step) => !step.collapsed),
    'nothing collapses while there is room',
  ).toBe(true);
  const earlierLines = roomy.filter((step) => step.done).map((step) => step.lines);
  expect(
    earlierLines.some((lines) => lines > 1),
    'an earlier result needs more than one line',
  ).toBe(true);

  // 12 px too short for the uncollapsed list, so it must collapse to fit.
  const height = Math.round(1000 - (await slack(page)) - 12);
  await page.setViewportSize({ width: 360, height });
  await openEntry(page, ENTRY);
  const m = await measure(page, undefined);
  expect(m.content, `the body never scrolls at 360×${height}`).toBeLessThanOrEqual(m.shown);
  expect(m.page, 'the page never scrolls').toBeLessThanOrEqual(m.viewport);
  const steps = await measureSteps(page);
  const earlier = steps.filter((step) => step.done);
  expect(earlier.length, 'some earlier steps').toBeGreaterThan(0);
  for (const step of earlier) {
    expect(step.collapsed, 'an earlier step collapses').toBe(true);
    expect(step.lines, 'to one line').toBe(1);
  }
  const out = steps.filter((step) => step.out);
  expect(out.length, 'a character is eliminated').toBeGreaterThan(0);
  for (const step of out) {
    expect(step.collapsed, "an eliminated character's step collapses too").toBe(true);
    expect(step.lines, 'to one line').toBe(1);
  }
  expect(
    steps.filter((step) => step.now),
    'the round summary is the latest result',
  ).toEqual([]);
  await expect(page.getByTestId('round-summary')).toHaveClass(/\blatest\b/);
  await expect(page.getByTestId('round-summary')).toBeInViewport({ ratio: 1 });

  // While the showdown is still being stepped through, the latest step stays whole.
  await page.setViewportSize({ width: 360, height: 640 });
  await openEntry(page, 'table-showdown');
  const now = (await measureSteps(page)).filter((step) => step.now);
  expect(now).toHaveLength(1);
  expect(now[0]!.collapsed, 'the latest step stays whole').toBe(false);
  expect(now[0]!.cut, 'and is not cut').toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await openEntry(page, 'table-round-summary');
  for (const step of await measureSteps(page)) {
    expect(step.collapsed, 'nothing collapses while there is room').toBe(false);
  }
});

/** Cards drawn smaller than their size, and the screens that draw them so. */
const SHRUNK_CARDS = [
  {
    what: 'the tight round summary',
    id: 'replay-showdown',
    scale: 1,
    card: 'round-set-aside-card',
  },
  { what: 'a tight plan panel', id: 'replay-showdown', scale: 1, card: 'plan-panels' },
  {
    what: 'the reveal at 150 %',
    id: 'table-reveal-hourglasses',
    scale: 1.5,
    card: 'reveal-my-card',
  },
] as const;

test('a card drawn smaller shows its enlarged copy at full size beside it on keyboard focus', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard focus at a fixed size');
  await page.setViewportSize({ width: 360, height: 640 });
  for (const { what, id, scale, card } of SHRUNK_CARDS) {
    await page.goto('about:blank');
    await openEntry(page, id, scale);
    const holder = page.getByTestId(card);
    const button = (await holder.evaluate((element) => element.tagName === 'BUTTON'))
      ? holder
      : holder.getByRole('button').first();
    expect(
      await button.evaluate((element) => element.currentCSSZoom),
      `${what} is shrunk`,
    ).toBeLessThan(1);
    let focused = false;
    for (let press = 0; press < MAX_TABS && !focused; press++) {
      await page.keyboard.press('Tab');
      focused = await button.evaluate((element) => element === document.activeElement);
    }
    expect(focused, `${what}: the card takes keyboard focus`).toBe(true);
    const popover = page.locator('[data-part="popover"]');
    await expect(popover, `${what}: the enlarged card opens`).toBeVisible();
    const m = await popover.evaluate(
      (element, buttonBox) => {
        const face = element.querySelector('.popover-card')!.getBoundingClientRect();
        const own = element.getBoundingClientRect();
        return {
          drawn: face.width,
          size: parseFloat(getComputedStyle(document.documentElement).fontSize) * 7.5,
          own: { left: own.left, right: own.right, top: own.top, bottom: own.bottom },
          card: buttonBox,
        };
      },
      (await button.boundingBox())!,
    );
    expect(m.drawn, `${what}: drawn at the large card's full size`).toBeCloseTo(m.size, 0);
    expect(m.own.left, `${what}: inside the screen`).toBeGreaterThanOrEqual(0);
    expect(m.own.right, `${what}: inside the screen`).toBeLessThanOrEqual(360);
    const beside = m.own.bottom <= m.card.y + 1 || m.own.top >= m.card.y + m.card.height - 1;
    expect(beside, `${what}: above or below the card`).toBe(true);
    const centre = m.card.x + m.card.width / 2;
    const clamped = m.own.left <= 6.5 || m.own.right >= 360 - 6.5;
    if (!clamped) {
      expect(
        Math.abs((m.own.left + m.own.right) / 2 - centre),
        `${what}: centred on the card`,
      ).toBeLessThanOrEqual(1);
    }
  }
});

/** The WCAG contrast ratio of two computed `rgb()` colours. */
function contrast(a: string, b: string): number {
  const luminance = (colour: string): number => {
    const [r, g, b] = (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

test('showdown steps are marked by more than colour and keep their contrast', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  await page.setViewportSize({ width: 390, height: 844 });
  const looks = [
    { theme: 'light', contrast: null },
    { theme: 'dark', contrast: null },
    { theme: 'dark', contrast: 'high' },
  ];
  for (const look of looks) {
    const where = `${look.theme}${look.contrast === null ? '' : ', high contrast'}`;
    for (const id of ['table-showdown', 'table-showdown-elimination']) {
      await openEntry(page, id);
      await page.evaluate(({ theme, contrast }) => {
        document.documentElement.dataset['theme'] = theme;
        if (contrast === null) delete document.documentElement.dataset['contrast'];
        else document.documentElement.dataset['contrast'] = contrast;
      }, look);
      const rows = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>('[data-testid="showdown-steps"] > li'),
          (li) => {
            const style = getComputedStyle(li);
            const text = getComputedStyle(li.querySelector('.text')!);
            // The colour behind an element: each translucent background composited over those below it.
            const behind = (element: Element): string => {
              const layers: number[][] = [];
              for (let at: Element | null = element; at !== null; at = at.parentElement) {
                const [r = 0, g = 0, b = 0, a = 1] = (
                  getComputedStyle(at).backgroundColor.match(/[\d.]+/g) ?? []
                ).map(Number);
                if (a > 0) layers.push([r, g, b, a]);
                if (a >= 1) break;
              }
              let [r, g, b] = [255, 255, 255];
              for (const [lr, lg, lb, la] of layers.reverse()) {
                r = lr! * la! + r * (1 - la!);
                g = lg! * la! + g * (1 - la!);
                b = lb! * la! + b * (1 - la!);
              }
              return `rgb(${r}, ${g}, ${b})`;
            };
            // Every piece of text inside the row, such as muted words and chips, with what is behind it.
            const nested = Array.from(li.querySelectorAll('*'))
              .filter((element) =>
                Array.from(element.childNodes).some(
                  (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== '',
                ),
              )
              .map((element) => {
                let opacity = 1;
                for (let at: Element | null = element; at !== li; at = at!.parentElement) {
                  opacity *= Number(getComputedStyle(at!).opacity);
                }
                return {
                  text: element.textContent!.trim().slice(0, 20),
                  colour: getComputedStyle(element).color,
                  background: behind(element),
                  opacity,
                };
              });
            return {
              nested,
              state: ['done', 'now', 'out'].find((c) => li.classList.contains(c)) ?? '',
              colour: style.color,
              background: style.backgroundColor,
              opacity: Number(style.opacity),
              decoration: text.textDecorationLine,
              ring: style.boxShadow,
              outline: style.outlineStyle,
            };
          },
        ),
      );
      for (const row of rows) {
        const label = `${id}, ${where}, ${row.state}`;
        expect(row.opacity, `${label}: dimmed by colour, not opacity`).toBe(1);
        expect(contrast(row.colour, row.background), `${label}: 4.5:1`).toBeGreaterThanOrEqual(4.5);
        expect(row.nested.length, `${label}: text inside the row`).toBeGreaterThan(0);
        for (const part of row.nested) {
          expect.soft(part.opacity, `${label}, "${part.text}": not faded`).toBe(1);
          expect
            .soft(contrast(part.colour, part.background), `${label}, "${part.text}": 4.5:1`)
            .toBeGreaterThanOrEqual(4.5);
        }
        if (row.state === 'now') {
          expect(row.ring !== 'none' || row.outline !== 'none', `${label}: ring`).toBe(true);
        }
        if (row.state === 'out') {
          expect(row.decoration, `${label}: struck through`).toContain('line-through');
        } else {
          expect(row.decoration, `${label}: not struck through`).not.toContain('line-through');
        }
      }
      if (id === 'table-showdown-elimination') {
        expect(
          rows.some((row) => row.state === 'out'),
          'an eliminated character',
        ).toBe(true);
      } else {
        expect(rows.map((row) => row.state)).toEqual(['done', 'now']);
      }
    }
  }
});

/** The top of each element found by `selectors`, in their order; null for one not found. */
const tops = (page: Page, selectors: string[]) =>
  page.evaluate(
    (list) =>
      list.map((selector) => document.querySelector(selector)?.getBoundingClientRect().top ?? null),
    selectors,
  );

test('game over follows the mockup order', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  for (const size of SIZES) {
    const where = `${size.width}×${size.height}`;
    await page.setViewportSize(size);
    await openEntry(page, 'game-over');
    const bar = page.locator('header.app-bar');
    await expect(bar.getByRole('heading', { level: 1 })).toHaveText('Game over');
    await expect(bar.getByRole('button', { name: 'Back' })).toBeVisible();

    const over = page.getByTestId('game-over');
    const result = over.getByTestId('game-over-result');
    await expect(result.getByRole('heading', { level: 2 })).toHaveText(/^You (win!|lose\.)$/);
    await expect(result.getByTestId('game-over-how')).toHaveText(/ in round \d+\.$/);
    await expect(result.getByTestId('game-over-markers').getByRole('listitem')).toHaveCount(3);
    const history = over.getByRole('region', { name: 'History' });
    await expect(history.getByTestId('history-totals')).toContainText('Played 3');
    await expect(history.getByTestId('history-game')).toHaveCount(3);
    await expect(history.getByRole('link', { name: /^Replay: / })).toHaveCount(3);

    const order = await tops(page, [
      '[data-testid="game-over-result"] h2',
      '[data-testid="game-over-how"]',
      '[data-testid="game-over-markers"]',
      '[data-testid="view-replay"]',
      '[data-testid="history-totals"]',
      '[data-testid="history-game"]',
    ]);
    for (let i = 1; i < order.length; i++) {
      expect(order[i], `${where}: part ${i} is shown`).not.toBeNull();
      expect(order[i]!, `${where}: part ${i} comes after part ${i - 1}`).toBeGreaterThan(
        order[i - 1]!,
      );
    }
    // View replay and Rematch share a row, View replay first and primary.
    const replay = await page.getByTestId('view-replay').boundingBox();
    const rematch = await page.getByTestId('rematch').boundingBox();
    expect(Math.abs(replay!.y - rematch!.y), `${where}: one row`).toBeLessThan(1);
    expect(replay!.x, `${where}: View replay first`).toBeLessThan(rematch!.x);
    await expect(page.getByTestId('view-replay')).toHaveClass(/\bprimary\b/);
    for (const link of await history.getByRole('link', { name: /^Replay: / }).all()) {
      await expect(link).toHaveClass(/\bsmall\b/);
    }
  }
});

test('history rows show result, opponent and replay', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  await page.setViewportSize({ width: 360, height: 640 });
  await openEntry(page, 'history');
  await expect(page.getByTestId('history-totals')).toContainText('Played 3');
  await expect(page.getByRole('link', { name: 'Stats' })).toBeVisible();
  const rows = page.getByTestId('history-game');
  await expect(rows).toHaveCount(3);
  for (const row of await rows.all()) {
    await expect(row.locator('strong').first()).toHaveText(/^(Won|Lost)$/);
    await expect(row).toContainText(/(Won|Lost) vs (Mika|Jun)/);
    await expect(row.getByTestId('history-meta')).toHaveText(/ · \d+ rounds? · /);
    const replay = row.getByRole('link', { name: /^Replay: (Won|Lost) against (Mika|Jun), / });
    await expect(replay).toHaveText('Replay');
    await expect(replay).toHaveClass(/\bsmall\b/);
    // The result and the opponent read on the left, Replay on the right of the same row.
    const text = await row.locator('strong').first().boundingBox();
    const button = await replay.boundingBox();
    expect(button!.x).toBeGreaterThan(text!.x + text!.width);
  }
});

test('replay controls sit in the footer', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  for (const size of SIZES) {
    const where = `${size.width}×${size.height}`;
    await page.setViewportSize(size);
    await openEntry(page, 'replay');
    await expect(page.locator('header.app-bar').getByRole('heading', { level: 1 })).toHaveText(
      'Replay',
    );
    const footer = page.locator('[data-part="screen"] > .footer');
    const names = ['Previous round', 'Previous step', 'Next step', 'Next round'];
    const boxes = [];
    for (const name of names) {
      const button = footer.getByRole('button', { name, exact: true });
      await expect(button, `${where}: ${name} in the footer`).toBeVisible();
      boxes.push((await button.boundingBox())!);
    }
    const position = footer.getByTestId('replay-position');
    await expect(position).toHaveText(/^Step 1 of \d+, round 1$/);
    const middle = (await position.boundingBox())!;
    const xs = [boxes[0]!.x, boxes[1]!.x, middle.x, boxes[2]!.x, boxes[3]!.x];
    expect(xs, `${where}: ⏮ ◀ position ▶ ⏭`).toEqual([...xs].sort((a, b) => a - b));
    for (const box of boxes) {
      expect(Math.abs(box.y + box.height / 2 - (middle.y + middle.height / 2))).toBeLessThan(2);
    }
    const body = page.getByTestId('replay');
    await expect(body.getByRole('radiogroup', { name: 'Viewpoint' })).toBeVisible();
    await expect(body.getByTestId('opponent')).toBeVisible();
    await expect(body.getByTestId('my-area')).toBeVisible();
    await expect(
      body.getByTestId('replay-log').locator('[data-part="rich-text"]').first(),
    ).toBeVisible();

    await openEntry(page, 'replay-showdown');
    await expect(body.getByTestId('plan-panels')).toBeVisible();
    await expect(body.getByTestId('showdown')).toBeVisible();
    await expect(body.getByTestId('showdown-next')).toHaveCount(0);
  }
});

test('in the replay only the step log may scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const id of ['replay', 'replay-showdown', 'replay-hunter', 'replay-long-log']) {
      const where = `${id} at ${size.width}×${size.height}`;
      await openEntry(page, id);
      const scrolling = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('*'))
          .filter((element) => {
            const overflow = getComputedStyle(element).overflowY;
            return (
              (overflow === 'auto' || overflow === 'scroll') &&
              element.scrollHeight > element.clientHeight + 1
            );
          })
          .map((element) => element.dataset['testid'] ?? element.tagName.toLowerCase()),
      );
      expect(
        scrolling.filter((name) => name !== 'replay-log-area'),
        `${where}: nothing else scrolls`,
      ).toEqual([]);
      const log = page.getByTestId('replay-log-area');
      await expect(log, `${where}: the log can be reached to scroll it`).toHaveAttribute(
        'tabindex',
        '0',
      );
      await expect(log, `${where}: the log is on screen`).toBeInViewport();
      if (id === 'replay-long-log' && size.width === 360) {
        // This step's log is longer than its room, so it must scroll inside itself.
        expect(scrolling, `${where}: the log scrolls`).toContain('replay-log-area');
        const last = page.getByTestId('replay-log').locator('li').last();
        await expect(last, `${where}: the last entry starts out of view`).not.toBeInViewport({
          ratio: 1,
        });
        await log.evaluate((area) => area.scrollTo(0, area.scrollHeight));
        await expect(last, `${where}: and can be scrolled to`).toBeInViewport({ ratio: 1 });
      }
    }
  }
});

for (const lang of LANGUAGES) {
  test(
    inLanguageTitle('settings rows put the control on the right', lang),
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'the gallery is measured at fixed sizes');
      for (const size of SIZES) {
        await page.setViewportSize(size);
        for (const id of ['settings-top', 'settings-scrolled', 'settings-install-ios']) {
          const where = `${id} at ${size.width}×${size.height}`;
          await openEntry(page, id, 1, lang);
          const groups = page.getByTestId('settings').locator('section.panel');
          await expect(groups, `${where}: every group is a panel`).toHaveCount(6);
          for (const label of await groups.locator('h2').all()) {
            await expect(label, `${where}: group labels are uppercase`).toHaveCSS(
              'text-transform',
              'uppercase',
            );
          }
          const rows = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLElement>('[data-part="setting"]')).map(
              (row) => {
                const box = (selector: string) => {
                  const rect = row.querySelector(selector)?.getBoundingClientRect();
                  return rect === undefined
                    ? null
                    : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
                };
                const panel = row.closest('.panel')!.getBoundingClientRect();
                const padding = parseFloat(getComputedStyle(row.closest('.panel')!).paddingRight);
                return {
                  name: row.querySelector('[data-part="setting-name"]')?.textContent?.trim() ?? '',
                  label: box('[data-part="setting-name"]'),
                  control: box('[data-part="setting-control"]'),
                  contentRight: panel.right - padding - 1,
                };
              },
            ),
          );
          expect(rows.length, `${where}: settings are rows`).toBeGreaterThanOrEqual(5);
          for (const row of rows) {
            const what = `${where}: ${row.name}`;
            expect(row.label, `${what} has a name`).not.toBeNull();
            expect(row.control, `${what} has a control`).not.toBeNull();
            expect(row.control!.left, `${what}: control after the name`).toBeGreaterThan(
              row.label!.right,
            );
            expect(
              Math.abs(row.control!.right - row.contentRight),
              `${what}: control at the right edge`,
            ).toBeLessThan(1.5);
            const [labelMiddle, controlMiddle] = [row.label!, row.control!].map(
              (box) => (box.top + box.bottom) / 2,
            );
            expect(
              Math.abs(labelMiddle! - controlMiddle!),
              `${what}: name and control on one line`,
            ).toBeLessThan(4);
          }
        }
      }
    },
  );
}

test('text fields and dropdowns are at least 16 px on touch screens', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'a touch screen has a coarse pointer');
  const fields = (where: string) =>
    page.evaluate((label) => {
      const selector =
        'input:not([type="radio"], [type="checkbox"], [type="file"], [type="range"], [hidden]), select, textarea';
      return Array.from(document.querySelectorAll<HTMLElement>(selector)).map((field) => ({
        what: `${label}: ${field.id || field.getAttribute('aria-label') || field.outerHTML.slice(0, 60)}`,
        size: parseFloat(getComputedStyle(field).fontSize),
      }));
    }, where);
  const checked: string[] = [];
  for (const id of [
    'settings-top',
    'join',
    'local-join',
    'rejoin-pin',
    'display-name',
    'new-game',
    'kit',
  ]) {
    await openEntry(page, id);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    // Each of the server's choices is measured, so a field that one of them reveals is too.
    const server = page.getByTestId('server-mode');
    const choices =
      id === 'settings-top'
        ? await server
            .locator('option')
            .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
        : [null];
    for (const choice of choices) {
      if (choice !== null) await server.selectOption(choice);
      for (const field of await fields(id)) {
        if (checked.includes(field.what)) continue;
        checked.push(field.what);
        expect.soft(field.size, field.what).toBeGreaterThanOrEqual(16);
      }
    }
  }
  // Language, Display name, Server and Server address.
  expect(checked.filter((what) => what.startsWith('settings-top: '))).toHaveLength(4);
});

test('the robustness lists name every gallery entry', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the gallery is the same in every project');
  await expectGalleryEntries(page);
});

/** Lets the gallery entry settle at a new text size, as `openEntry` does. */
async function scaleText(page: Page, scale: number): Promise<void> {
  await page.evaluate(async (value) => {
    document.documentElement.style.setProperty('--text-scale', String(value));
    for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
  }, scale);
}

test.describe('no horizontal overflow at 320 px', () => {
  for (const lang of OVERFLOW_LANGUAGES) {
    for (const id of GALLERY_ENTRIES) {
      test(inLanguageTitle(id, lang), languageDetails(lang), async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
        await page.setViewportSize({ width: 320, height: 640 });
        await openGalleryEntry(page, id, inLanguage(lang));
        const wide = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const found: string[] = [];
          const root = document.scrollingElement!;
          if (root.scrollWidth > width) found.push(`the page is ${root.scrollWidth} px wide`);
          for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
            const style = getComputedStyle(element);
            if (element.scrollWidth <= element.clientWidth + 1) continue;
            const what = element.dataset['testid'] ?? element.tagName.toLowerCase();
            if (['auto', 'scroll'].includes(style.overflowX))
              found.push(`${what} scrolls sideways`);
            // Cutting with an ellipsis is by design; anything else clipped sideways is lost.
            else if (
              ['hidden', 'clip'].includes(style.overflowX) &&
              style.textOverflow !== 'ellipsis'
            ) {
              if (element.closest('.visually-hidden') === null)
                found.push(`${what} is cut sideways`);
            }
            // A panel's content that reaches past its sides spills over its border.
            else if (element.classList.contains('panel') && style.overflowX === 'visible') {
              found.push(`${what} spills out of its panel`);
            }
          }
          return found;
        });
        expect(wide).toEqual([]);
      });
    }
  }
});

/**
 * What is clipped or overlaps in the frame: the bar and its parts, the phase bar and its
 * buttons, the cards, and on a game screen anything but the middle that scrolls.
 */
const framingProblems = (page: Page, game: boolean) =>
  page.evaluate((game) => {
    interface Box {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    const found: string[] = [];
    const name = (element: Element) =>
      (element as HTMLElement).dataset['testid'] ??
      (element.textContent?.trim().slice(0, 24) || element.tagName.toLowerCase());
    const overlap = (a: Box, b: Box) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    const inside = (a: Box, b: Box) =>
      a.left >= b.left - 0.5 &&
      a.right <= b.right + 0.5 &&
      a.top >= b.top - 0.5 &&
      a.bottom <= b.bottom + 0.5;
    // The part of an element that its clipping ancestors let show, or null when none does.
    const shown = (element: Element): Box | null => {
      const rect = element.getBoundingClientRect();
      let box: Box = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      for (let up = element.parentElement; up !== null; up = up.parentElement) {
        if (!['auto', 'scroll', 'hidden'].includes(getComputedStyle(up).overflowY)) continue;
        const clip = up.getBoundingClientRect();
        box = {
          left: Math.max(box.left, clip.left),
          right: Math.min(box.right, clip.right),
          top: Math.max(box.top, clip.top),
          bottom: Math.min(box.bottom, clip.bottom),
        };
      }
      return box.right - box.left > 1 && box.bottom - box.top > 1 ? box : null;
    };
    const top = document.querySelector('[data-part="top"]');
    const bar = document.querySelector('header.app-bar');
    const footer = document.querySelector('[data-part="screen"] > .footer');
    const frame: Array<[string, Element | null]> = [
      ['the bar', bar],
      ['the phase bar', footer],
    ];
    for (const [what, element] of frame) {
      if (element === null) continue;
      const box = element.getBoundingClientRect();
      if (box.left < -0.5 || box.right > width + 0.5)
        found.push(`${what} is wider than the screen`);
      if (element.scrollWidth > element.clientWidth + 1) found.push(`${what} is clipped`);
      const parts = Array.from(element.querySelectorAll('h1, button, a[href], p')).filter(
        (part) => part.getBoundingClientRect().width > 1,
      );
      for (const [i, part] of parts.entries()) {
        if (!inside(part.getBoundingClientRect(), box)) {
          found.push(`${name(part)} sticks out of ${what}`);
        }
        for (const other of parts.slice(i + 1)) {
          if (part.contains(other) || other.contains(part)) continue;
          if (overlap(part.getBoundingClientRect(), other.getBoundingClientRect())) {
            found.push(`${name(part)} overlaps ${name(other)} in ${what}`);
          }
        }
      }
    }
    if (top !== null && footer !== null) {
      if (overlap(top.getBoundingClientRect(), footer.getBoundingClientRect())) {
        found.push('the bar overlaps the phase bar');
      }
    }
    const cards = Array.from(document.querySelectorAll('[data-part="face"]')).filter(
      (card) =>
        card.closest('dialog[open], [data-part="popover"]') === null &&
        card.getBoundingClientRect().width > 0,
    );
    for (const [i, card] of cards.entries()) {
      const box = card.getBoundingClientRect();
      if (box.left < -0.5 || box.right > width + 0.5)
        found.push(`${name(card)} is cut at the side`);
      // An ancestor that clips without scrolling must hold the card whole.
      for (let up = card.parentElement; up !== null; up = up.parentElement) {
        const style = getComputedStyle(up);
        const clips = (overflow: string) => overflow === 'hidden' || overflow === 'clip';
        if (!clips(style.overflowX) && !clips(style.overflowY)) continue;
        if (!inside(box, up.getBoundingClientRect())) {
          found.push(`${name(card)} is cut by ${name(up)}`);
        }
      }
      const seen = shown(card);
      if (seen === null) continue;
      for (const [what, element] of [
        ['the bar', top],
        ['the phase bar', footer],
      ] as const) {
        if (element !== null && overlap(seen, element.getBoundingClientRect())) {
          found.push(`${name(card)} is under ${what}`);
        }
      }
      // The hand is fanned, so its cards overlap on purpose.
      if (card.closest('[data-testid="plan-characters"]') !== null) continue;
      for (const other of cards.slice(i + 1)) {
        if (other.closest('[data-testid="plan-characters"]') !== null) continue;
        const theirs = shown(other);
        if (theirs !== null && overlap(seen, theirs)) {
          found.push(`${name(card)} overlaps ${name(other)}`);
        }
      }
    }
    if (game) {
      if (document.scrollingElement!.scrollHeight > height) found.push('the page scrolls');
      if (bar !== null && Math.abs(bar.getBoundingClientRect().top) > 0.5) {
        found.push('the bar is not at the top');
      }
      if (footer !== null && footer.getBoundingClientRect().bottom > height + 0.5) {
        found.push('the phase bar is below the screen');
      }
      const middle = document.querySelector('[data-part="screen"] main');
      for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        if (element === middle || element.dataset['testid'] === 'replay-log-area') continue;
        if (element.closest('dialog[open]') !== null) continue;
        if (!['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) continue;
        if (element.scrollHeight > element.clientHeight + 1) found.push(`${name(element)} scrolls`);
      }
    }
    return found;
  }, game);

test.describe('layout survives 150% text and a 24-character name', () => {
  for (const lang of OVERFLOW_LANGUAGES) {
    for (const id of GALLERY_ENTRIES) {
      test(inLanguageTitle(id, lang), languageDetails(lang), async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
        await page.setViewportSize({ width: 360, height: 640 });
        await openGalleryEntry(page, id, inLanguage(lang, 'names=long'));
        await scaleText(page, 1.5);
        expect(await framingProblems(page, ACTIONS[id] !== undefined)).toEqual([]);
      });
    }
  }
});

/**
 * What has focus, which of the bar and the phase bar covers it, and whether it had focus before
 * in this pass, which marks the elements it reaches.
 */
const focusCover = (page: Page, pass: string) =>
  page.evaluate((pass) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return null;
    const what = active.dataset['testid'] ?? active.textContent?.trim().slice(0, 30) ?? '';
    const again = active.dataset['focusPass'] === pass;
    active.dataset['focusPass'] = pass;
    const covered: string[] = [];
    // A dialog or sheet sits above both bars, and the bars' own controls are never under them.
    if (active.closest('dialog[open], [data-part="top"], [data-part="screen"] > .footer')) {
      return { what, covered, again };
    }
    const box = active.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) return { what, covered, again };
    for (const [name, selector] of [
      ['the bar', '[data-part="top"]'],
      ['the phase bar', '[data-part="screen"] > .footer'],
    ] as const) {
      const bar = document.querySelector(selector)?.getBoundingClientRect();
      if (bar === undefined) continue;
      if (
        Math.min(box.bottom, bar.bottom) - Math.max(box.top, bar.top) > 0.5 &&
        Math.min(box.right, bar.right) - Math.max(box.left, bar.left) > 0.5
      ) {
        covered.push(name);
      }
    }
    return { what, covered, again };
  }, pass);

/** At most this many presses of Tab in each direction. */
const MAX_TABS = 60;

test.describe('the bar and phase bar never cover focused elements', () => {
  for (const id of GALLERY_ENTRIES) {
    test(id, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'keyboard focus at a fixed size');
      await page.setViewportSize({ width: 360, height: 640 });
      for (const scale of [1, 1.5]) {
        // A fresh page, since a hash URL opened again keeps the page and the marks of the last pass.
        await page.goto('about:blank');
        await openGalleryEntry(page, id);
        await scaleText(page, scale);
        for (const key of ['Tab', 'Shift+Tab']) {
          let reached = 0;
          for (let press = 0; press < MAX_TABS; press++) {
            await page.keyboard.press(key);
            const focus = await focusCover(page, key);
            if (focus === null) continue;
            if (focus.again) break;
            reached++;
            expect
              .soft(focus.covered, `${id} at ${scale * 100}% (${key}): ${focus.what}`)
              .toEqual([]);
          }
          expect(
            reached,
            `${id} at ${scale * 100}% (${key}): focus reached something`,
          ).toBeGreaterThan(0);
        }
      }
    });
  }
});

test('the bar stays at the top of a screen that scrolls', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
  await page.setViewportSize({ width: 360, height: 640 });
  let scrolled = 0;
  for (const id of GALLERY_ENTRIES.filter((entry) => ACTIONS[entry] === undefined)) {
    await openGalleryEntry(page, id);
    const m = await page.evaluate(async () => {
      const root = document.scrollingElement!;
      const scrolls = root.scrollHeight > window.innerHeight;
      root.scrollTo(0, root.scrollHeight);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const bar = document.querySelector('header.app-bar')?.getBoundingClientRect();
      return { scrolls, moved: root.scrollTop, top: bar?.top ?? null };
    });
    if (!m.scrolls || m.top === null) continue;
    scrolled++;
    expect.soft(m.moved, `${id}: the page scrolled`).toBeGreaterThan(0);
    expect.soft(m.top, `${id}: the bar stays at the top`).toBe(0);
  }
  expect(scrolled, 'some screens scroll').toBeGreaterThan(3);
});
for (const lang of LANGUAGES) {
  test(
    inLanguageTitle(
      'the opponent strip puts the Badge under the plan status, at its right edge',
      lang,
    ),
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
      for (const size of [{ width: 320, height: 640 }, ...SIZES]) {
        await page.setViewportSize(size);
        for (const id of ['table-plan', 'table-plan-sealed', 'table-showdown']) {
          await openEntry(page, id, 1, lang);
          const where = `${id} at ${size.width}×${size.height}`;
          const strip = page.getByTestId('opponent');
          const status = await strip.getByTestId('opponent-plan').boundingBox();
          const badge = await strip.getByTestId('opponent-badge').boundingBox();
          if (status === null || badge === null) throw new Error(`${where}: no status or Badge`);
          expect
            .soft(badge.y, `${where}: under the status`)
            .toBeGreaterThanOrEqual(status.y + status.height);
          expect
            .soft(
              Math.abs(badge.x + badge.width - (status.x + status.width)),
              `${where}: right edges`,
            )
            .toBeLessThanOrEqual(1);
        }
      }
    },
  );
}

for (const lang of LANGUAGES) {
  test(
    inLanguageTitle('showdown plan panels give the order and the initiative a line each', lang),
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
      /** Each panel's order lines: their text, how many line boxes each takes and whether it stays inside. */
      const orderLines = () =>
        page.locator('[data-testid^="plan-panel-"]').evaluateAll((items) =>
          items.map((panel) => {
            const edge = panel.getBoundingClientRect();
            return Array.from(
              panel.querySelectorAll<HTMLElement>('[data-part="plan-order"]'),
              (line) => {
                const range = document.createRange();
                range.selectNodeContents(line);
                const rects = Array.from(range.getClientRects());
                return {
                  text: line.textContent?.trim() ?? '',
                  lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
                  inside: rects.every((rect) => rect.right <= edge.right + 0.5),
                };
              },
            );
          }),
        );
      for (const size of [{ width: 320, height: 640 }, ...SIZES]) {
        await page.setViewportSize(size);
        for (const scale of [1, 1.5]) {
          for (const id of ['table-showdown', 'table-round-summary', 'replay-showdown']) {
            await openEntry(page, id, scale, lang);
            for (const probe of ['as shown', 'with a changed initiative']) {
              if (probe !== 'as shown') {
                // The longest initiative a panel can show, as after placing Hourglasses.
                const probed = await page.evaluate(async () => {
                  const texts: string[] = [];
                  for (const panel of Array.from(
                    document.querySelectorAll('[data-testid^="plan-panel-"]'),
                  )) {
                    const initiative = panel.querySelectorAll('[data-part="plan-order"]')[1];
                    if (initiative !== undefined) {
                      initiative.textContent = initiative.textContent!.replace(/\d.*$/u, '8 → 0');
                      texts.push(initiative.textContent);
                    }
                  }
                  await new Promise((done) =>
                    requestAnimationFrame(() => requestAnimationFrame(done)),
                  );
                  return texts;
                });
                expect(probed, 'both panels show the longest initiative').toHaveLength(2);
                for (const text of probed) expect(text).toMatch(/8 → 0$/u);
              }
              const where = `${id} at ${size.width}×${size.height}, ${scale * 100} %, ${probe}`;
              const panels = await orderLines();
              expect(panels, `${where}: two plan panels`).toHaveLength(2);
              for (const lines of panels) {
                expect.soft(lines, `${where}: an order and an initiative`).toHaveLength(2);
                if (lang === 'en') {
                  expect.soft(lines[0]?.text, `${where}: order`).toMatch(/^(First|Second)$/);
                  expect.soft(lines[1]?.text, `${where}: initiative`).toMatch(/^Initiative /);
                }
                for (const line of lines) {
                  expect.soft(line.lines, `${where}: "${line.text}" on one line`).toBe(1);
                  expect.soft(line.inside, `${where}: "${line.text}" inside its panel`).toBe(true);
                }
              }
            }
          }
        }
      }
    },
  );
}

test('replay hand cards are never raised', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await openEntry(page, 'replay');
    for (const view of ['My view', 'Full']) {
      await page.getByRole('radio', { name: view }).check();
      const hands = await page
        .locator('[data-testid^="replay-hand-"] .cards')
        .evaluateAll((lists) =>
          lists.map((list) =>
            Array.from(
              list.children,
              (item) => Math.round(item.getBoundingClientRect().top * 10) / 10,
            ),
          ),
        );
      expect(hands.length, 'a hand of cards is shown').toBeGreaterThan(0);
      for (const tops of hands) {
        expect.soft(new Set(tops).size, `cards share one top: ${tops.join(', ')}`).toBe(1);
      }
    }
  }
});

test('the game menu centres the unofficial notice', async ({ page }) => {
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await openEntry(page, 'table-menu');
    const m = await page
      .getByTestId('game-menu')
      .getByTestId('unofficial-notice')
      .evaluate((notice) => {
        const range = document.createRange();
        range.selectNodeContents(notice);
        const text = range.getBoundingClientRect();
        const sheet = notice
          .closest('dialog, details, [data-testid="game-menu"]')!
          .getBoundingClientRect();
        return {
          align: getComputedStyle(notice).textAlign,
          text: text.left + text.width / 2,
          sheet: sheet.left + sheet.width / 2,
        };
      });
    expect(m.align).toBe('center');
    expect(Math.abs(m.text - m.sheet), `centred at ${size.width}`).toBeLessThanOrEqual(1);
  }
});

/** Harnesses of the fitted frame itself, which are not screens of the app. */
const FRAME_HARNESSES = ['kit-fit', 'kit-fit-overflow'];

/** The unofficial notice in each language. */
const UNOFFICIAL: Readonly<Record<(typeof LANGUAGES)[number], string>> = {
  en: 'An unofficial digital version of Werewolf: Duel!',
  de: 'Eine inoffizielle digitale Version von Werewolf: Duel!',
  ja: 'Werewolf: Duel!の非公式デジタル版です',
};

test.describe('the unofficial notice is shown, or one bar control away', () => {
  for (const lang of LANGUAGES) {
    for (const id of GALLERY_ENTRIES.filter((entry) => !FRAME_HARNESSES.includes(entry))) {
      test(inLanguageTitle(id, lang), async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
        for (const size of SIZES) {
          const where = `${id} at ${size.width}×${size.height}`;
          await page.setViewportSize(size);
          await openGalleryEntry(page, id, inLanguage(lang));
          const shown = page.getByTestId('unofficial-notice');
          if ((await shown.count()) > 0) {
            await expect(shown.first(), where).toHaveText(UNOFFICIAL[lang]);
            await expect(shown.first(), where).toBeVisible();
            const foot = page.locator('[data-part="screen"][data-fit] > [data-part="note"]');
            if ((await foot.count()) > 0) {
              const notice = foot.getByTestId('unofficial-notice');
              await expect(notice, `${where}: at the foot of a fitted screen`).toBeInViewport({
                ratio: 1,
              });
              const m = await notice.evaluate((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                const text = range.getBoundingClientRect();
                const box = element.getBoundingClientRect();
                return {
                  lines: new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)))
                    .size,
                  offset: text.left + text.width / 2 - (box.left + box.width / 2),
                };
              });
              expect(m.lines, `${where}: one line`).toBe(1);
              expect(Math.abs(m.offset), `${where}: centred`).toBeLessThanOrEqual(1);
            }
            continue;
          }
          for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()) > 0; i++) {
            await page.keyboard.press('Escape');
          }
          const openers = page.locator('header.app-bar [aria-haspopup="dialog"]');
          const sheet = page.locator('dialog[open]');
          let found = false;
          for (let i = 0; !found && i < (await openers.count()); i++) {
            await openers.nth(i).click();
            await expect(sheet, `${where}: bar control ${i} opens a sheet`).toHaveCount(1);
            found = await sheet.getByTestId('unofficial-notice').isVisible();
            if (found) {
              await expect(sheet.getByTestId('unofficial-notice')).toHaveText(UNOFFICIAL[lang]);
            } else {
              await page.keyboard.press('Escape');
              await expect(sheet).toHaveCount(0);
            }
          }
          expect(found, `${where}: a bar control opens a sheet showing the notice`).toBe(true);
        }
      });
    }
  }
});

test('the spacing between prose list items never shifts a row or grid of items', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of GALLERY_ENTRIES) {
    await openGalleryEntry(page, id);
    const shifted = await page.evaluate(() =>
      Array.from(document.querySelectorAll('li + li'))
        .filter((item) => {
          const display = getComputedStyle(item.parentElement!).display;
          return /flex|grid/.test(display) && parseFloat(getComputedStyle(item).marginTop) !== 0;
        })
        .map((item) => item.parentElement!.outerHTML.slice(0, 80)),
    );
    expect.soft(shifted, id).toEqual([]);
  }
});

for (const lang of LANGUAGES) {
  test(
    inLanguageTitle('each Play hint stays on one line at 360 px', lang),
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
      await page.setViewportSize({ width: 360, height: 640 });
      for (const id of ['new-game', 'join', 'local-join']) {
        await openGalleryEntry(page, id, inLanguage(lang));
        const hint = page.getByTestId('place-hint');
        await expect(hint).toHaveCount(1);
        const choice = page.locator(`[aria-describedby="${await hint.getAttribute('id')}"]`);
        await expect(choice.getByRole('radio')).toHaveCount(2);
        for (const option of [0, 1]) {
          await choice.getByRole('radio').nth(option).check();
          const lines = await hint.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
          });
          expect.soft(lines, `${id}, option ${option + 1}: "${await hint.textContent()}"`).toBe(1);
        }
      }
    },
  );
}

/** Each group of one-line labels that fit themselves, and the gallery entries that show it. */
const FITTED_LABELS: ReadonlyArray<{ group: string; selector: string; entries: string[] }> = [
  {
    group: 'bar title',
    selector: '[data-part="bar-title"]',
    entries: ['table-plan', 'settings-top', 'how-to-play'],
  },
  {
    group: 'segmented option',
    selector: '[role="radiogroup"] label > span',
    entries: ['new-game', 'settings-top'],
  },
  {
    group: 'plan status chip',
    selector: '[data-testid="opponent-plan"] [data-part="label"]',
    entries: ['table-plan', 'table-plan-sealed', 'table-showdown'],
  },
  {
    group: 'Badge chip',
    selector: '[data-testid$="-badge"] [data-part="label"]',
    entries: ['table-plan', 'table-showdown'],
  },
  {
    group: 'phase bar action',
    selector: '[data-part="screen"] > .footer button [data-part="label"]',
    entries: [
      'table-plan',
      'table-reveal-hourglasses',
      'table-reveal-potion',
      'table-showdown',
      'table-paused',
    ],
  },
  {
    group: 'plan panel order line',
    selector: '[data-part="plan-order"]',
    entries: ['table-showdown', 'table-round-summary'],
  },
  {
    group: 'opponent name',
    selector: '[data-testid="opponent"] h2',
    entries: ['table-plan', 'table-plan-long-name'],
  },
  {
    group: 'opponent Hourglass caption',
    selector: '[data-testid="opponent-hourglasses"]',
    entries: ['table-reveal-potion'],
  },
];

for (const lang of LANGUAGES) {
  test(
    inLanguageTitle(
      'one-line labels fit their box at 80 % of their size or more, else end in an ellipsis',
      lang,
    ),
    async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
      test.setTimeout(300_000);
      for (const size of [{ width: 320, height: 640 }, ...SIZES]) {
        await page.setViewportSize(size);
        for (const { group, selector, entries } of FITTED_LABELS) {
          for (const id of entries) {
            for (const scale of [1, 1.5]) {
              await openEntry(page, id, scale, lang);
              await page.evaluate(async () => {
                await document.fonts.ready;
                for (let i = 0; i < 2; i++)
                  await new Promise((done) => requestAnimationFrame(done));
              });
              const where = `${group} in ${id} at ${size.width}×${size.height}, ${scale * 100} %`;
              const labels = await page.locator(selector).evaluateAll((elements) =>
                elements.map((element) => {
                  const label = element as HTMLElement;
                  const style = getComputedStyle(label);
                  const sides =
                    parseFloat(style.paddingLeft) +
                    parseFloat(style.paddingRight) +
                    parseFloat(style.borderLeftWidth) +
                    parseFloat(style.borderRightWidth);
                  const range = document.createRange();
                  range.selectNodeContents(label);
                  const inked = range.getBoundingClientRect().width;
                  const room = label.getBoundingClientRect().width - sides;
                  const shown = parseFloat(getComputedStyle(label).fontSize);
                  const fitted = label.style.fontSize;
                  label.style.fontSize = '';
                  const normal = parseFloat(getComputedStyle(label).fontSize);
                  label.style.fontSize = fitted;
                  return {
                    text: label.textContent?.trim() ?? '',
                    fitted: label.style.textOverflow === 'ellipsis',
                    fits: inked <= room + 0.01,
                    height: label.getBoundingClientRect().height,
                    group: Array.from(document.querySelectorAll('[role="radiogroup"]')).indexOf(
                      label.closest('[role="radiogroup"]')!,
                    ),
                    ratio: shown / normal,
                    title: label.title,
                  };
                }),
              );
              expect(labels.length, `${where}: shown`).toBeGreaterThan(0);
              for (const label of labels) {
                const what = `${where}: "${label.text}"`;
                expect.soft(label.fitted, `${what} fits itself`).toBe(true);
                expect
                  .soft(label.ratio, `${what} at 80 % or more`)
                  .toBeGreaterThanOrEqual(0.8 - 1e-3);
                if (!label.fits) {
                  expect.soft(label.ratio, `${what} is cut only at 80 %`).toBeCloseTo(0.8, 3);
                  expect.soft(label.title, `${what} keeps its full text as a title`).not.toBe('');
                }
              }
              if (group === 'segmented option') {
                // A shrunk option keeps the height of the others in its control.
                for (const control of new Set(labels.map((label) => label.group))) {
                  const heights = labels.filter((l) => l.group === control).map((l) => l.height);
                  expect
                    .soft(
                      Math.max(...heights) - Math.min(...heights),
                      `${where}: control ${control} heights`,
                    )
                    .toBeLessThanOrEqual(0.5);
                }
              }
            }
          }
        }
      }
    },
  );
}

test('a segmented option fits again when it is chosen and turns bold', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'measured at a fixed size');
  await page.setViewportSize({ width: 390, height: 844 });
  await openEntry(page, 'new-game');
  const group = page.getByRole('radiogroup').first();
  const second = group.getByRole('radio').nth(1);
  await expect(second).not.toBeChecked();
  /** The second option's face: its text and room in CSS pixels, and its size against its normal one. */
  const face = () =>
    group
      .locator('label > span')
      .nth(1)
      .evaluate((element) => {
        const face = element as HTMLElement;
        const style = getComputedStyle(face);
        const sides =
          parseFloat(style.paddingLeft) +
          parseFloat(style.paddingRight) +
          parseFloat(style.borderLeftWidth) +
          parseFloat(style.borderRightWidth);
        const range = document.createRange();
        range.selectNodeContents(face);
        const regular = range.getBoundingClientRect().width;
        const fitted = face.style.fontSize;
        face.style.fontSize = '';
        const normal = parseFloat(getComputedStyle(face).fontSize);
        face.style.fontSize = fitted;
        return {
          text: regular,
          room: face.getBoundingClientRect().width - sides,
          ratio: parseFloat(style.fontSize) / normal,
        };
      });
  // Narrows the control until the second option's text fits in regular type but not in bold.
  await group.evaluate(async (control) => {
    const element = control as HTMLElement;
    const face = element.querySelectorAll<HTMLElement>('label > span')[1]!;
    const options = element.querySelectorAll('label').length;
    const range = document.createRange();
    range.selectNodeContents(face);
    const regular = range.getBoundingClientRect().width;
    face.style.fontWeight = '700';
    const bold = range.getBoundingClientRect().width;
    face.style.fontWeight = '';
    const style = getComputedStyle(face);
    const room =
      face.getBoundingClientRect().width -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight) -
      parseFloat(style.borderLeftWidth) -
      parseFloat(style.borderRightWidth);
    const width = element.getBoundingClientRect().width;
    element.style.width = `${width - options * (room - (regular + bold) / 2)}px`;
    element.style.flex = 'none';
    for (let i = 0; i < 3; i++) await new Promise((done) => requestAnimationFrame(done));
  });
  const before = await face();
  expect(before.text, 'regular type fits').toBeLessThanOrEqual(before.room + 0.01);
  expect(before.ratio, 'at its normal size').toBe(1);
  await second.check();
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const after = await face();
  expect(after.ratio, 'shrunk once bold').toBeLessThan(1);
  expect(after.text, 'bold type fits once shrunk').toBeLessThanOrEqual(after.room + 0.01);
});

test.describe("a display name outside the active language's script renders and fits", () => {
  const cases = [
    { lang: 'de', names: 'japanese', opponent: '山田花子' },
    { lang: 'ja', names: 'cyrillic', opponent: 'Анастасия' },
  ] as const;
  for (const { lang, names, opponent } of cases) {
    for (const id of ['home', 'table-plan', 'game-over', 'history', 'replay']) {
      test(`${id} in ${lang} with ${names} names`, async ({ page }, info) => {
        test.skip(info.project.name !== 'desktop', 'measured at fixed sizes');
        await page.setViewportSize({ width: 360, height: 640 });
        await openGalleryEntry(page, id, `lang=${lang}&names=${names}`);
        await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${lang}`));
        const name = page.getByText(opponent).first();
        await expect(name).toBeVisible();
        const box = (await name.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(360.5);
        expect(
          await page.evaluate(() => document.scrollingElement!.scrollWidth),
          'the page is no wider than the screen',
        ).toBeLessThanOrEqual(360);
        expect(await framingProblems(page, ACTIONS[id] !== undefined)).toEqual([]);
      });
    }
  }
});
