import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  expectGameOver,
  mulberry32,
  openOnlineTable,
  playToEnd,
  resign,
  roomSeed,
  snapshot,
  type OnlineTable,
} from './game.js';

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

async function table(browser: Browser, seed: number): Promise<OnlineTable> {
  const opened = await openOnlineTable(browser, roomSeed(seed));
  contexts.push(opened.hostContext, opened.guestContext);
  return opened;
}

/** The step number and total from the replay's position line, such as "Step 12 of 40, round 3". */
async function position(page: Page): Promise<{ step: number; total: number; round: number }> {
  const text = (await page.getByTestId('replay-position').textContent()) ?? '';
  const match = /Step (\d+) of (\d+), round (\d+)/.exec(text);
  expect(match, `the replay position should read as a step: ${text}`).not.toBeNull();
  return { step: Number(match![1]), total: Number(match![2]), round: Number(match![3]) };
}

/** The history entry for a game against the opponent called `opponent`. */
const entryAgainst = (page: Page, opponent: string) =>
  page.getByRole('link', { name: new RegExp(`^Replay: (Won|Lost) against ${opponent}`) });

test('finished game appears in history and its replay steps', async ({ browser }) => {
  const t = await table(browser, 31);
  await playToEnd(t, { random: mulberry32(31) });
  await expectGameOver(t);
  const { host, guest } = t;

  await guest.getByTestId('view-replay').click();
  await expect(guest.getByRole('heading', { name: 'Replay', level: 1 })).toBeVisible();
  await expect(guest.getByTestId('replay-position')).toContainText('Step 1 of');

  await host.goto('/#/history');
  await expect(entryAgainst(host, 'Guest')).toHaveCount(1);
  await entryAgainst(host, 'Guest').click();
  await expect(host.getByRole('heading', { name: 'Replay', level: 1 })).toBeVisible();

  const start = await position(host);
  expect(start.step).toBe(1);
  expect(start.total).toBeGreaterThan(1);
  await host.keyboard.press('ArrowRight');
  await expect.poll(async () => (await position(host)).step).toBe(2);
  await host.getByRole('button', { name: 'Previous step' }).click();
  await expect.poll(async () => (await position(host)).step).toBe(1);

  await host.getByRole('button', { name: 'Next round' }).click();
  await expect.poll(async () => (await position(host)).round).toBe(start.round + 1);
  // My view keeps the opponent's hand hidden; the full view shows it.
  await expect(host.getByTestId('replay-hand-p1')).toContainText('hidden');
  await host.getByRole('radio', { name: 'Full' }).check();
  await expect(host.getByRole('radio', { name: 'Full' })).toBeChecked();
  await expect(host.getByTestId('replay-hand-p1')).not.toContainText('hidden');

  await host.getByRole('button', { name: 'Next step' }).click();
  await expect.poll(async () => (await position(host)).step).toBeGreaterThan(start.step);
});

test('backup export then import on a fresh context', async ({ browser }) => {
  const t = await table(browser, 32);
  await expect.poll(async () => (await snapshot(t.guest)).status).toBe('playing');
  await resign(t.guest);
  await expectGameOver(t);
  const { host } = t;

  await host.goto('/#/settings');
  // The save-file picker can't be driven from a test, so the backup takes the download route.
  await host.evaluate(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await host.getByRole('button', { name: 'Export', exact: true }).click();
  const dialog = host.getByRole('alertdialog');
  await expect(dialog).toContainText('seat tokens');
  const downloading = host.waitForEvent('download');
  await dialog.getByTestId('confirm-yes').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^werewolf-duel-backup-\d{8}\.wwdb$/);
  const file = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(file);

  const fresh = await browser.newContext();
  contexts.push(fresh);
  const page = await fresh.newPage();
  await page.goto('/#/history');
  await expect(page.getByTestId('history-empty')).toBeVisible();
  await page.goto('/#/settings');
  await page.getByTestId('backup-file').setInputFiles(file);
  const preview = page.getByRole('alertdialog');
  await expect(preview).toContainText('1 finished game');
  await preview.getByTestId('confirm-yes').click();
  await expect(page.getByRole('status').filter({ hasText: 'Backup imported' })).toBeVisible();

  await page.goto('/#/history');
  await expect(entryAgainst(page, 'Guest')).toHaveCount(1);
  await entryAgainst(page, 'Guest').click();
  await expect(page.getByTestId('replay-position')).toBeVisible();
});
