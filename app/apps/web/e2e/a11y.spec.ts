import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { Command } from '@wwd/engine';
import {
  catchUpShowdown,
  createSeededRoom,
  giveName,
  isPlan,
  openGameMenu,
  perform,
  playToEnd,
  mulberry32,
  recordEvents,
  resign,
  roomSeed,
  snapshot,
  targetId,
} from './game.js';
import { GALLERY_ENTRIES, expectGalleryEntries, openGalleryEntry } from './gallery-entries.js';

interface Theme {
  name: string;
  theme: 'light' | 'dark';
  highContrast: boolean;
}

const THEMES: readonly Theme[] = [
  { name: 'light', theme: 'light', highContrast: false },
  { name: 'dark', theme: 'dark', highContrast: false },
  { name: 'high contrast light', theme: 'light', highContrast: true },
  { name: 'high contrast dark', theme: 'dark', highContrast: true },
];
const BLOCKING: ReadonlySet<string> = new Set(['serious', 'critical']);

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

/** The document attributes that the settings set and that a check changes. */
interface Look {
  theme?: string;
  contrast?: string;
  motion?: string;
}

function setLook(look: Look): void {
  const root = document.documentElement;
  for (const key of ['theme', 'contrast', 'motion'] as const) {
    const value = look[key];
    if (value === undefined) delete root.dataset[key];
    else root.dataset[key] = value;
  }
}

/**
 * Checks `page` with axe in every theme, as the settings would set it on the document, and
 * records each serious or critical violation against `screen`; the look is put back after.
 */
async function expectAccessible(page: Page, screen: string): Promise<void> {
  const before = await page.evaluate((): Look => {
    const { theme, contrast, motion } = document.documentElement.dataset;
    return { theme, contrast, motion };
  });
  const problems: string[] = [];
  for (const { name, theme, highContrast } of THEMES) {
    // Reduced motion turns transitions off, so colours are read in the new theme, not between two.
    await page.evaluate(setLook, {
      theme,
      motion: 'reduce',
      ...(highContrast ? { contrast: 'high' } : {}),
    });
    const { violations } = await new AxeBuilder({ page }).analyze();
    for (const violation of violations) {
      if (!BLOCKING.has(violation.impact ?? '')) continue;
      for (const node of violation.nodes) {
        const why = node.failureSummary?.split('\n').slice(1).join(' ').trim() ?? '';
        problems.push(`${name}: ${violation.id} at ${node.target.join(' ')}: ${why}`);
      }
    }
  }
  await page.evaluate(setLook, before);
  expect.soft(problems, `${screen} should have no serious or critical violations`).toEqual([]);
}

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  recordEvents(page);
  return page;
}

const legalOf = async (page: Page): Promise<Command[]> => (await snapshot(page)).legal;

/** Waits for `page` to be offered a command that `wanted` accepts, and returns it. */
async function offered(page: Page, wanted: (cmd: Command) => boolean): Promise<Command> {
  await expect.poll(async () => (await legalOf(page)).some(wanted)).toBe(true);
  return (await legalOf(page)).find(wanted)!;
}

const placesHourglasses = (cmd: Command): boolean =>
  typeof cmd === 'object' && 'place_hourglasses' in cmd;

