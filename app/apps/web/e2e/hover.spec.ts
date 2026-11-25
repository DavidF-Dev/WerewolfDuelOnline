import { devices, expect, test, type Locator, type Page } from '@playwright/test';
import { openGalleryEntry } from './gallery-entries.js';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'hover needs a fine pointer');
});

/** The painted properties that show a hover, read from `pseudo` of the element when given. */
const look = (target: Locator, pseudo?: string) =>
  target.evaluate((element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement);
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      shadow: style.boxShadow,
    };
  }, pseudo ?? null);

const cursor = (target: Locator) => target.evaluate((element) => getComputedStyle(element).cursor);

/** Waits for every finite animation and transition to end. */
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );

/** Rests the pointer in the window's corner, away from every control, and waits for transitions to end. */
async function rest(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await settle(page);
}

/**
 * Checks that hovering `pointAt` changes the look of `painted` (or its `pseudo`) and that moving the
 * pointer away restores it.
 */
async function expectHoverTint(
  page: Page,
  name: string,
  pointAt: Locator,
  painted: Locator = pointAt,
  pseudo?: string,
): Promise<void> {
  await pointAt.scrollIntoViewIfNeeded();
  await rest(page);
  const before = await look(painted, pseudo);
  await pointAt.hover();
  await expect
    .poll(() => look(painted, pseudo), { message: `${name} tints on hover` })
    .not.toEqual(before);
  await rest(page);
  await expect.poll(() => look(painted, pseudo), { message: `${name} restores` }).toEqual(before);
}

/** Checks that hovering `pointAt` leaves the look of `painted` as it was. */
async function expectNoHoverChange(
  page: Page,
  name: string,
  pointAt: Locator,
  painted: Locator = pointAt,
  pseudo?: string,
): Promise<void> {
  await pointAt.scrollIntoViewIfNeeded();
  await rest(page);
  const before = await look(painted, pseudo);
  await pointAt.hover();
  // Longer than any hover transition, so a change would have shown.
  await page.waitForTimeout(300);
  expect(await look(painted, pseudo), `${name} doesn't change on hover`).toEqual(before);
}

const kitControls = (page: Page) => {
  const main = page.locator('main');
  const fewerAtMinimum = main.getByRole('group', { name: 'Hourglasses at the minimum' });
  const inRange = main.getByRole('group', { name: 'Hourglasses in range' });
  const switchButton = page.locator('#kit-contrast');
  const select = page.locator('#kit-language');
  const light = main.getByRole('radio', { name: 'Light' });
  const system = main.getByRole('radio', { name: 'System' });
  return {
    defaultButton: main.getByRole('button', { name: 'Default block' }),
    smallButton: main.getByRole('button', { name: 'Default', exact: true }),
    dangerButton: main.getByRole('button', { name: 'Danger block' }),
    primaryButton: main.getByRole('button', { name: 'Primary block' }),
    disabledButton: main.getByRole('button', { name: 'Disabled primary' }),
    iconButton: page.getByRole('banner').getByRole('button', { name: 'Menu' }),
    stepperMore: inRange.getByRole('button', { name: 'More' }),
    stepperAtMinimum: fewerAtMinimum.getByRole('button', { name: 'Fewer' }),
    switchButton,
    switchTrack: switchButton.locator('.track'),
    select,
    selectBox: select.locator('xpath=..'),
    light,
    lightFace: light.locator('xpath=following-sibling::span'),
    system,
    systemFace: system.locator('xpath=following-sibling::span'),
  };
};

const cards = (page: Page) => {
  const hits = page.locator('main button.hit');
  return {
    normal: hits.and(page.locator(':not([aria-disabled], [aria-pressed="true"])')).first(),
    disabled: hits.and(page.locator('[aria-disabled="true"]')).first(),
    selected: hits.and(page.locator('[aria-pressed="true"]')).first(),
  };
};

const frameOf = (hit: Locator) => hit.locator('xpath=..');

