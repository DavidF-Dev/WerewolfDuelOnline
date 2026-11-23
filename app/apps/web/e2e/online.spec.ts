import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  expectGameOver,
  giveName,
  joinAs,
  mulberry32,
  openGameMenu,
  openOnlineTable,
  playToEnd,
  recordEvents,
  resign,
  resumedFrom,
  roomSeed,
  snapshot,
  type OnlineTable,
} from './game.js';

const PARITY = { tag: '@parity' };
/** The step after which a test interrupts the game, a few rounds in. */
const INTERRUPT_AT = 6;
const OFFLINE_MS = 5_000;

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of contexts.splice(0)) await context.close();
});

async function table(browser: Browser, seed: number): Promise<OnlineTable> {
  const opened = await openOnlineTable(browser, roomSeed(seed));
  contexts.push(opened.hostContext, opened.guestContext);
  return opened;
}

async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  const page = await context.newPage();
  recordEvents(page);
  return page;
}

const phaseOf = async (page: Page): Promise<string | null> => (await snapshot(page)).phase;
const opponentConnected = async (page: Page): Promise<boolean> =>
  (await snapshot(page)).opponentConnected;

/** Sets what `document.visibilityState` reports and announces the change, as a tab switch would. */
async function setVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** Moves the guest's seat to a fresh page once the game is under way, using `move`. */
async function moveGuestOnce(
  t: OnlineTable,
  seed: number,
  move: (t: OnlineTable) => Promise<Page>,
): Promise<void> {
  let moved = false;
  await playToEnd(t, {
    random: mulberry32(seed),
    afterStep: async (step) => {
      if (moved || step < INTERRUPT_AT) return;
      moved = true;
      const page = await move(t);
      await expect(page.getByTestId('table')).toBeVisible();
      await expect.poll(async () => (await snapshot(page)).seat).toBe('p1');
      t.guest = page;
    },
  });
  expect(moved).toBe(true);
  await expectGameOver(t);
}

test('two devices play a full online game', PARITY, async ({ browser }) => {
  const t = await table(browser, 1);
  await playToEnd(t, { random: mulberry32(1) });
  await expectGameOver(t);
});

test('guest goes offline and comes back', PARITY, async ({ browser }) => {
  const t = await table(browser, 2);
  let away = false;
  await playToEnd(t, {
    random: mulberry32(2),
    afterStep: async (step, { host, guest }) => {
      if (away || step < INTERRUPT_AT) return;
      away = true;
      const greetings = resumedFrom(guest).length;
      const held = (await snapshot(guest)).lastSeq;
      await t.guestContext.setOffline(true);
      await expect.poll(() => guest.evaluate(() => navigator.onLine)).toBe(false);
      // While offline nothing changes that could be waited on, so the outage is timed.
      await guest.waitForTimeout(OFFLINE_MS);
      await t.guestContext.setOffline(false);
      await expect.poll(() => resumedFrom(guest).length).toBe(greetings + 1);
      expect(resumedFrom(guest).at(-1)).toBeGreaterThanOrEqual(held);
      await expect.poll(() => phaseOf(guest)).toBe('online');
      await expect.poll(() => opponentConnected(host)).toBe(true);
    },
  });
  expect(away).toBe(true);
  await expectGameOver(t);
});

test('continue from home resumes the seat without a PIN', async ({ browser }) => {
  const t = await table(browser, 5);
  await t.guest.evaluate(() => {
    location.hash = '#/';
  });
  const link = t.guest.getByTestId('home-continue');
  await expect(link).toBeVisible();
  await link.click();
  await expect(t.guest.getByTestId('table')).toBeVisible();
  await expect(t.guest.getByLabel('PIN')).toHaveCount(0);
});

test('hidden tab reconnects', async ({ browser }) => {
  const t = await table(browser, 3);
  let hidden = false;
  await playToEnd(t, {
    random: mulberry32(3),
    afterStep: async (step, { host, guest }) => {
      if (hidden || step < INTERRUPT_AT) return;
      hidden = true;
      const greetings = resumedFrom(guest).length;
      const held = (await snapshot(guest)).lastSeq;
      await setVisibility(guest, 'hidden');
      await expect.poll(() => phaseOf(guest)).toBe('hidden');
      await expect.poll(() => opponentConnected(host)).toBe(false);
      await setVisibility(guest, 'visible');
      await expect.poll(() => resumedFrom(guest).length).toBe(greetings + 1);
      expect(resumedFrom(guest).at(-1)).toBeGreaterThanOrEqual(held);
      await expect.poll(() => phaseOf(guest)).toBe('online');
      await expect.poll(() => opponentConnected(host)).toBe(true);
    },
  });
  expect(hidden).toBe(true);
  await expectGameOver(t);
});