test('every screen passes axe in each theme', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await newDevice(browser);

  await host.goto('/');
  await expect(host.getByTestId('home')).toBeVisible();
  await expectAccessible(host, 'Home');
  await host.goto('/#/settings');
  await expect(host.getByTestId('settings')).toBeVisible();
  await expectAccessible(host, 'Settings');
  await host.goto('/#/about');
  await expect(host.getByTestId('about')).toBeVisible();
  await expectAccessible(host, 'About');
  await host.goto('/#/how-to-play');
  await expect(host.getByTestId('how-to-play')).toBeVisible();
  await expectAccessible(host, 'How to play');
  await host.goto('/#/online/new');
  await expect(host.getByTestId('create-form')).toBeVisible();
  await expectAccessible(host, 'New game');

  const code = await createSeededRoom(host, roomSeed(41));
  await host.goto(`/#/join/${code}`);
  await expect(host.getByTestId('name-prompt')).toBeVisible();
  await expectAccessible(host, 'Display name');
  await giveName(host, 'Host');
  await expect(host.getByTestId('invite')).toBeVisible();
  await expectAccessible(host, 'Invite');

  const guest = await newDevice(browser);
  await guest.goto('/#/join');
  await expect(guest.getByTestId('join-code-input')).toBeVisible();
  await expectAccessible(guest, 'Join');
  await guest.goto(`/#/join/${code}`);
  await giveName(guest, 'Guest');
  for (const page of [host, guest]) await expect(page.getByTestId('table')).toBeVisible();
  const table = { host, guest };

  // Plan: the guest picks a character, so the targets show which are allowed and why.
  const guestPlan = await offered(guest, isPlan);
  await expectAccessible(guest, 'Table, plan');
  if (!isPlan(guestPlan)) throw new Error('expected a plan');
  const { character, targets } = guestPlan.submit_plan;
  await guest.getByTestId(`plan-character-${character}`).click();
  await expectAccessible(guest, 'Table, plan with a character chosen');
  for (const card of targets) await guest.getByTestId(`target-${targetId(card)}`).click();
  await guest.getByTestId('seal-plan').click();
  await expect(guest.getByRole('alertdialog')).toBeVisible();
  await expectAccessible(guest, 'Plan confirmation');
  await guest.getByRole('alertdialog').getByTestId('confirm-yes').click();
  await perform(host, await offered(host, isPlan));

  // Reveal: each seat places Hourglasses in turn.
  for (let placed = 0; placed < 2; placed += 1) {
    await expect
      .poll(async () => {
        const offers = await Promise.all([host, guest].map(legalOf));
        return offers.some((legal) => legal.some(placesHourglasses));
      })
      .toBe(true);
    const page = (await legalOf(host)).some(placesHourglasses) ? host : guest;
    await expectAccessible(page, 'Table, reveal');
    await perform(page, await offered(page, placesHourglasses));
    await expect.poll(async () => (await legalOf(page)).some(placesHourglasses)).toBe(false);
  }

  await expect(host.getByTestId('showdown')).toBeVisible();
  await expectAccessible(host, 'Table, showdown');
  await playToEnd(table, {
    random: mulberry32(41),
    until: (s) => s.status === 'game_over' || s.legal.includes('next_round'),
  });
  await expect(host.getByTestId('action-next-round')).toBeVisible();
  await catchUpShowdown(host);
  await expect(host.getByTestId('round-summary')).toBeVisible();
  await expectAccessible(host, 'Table, round over');

  await openGameMenu(host);
  await host.getByTestId('continue-elsewhere').locator('summary').click();
  await expectAccessible(host, 'Game menu');
  await host.getByTestId('pause-after-round').click();
  await expect(guest.getByTestId('pause-accept')).toBeVisible();
  await expectAccessible(guest, 'Pause request');
  await guest.getByTestId('pause-decline').click();
  await expect(guest.getByTestId('pause-panel')).toBeHidden();

  await resign(host);
  await expect(guest.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await expect(guest.getByTestId('view-replay')).toBeVisible();
  await expectAccessible(guest, 'Game over');

  await guest.getByTestId('view-replay').click();
  await expect(guest.getByTestId('replay-position')).toBeVisible();
  await expectAccessible(guest, 'Replay');
  await guest.getByRole('radio', { name: 'Full' }).check();
  await expectAccessible(guest, 'Replay, full view');
  await guest.goto('/#/history');
  await expect(guest.getByRole('link', { name: /^Replay:/ })).toBeVisible();
  await expectAccessible(guest, 'History');
  await guest.goto('/#/stats');
  await expect(guest.getByTestId('stats')).toBeVisible();
  await expectAccessible(guest, 'Stats');
  await guest.goto('/');
  await expect(guest.getByTestId('home')).toBeVisible();
  await expectAccessible(guest, 'Home after a game');
});

test.describe('every gallery entry passes axe in each theme', () => {
  test('the list names every gallery entry', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'the gallery is the same in every project');
    await expectGalleryEntries(page);
  });

  for (const id of GALLERY_ENTRIES) {
    test(id, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop', 'checked at one phone size');
      await page.setViewportSize({ width: 360, height: 740 });
      await openGalleryEntry(page, id);
      await expectAccessible(page, id);
    });
  }
});