test('clickable controls show the pointer cursor', async ({ page }) => {
  await openGalleryEntry(page, 'kit');
  const kit = kitControls(page);
  for (const [name, control] of [
    ['button', kit.defaultButton],
    ['small button', kit.smallButton],
    ['icon button', kit.iconButton],
    ['stepper button', kit.stepperMore],
    ['segmented option radio', kit.light],
    ['segmented option label', kit.light.locator('xpath=..')],
    ['switch', kit.switchButton],
    ['select', kit.select],
  ] as const) {
    expect(await cursor(control), name).toBe('pointer');
  }

  await openGalleryEntry(page, 'cards');
  expect(await cursor(cards(page).normal), 'card button').toBe('pointer');

  await openGalleryEntry(page, 'home-more');
  expect(await cursor(page.getByTestId('home-more').first()), 'More button').toBe('pointer');
  expect(await cursor(page.getByRole('menuitem').first()), 'menu item').toBe('pointer');
});

test('text fields keep the text cursor', async ({ page }) => {
  await openGalleryEntry(page, 'settings-top');
  expect(await cursor(page.getByRole('textbox', { name: 'Display name' }))).toBe('text');
  await openGalleryEntry(page, 'join');
  expect(await cursor(page.locator('main').getByRole('textbox').first())).toBe('text');
});

test('disabled controls show not-allowed', async ({ page }) => {
  await openGalleryEntry(page, 'kit');
  const kit = kitControls(page);
  expect(await cursor(kit.disabledButton), 'disabled button').toBe('not-allowed');
  expect(await cursor(kit.stepperAtMinimum), 'stepper at its limit').toBe('not-allowed');
  await openGalleryEntry(page, 'cards');
  expect(await cursor(cards(page).disabled), 'disabled card').toBe('not-allowed');
});

test('hover tints each control kind and leaving restores it', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await openGalleryEntry(page, 'kit');
    const kit = kitControls(page);
    await expectHoverTint(page, `${theme} button`, kit.defaultButton);
    await expectHoverTint(page, `${theme} small button`, kit.smallButton);
    await expectHoverTint(page, `${theme} danger button`, kit.dangerButton);
    await expectHoverTint(page, `${theme} primary button`, kit.primaryButton);
    await expectHoverTint(page, `${theme} icon button`, kit.iconButton);
    await expectHoverTint(page, `${theme} stepper button`, kit.stepperMore);
    await expectHoverTint(
      page,
      `${theme} segmented option`,
      kit.light.locator('xpath=..'),
      kit.lightFace,
    );
    await expectHoverTint(page, `${theme} switch`, kit.switchButton, kit.switchTrack);
    await expectHoverTint(page, `${theme} select`, kit.select, kit.selectBox, '::before');
  }

  await openGalleryEntry(page, 'settings-top');
  const name = page.getByRole('textbox', { name: 'Display name' });
  await expectHoverTint(page, 'display name', name, name.locator('xpath=..'), '::before');

  await openGalleryEntry(page, 'join');
  await expectHoverTint(page, 'code field', page.locator('main').getByRole('textbox').first());

  await openGalleryEntry(page, 'cards');
  const card = cards(page).normal;
  await expectHoverTint(page, 'card', card, frameOf(card));

  await openGalleryEntry(page, 'home');
  await expectHoverTint(page, 'More button', page.getByTestId('home-more').first());

  await openGalleryEntry(page, 'home-more');
  await expectHoverTint(page, 'menu item', page.getByRole('menuitem').first());
});

test("selected options and disabled buttons don't change on hover", async ({ page }) => {
  await openGalleryEntry(page, 'kit');
  const kit = kitControls(page);
  await expectNoHoverChange(
    page,
    'selected option',
    kit.system.locator('xpath=..'),
    kit.systemFace,
  );
  await expectNoHoverChange(page, 'disabled button', kit.disabledButton);
  await expectNoHoverChange(page, 'stepper at its limit', kit.stepperAtMinimum);
  await openGalleryEntry(page, 'cards');
  const { disabled, selected } = cards(page);
  await expectNoHoverChange(page, 'disabled card', disabled, frameOf(disabled));
  await expectNoHoverChange(page, 'selected card', selected, frameOf(selected));
});