test('rejoin from a new device with PIN', PARITY, async ({ browser }) => {
  const t = await table(browser, 4);
  await moveGuestOnce(t, 4, async ({ guest, code }) => {
    await openGameMenu(guest);
    await guest.getByTestId('continue-elsewhere').locator('summary').click();
    await guest.getByTestId('toggle-pin').click();
    const pin = /\d{4}/.exec((await guest.getByTestId('pin').textContent()) ?? '')?.[0];
    expect(pin).toBeDefined();

    const device = await newDevice(browser);
    await device.goto(`/#/rejoin?code=${code}&seat=p1`);
    await device.getByTestId('rejoin-pin').fill(pin!);
    await device.getByTestId('rejoin-submit').click();
    await expect(guest.getByTestId('connection-stopped')).toHaveText(
      'Continued on another device.',
    );
    return device;
  });
});

test('rejoin with opponent approval', PARITY, async ({ browser }) => {
  const t = await table(browser, 5);
  await moveGuestOnce(t, 5, async ({ host, guestContext, code }) => {
    // A seat still connected elsewhere can only be taken with its PIN.
    await guestContext.close();
    await expect.poll(() => opponentConnected(host)).toBe(false);

    const device = await newDevice(browser);
    let roomSockets = 0;
    device.on('websocket', (socket) => {
      if (socket.url().includes('/rooms/')) roomSockets += 1;
    });
    await device.goto(`/#/rejoin?code=${code}&seat=p1`);
    await device.getByTestId('rejoin-ask').click();
    await expect(device.getByTestId('rejoin-status')).toHaveText(/waiting for your opponent/i);
    const dialog = host.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    // Outlasts the client's 3 s pong timeout, so an unanswered ping would have dropped the request.
    await device.waitForTimeout(4_500);
    expect(roomSockets).toBe(1);
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('confirm-yes').click();
    return device;
  });
});

test('claim win after grace', PARITY, async ({ browser }) => {
  const { host, guestContext } = await table(browser, 6);
  await expect.poll(async () => (await snapshot(host)).status).toBe('playing');
  await guestContext.close();
  await host.getByTestId('claim-win').click();
  await host.getByRole('alertdialog').getByTestId('confirm-yes').click();
  await expect(host.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await expect(host.getByTestId('game-over-result')).toHaveText(/resigned/);
  await expect.poll(async () => (await snapshot(host)).replayVerified).toBe(true);
});

test('resign ends the game', async ({ browser }) => {
  const t = await table(browser, 7);
  await expect.poll(async () => (await snapshot(t.guest)).status).toBe('playing');
  await resign(t.guest);
  await expectGameOver(t);
  await expect(t.host.getByTestId('game-over-result')).toHaveText(/resigned/);
  await expect(t.guest.getByTestId('game-over-result')).toHaveText(/resigned/);

  // The finished game stays on Home, with its opponent, while a rematch is still possible.
  await t.guest.evaluate(() => {
    location.hash = '#/';
  });
  const link = t.guest.getByTestId('home-continue');
  await expect(link).toHaveText(/Host, room \w{6}\s*Game over · rematch possible/);
});

test('rematch gives the badge to the loser', async ({ browser }) => {
  const t = await table(browser, 8);
  await playToEnd(t, { random: mulberry32(8) });
  await expectGameOver(t);
  const { winner } = await snapshot(t.host);
  expect(winner).not.toBeNull();
  const loser = winner === 'p0' ? 'p1' : 'p0';

  await t.host.getByTestId('rematch').click();
  await expect(t.guest.getByTestId('rematch-status')).toHaveText('Your opponent wants a rematch.');
  await t.guest.getByTestId('rematch').click();
  for (const page of [t.host, t.guest]) {
    await expect(page.getByTestId('game-announcement')).toHaveText(
      'Rematch started: game 2 in this room.',
    );
    await expect.poll(async () => (await snapshot(page)).game).toBe(1);
    await expect.poll(async () => (await snapshot(page)).badge).toBe(loser);
    await expect.poll(async () => (await snapshot(page)).status).toBe('playing');
  }
});

test('invite link joins', async ({ browser }) => {
  const host = await newDevice(browser);
  await host.goto('/#/online/new');
  await host.getByTestId('grace-5').check();
  await host.getByTestId('create-submit').click();
  await giveName(host, 'Host');
  const text = (await host.getByTestId('invite-link').textContent()) ?? '';
  const link = /https?:\/\/\S+/.exec(text)?.[0];
  expect(link).toMatch(/#\/join\/[0-9A-Z]{6}$/);

  const guest = await newDevice(browser);
  await joinAs(guest, link!, 'Guest');
  await expect(host.getByTestId('table')).toBeVisible();
  await expect(guest.getByTestId('table')).toBeVisible();
  for (const page of [host, guest]) {
    await expect.poll(async () => (await snapshot(page)).legal.length).toBeGreaterThan(0);
    expect((await snapshot(page)).errorCount).toBe(0);
  }
});

test('unknown_room shows a friendly error', PARITY, async ({ browser }) => {
  const page = await newDevice(browser);
  let sockets = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/rooms/')) sockets += 1;
  });
  await joinAs(page, '/#/join/ZZZZZZ', 'Guest');
  await expect(page.getByTestId('connection-stopped')).toHaveText(
    "There's no game with that code; it may have expired. Check the code and try again.",
  );
  const connection = await page.evaluate(() => window.__wwd!.connection());
  expect(connection).toMatchObject({ stopReason: 'unknown_room', nextRetryAt: null });
  expect(sockets).toBe(1);
});
