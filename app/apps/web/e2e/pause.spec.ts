import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  FULL_GAME_TIMEOUT_MS,
  expectGameOver,
  mulberry32,
  openGameMenu,
  openOnlineTable,
  playToEnd,
  recordEvents,
  roomSeed,
  snapshot,
  type OnlineTable,
} from './game.js';
import { DATA_DIR_ENV, E2E_IDLE_UNLOAD_MS } from './node-referee.js';
import { PORTS } from './ports.js';

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

async function table(browser: Browser, seed: number): Promise<OnlineTable> {
  const opened = await openOnlineTable(browser, roomSeed(seed));
  contexts.push(opened.hostContext, opened.guestContext);
  return opened;
}

/** The host asks to pause from the game menu, and the guest agrees from the pause panel. */
async function agreePause({ host, guest }: OnlineTable): Promise<void> {
  await expect.poll(async () => (await snapshot(host)).status).toBe('playing');
  await openGameMenu(host);
  await host.getByTestId('pause-after-round').click();
  await expect(host.getByTestId('pause-status')).toHaveText(/waiting for your opponent/i);
  await guest.getByTestId('pause-accept').click();
  for (const page of [host, guest]) {
    await expect(page.getByTestId('pause-status')).toHaveText(
      'Pause agreed: applies at the end of the round',
    );
  }
}

/** Plays out the round in which the pause was agreed; returns the round it paused after. */
async function playToPause(t: OnlineTable, seed: number): Promise<number> {
  await playToEnd(t, { random: mulberry32(seed), until: (s) => s.paused });
  for (const page of [t.host, t.guest]) {
    await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
    expect((await snapshot(page)).status, 'the game should pause before it ends').not.toBe(
      'game_over',
    );
  }
  return (await snapshot(t.host)).round;
}

/** Opens a new tab on `context` and follows its Continue link for `room` from Home. */
async function continueFromHome(context: BrowserContext, room: string): Promise<Page> {
  const page = await context.newPage();
  recordEvents(page);
  await page.goto('/');
  const row = page
    .getByTestId('home-session')
    .filter({ has: page.getByRole('link', { name: new RegExp(room) }) });
  await expect(row).toContainText('Paused');
  await row.getByTestId('home-continue').click();
  return page;
}

/** Presses Resume on both pages, then plays the game to its end. */
async function resumeAndFinish(t: OnlineTable, seed: number): Promise<void> {
  for (const page of [t.host, t.guest]) await page.getByTestId('resume').click();
  await playToEnd(t, { random: mulberry32(seed + 1) });
  await expectGameOver(t);
}

/** What the referee first says to a socket that greets room `code` with a ping. */
function probe(code: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORTS.onlineReferee}/rooms/${code}/ws`);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'ping' })));
    socket.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(String(data)) as { type: string; code?: string };
      resolve(msg.code ?? msg.type);
      socket.close();
    });
    socket.addEventListener('close', () => resolve('closed'));
  });
}

/**
 * Deletes room `code` from the Node referee: its file goes, and once the room has had no
 * connections for the idle time it leaves memory too, after which the referee no longer knows it.
 */
async function dropRoom(code: string): Promise<void> {
  const dataDir = process.env[DATA_DIR_ENV];
  expect(dataDir, 'the Node referee should name its data folder').toBeDefined();
  const file = join(dataDir!, `${code}.json`);
  await expect
    .poll(
      async () => {
        await rm(file, { force: true });
        return probe(code);
      },
      // Each probe restarts the idle time, so probes are spaced further apart than it.
      { intervals: [E2E_IDLE_UNLOAD_MS * 2], timeout: 30_000 },
    )
    .toBe('unknown_room');
}

test('pause and resume across devices', { tag: '@parity' }, async ({ browser }) => {
  test.setTimeout(FULL_GAME_TIMEOUT_MS);
  const t = await table(browser, 21);
  await agreePause(t);
  const round = await playToPause(t, 21);
  expect(round).toBe(1);

  await t.host.close();
  await t.guest.close();
  t.host = await continueFromHome(t.hostContext, t.code);
  t.guest = await continueFromHome(t.guestContext, t.code);
  for (const page of [t.host, t.guest]) {
    await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible();
    expect((await snapshot(page)).round).toBe(round);
  }

  await resumeAndFinish(t, 21);
  // The pause closed the first segment, so the game resumed in a second one with a new seed.
  for (const page of [t.host, t.guest]) expect((await snapshot(page)).segments).toBe(2);
});

test('resume from a save after the room is gone', async ({ browser }) => {
  test.setTimeout(FULL_GAME_TIMEOUT_MS);
  const t = await table(browser, 22);
  await agreePause(t);
  const round = await playToPause(t, 22);
  await t.host.close();
  await t.guest.close();
  await dropRoom(t.code);

  t.host = await continueFromHome(t.hostContext, t.code);
  await expect(t.host.getByTestId('saved-game')).toBeVisible();
  await t.host.getByTestId('resume-from-save').click();
  await expect(t.host.getByRole('heading', { name: 'Game paused' })).toBeVisible();
  const code = ((await t.host.getByTestId('invite-code').textContent()) ?? '').replace(/\W/g, '');
  expect(code).toMatch(/^[0-9A-Z]{6}$/);
  expect(code).not.toBe(t.code);

  const guest = await t.guestContext.newPage();
  recordEvents(guest);
  await guest.goto(`/#/join/${code}`);
  await expect(guest.getByRole('heading', { name: 'Game paused' })).toBeVisible();
  // The joining player sees the restored round before agreeing to resume.
  expect((await snapshot(guest)).round).toBe(round);
  t.guest = guest;

  await resumeAndFinish(t, 22);
});