test('with a coarse pointer hover changes nothing', async ({ browser }) => {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  const context = await browser.newContext({ ...phone, baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  try {
    await openGalleryEntry(page, 'kit');
    const kit = kitControls(page);
    await expectNoHoverChange(page, 'button', kit.defaultButton);
    await expectNoHoverChange(page, 'primary button', kit.primaryButton);
    await expectNoHoverChange(page, 'icon button', kit.iconButton);
    await expectNoHoverChange(
      page,
      'segmented option',
      kit.light.locator('xpath=..'),
      kit.lightFace,
    );
    await expectNoHoverChange(page, 'switch', kit.switchButton, kit.switchTrack);
    await expectNoHoverChange(page, 'select', kit.select, kit.selectBox, '::before');
  } finally {
    await context.close();
  }
});

const THEMES = [
  { name: 'light', scheme: 'light', high: false },
  { name: 'dark', scheme: 'dark', high: false },
  { name: 'high contrast light', scheme: 'light', high: true },
  { name: 'high contrast dark', scheme: 'dark', high: true },
] as const;

/** Opens gallery entry `id` in `theme`, with no transitions left running. */
async function openInTheme(page: Page, id: string, theme: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: theme.scheme });
  await openGalleryEntry(page, id);
  await page.evaluate((high) => {
    if (high) document.documentElement.setAttribute('data-contrast', 'high');
    else document.documentElement.removeAttribute('data-contrast');
  }, theme.high);
  await rest(page);
}

/** The hover background and border the spec sets, read from a probe styled with the hover tokens. */
const hoverTokens = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'background: var(--hover-bg); border: 1px solid var(--hover-line); position: absolute;';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const tokens = { background: style.backgroundColor, border: style.borderTopColor };
    probe.remove();
    return tokens;
  });

/** The contrast ratio of `target`'s text colour against its background. */
const textContrast = (target: Locator) =>
  target.evaluate((element) => {
    const context = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })!;
    const channels = (colour: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = colour;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (colour: string): number => {
      const [r, g, b] = channels(colour).map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const style = getComputedStyle(element);
    const [light, dark] = [luminance(style.color), luminance(style.backgroundColor)].sort(
      (a, b) => b - a,
    );
    return (light! + 0.05) / (dark! + 0.05);
  });

test('the hover tint is the hover tokens in every theme', async ({ page }) => {
  for (const theme of THEMES) {
    await openInTheme(page, 'kit', theme);
    const button = kitControls(page).defaultButton;
    await button.hover();
    const tokens = await hoverTokens(page);
    await expect
      .poll(() => look(button), { message: `${theme.name} button` })
      .toMatchObject(tokens);

    await openInTheme(page, 'join', theme);
    const field = page.locator('main').getByRole('textbox').first();
    await field.hover();
    await expect
      .poll(() => look(field), { message: `${theme.name} code field` })
      .toMatchObject(await hoverTokens(page));
  }
});

test('a hovered danger button keeps its text at 4.5:1 in every theme', async ({ page }) => {
  for (const theme of THEMES) {
    await openInTheme(page, 'kit', theme);
    const danger = kitControls(page).dangerButton;
    await danger.hover();
    await settle(page);
    expect(await textContrast(danger), theme.name).toBeGreaterThanOrEqual(4.5);
  }
});

test('a disabled select and switch show not-allowed and no hover', async ({ page }) => {
  await openGalleryEntry(page, 'kit');
  const kit = kitControls(page);
  await kit.select.evaluate((select) => ((select as HTMLSelectElement).disabled = true));
  await kit.switchButton.evaluate((button) => button.setAttribute('aria-disabled', 'true'));
  expect(await cursor(kit.select), 'select').toBe('not-allowed');
  expect(await cursor(kit.switchButton), 'switch').toBe('not-allowed');
  await expectNoHoverChange(page, 'disabled select', kit.select, kit.selectBox, '::before');
  await expectNoHoverChange(page, 'disabled switch', kit.switchButton, kit.switchTrack);
});

test('only cards a click acts on show the pointer and the hover ring', async ({ page }) => {
  await openGalleryEntry(page, 'cards');
  const choosable = cards(page).normal;
  expect(await cursor(choosable), 'a card to choose').toBe('pointer');
  await expectHoverTint(page, 'a card to choose', choosable, frameOf(choosable));

  await openGalleryEntry(page, 'table-round-summary');
  const shown = page.getByTestId('round-set-aside-card');
  expect(await cursor(shown), 'a card on show').toBe('default');
  await expectNoHoverChange(page, 'a card on show', shown, frameOf(shown));
});
