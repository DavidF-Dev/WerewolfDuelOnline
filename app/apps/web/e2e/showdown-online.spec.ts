import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Command, Seat } from '@wwd/engine';
import { openOnlineTable, roomSeed, snapshot, type OnlineTable } from './game.js';

/**
 * A room in which the host gains an Hourglass after the first step of round 1, when the host
 * prefers the Knight or Wolfen, the guest the Hunter or Wolf King, and each otherwise takes the
 * first command offered.
 */
const SEED = 51;

/** Characters whose gain is an Hourglass, and characters that act before them. */
const HOURGLASS_GAINERS = ['knight', 'wolfen'];
const EARLY = ['hunter', 'wolf_king'];

/** The count a marker row shows for `marker`. */
const count = (row: Locator, marker: string): Locator =>
  row.locator(`[data-marker="${marker}"] [data-part="count-cell"]`);

const shownCount = async (row: Locator, marker: string): Promise<number> =>
  Number(await count(row, marker).locator('[data-part="count"]').textContent());

/** The first command offered, preferring a plan with targets for one of `characters`. */
function choose(legal: Command[], characters: string[]): Command | undefined {
  const offered = legal.filter((cmd) => cmd !== 'resign');
  return (
    offered.find(
      (cmd) =>
        typeof cmd === 'object' &&
        'submit_plan' in cmd &&
        characters.includes(cmd.submit_plan.character) &&
        cmd.submit_plan.targets.length > 0,
    ) ?? offered[0]
  );
}

/**
 * The step of this round's showdown, from 0, at which `seat` gains an Hourglass, as `page` holds
 * the events; -1 before the plans are revealed or when it gains none.
 */
const hourglassGainStep = (page: Page, seat: Seat): Promise<number> =>
  page.evaluate((gainer) => {
    const events = window.__wwd!.state().events.map(([, event]) => event.kind);
    const start = events.findLastIndex((kind) => 'plans_revealed' in kind);
    if (start < 0 || events.slice(start).some((kind) => 'round_started' in kind)) return -1;
    let step = -1;
    for (const kind of events.slice(start + 1)) {
      if (
        'potion_resolved' in kind ||
        'character_resolved' in kind ||
        'round_ended' in kind ||
        'game_over' in kind
      ) {
        step += 1;
      }
      if (
        'marker_gained' in kind &&
        kind.marker_gained.seat === gainer &&
        kind.marker_gained.marker === 'hourglass'
      ) {
        return step;
      }
    }
    return -1;
  }, seat);

/**
 * Plays round 1 of the seeded room through the dev hook, the host preferring a character that
 * gains an Hourglass and the guest one that acts early, until the guest holds the showdown.
 * Returns the step, from 0, at which the host gains an Hourglass, and the host's seat.
 */
async function reachHourglassGain(table: OnlineTable): Promise<{ step: number; host: Seat }> {
  const acted = new Map<Page, string>();
  for (let tries = 0; tries < 200; tries++) {
    const host = await snapshot(table.host);
    const guest = await snapshot(table.guest);
    expect(guest.round, 'the gain comes in round 1').toBe(1);
    const hostSeat = host.seat!;
    if (guest.legal.includes('next_round')) {
      const step = await hourglassGainStep(table.guest, hostSeat);
      expect(step, 'the host gains an Hourglass after the first step').toBeGreaterThanOrEqual(1);
      return { step, host: hostSeat };
    }
    let progressed = false;
    for (const [page, s, prefer] of [
      [table.host, host, HOURGLASS_GAINERS],
      [table.guest, guest, EARLY],
    ] as const) {
      const key = `${s.lastSeq}|${JSON.stringify(s.legal)}`;
      const cmd = choose(s.legal, [...prefer]);
      if (cmd === undefined || acted.get(page) === key) continue;
      acted.set(page, key);
      await page.evaluate((c) => window.__wwd!.act(c), cmd);
      progressed = true;
    }
    if (!progressed) await table.guest.waitForTimeout(50);
  }
  throw new Error('round 1 never reached its showdown');
}

/** Clicks Next result until `shown` steps of the showdown are listed. */
async function showSteps(page: Page, shown: number): Promise<void> {
  const steps = page.getByTestId('showdown-steps').getByTestId('showdown-step');
  for (let n = await steps.count(); n < shown; n = await steps.count()) {
    await page.getByTestId('showdown-next').click();
    await expect(steps).toHaveCount(n + 1);
  }
}

test("the opponent's Hourglass count rises on the step that reads it out", async ({ browser }) => {
  const table = await openOnlineTable(browser, roomSeed(SEED));
  const { step, host } = await reachHourglassGain(table);
  const { guest } = table;
  const after = await guest.evaluate(
    (i) => window.__wwd!.state().view!.players[i]!.hourglass,
    host === 'p0' ? 0 : 1,
  );
  const row = guest.getByTestId('opponent-markers');
  await expect(guest.getByTestId('showdown-steps').getByTestId('showdown-step')).toHaveCount(1);
  for (let shown = 1; shown <= step; shown++) {
    await showSteps(guest, shown);
    expect(await shownCount(row, 'hourglass'), `after ${shown} steps`).toBe(after - 1);
  }
  await showSteps(guest, step + 1);
  await expect(guest.getByTestId('showdown-step').last()).toContainText('Hourglass');
  expect(await shownCount(row, 'hourglass')).toBe(after);
  await expect(count(row, 'hourglass')).toHaveAttribute('data-change', 'gain');
  await expect(count(row, 'hourglass').locator('[data-part="delta"]')).toHaveText('+1');
});

test('a reload mid-showdown shows the counts at the shown step without animating', async ({
  browser,
}) => {
  const table = await openOnlineTable(browser, roomSeed(SEED));
  const { step, host } = await reachHourglassGain(table);
  const { guest } = table;
  const after = await guest.evaluate(
    (i) => window.__wwd!.state().view!.players[i]!.hourglass,
    host === 'p0' ? 0 : 1,
  );
  await guest.reload();
  await expect(guest.getByTestId('showdown-steps').getByTestId('showdown-step')).toHaveCount(1);
  const row = guest.getByTestId('opponent-markers');
  expect(await shownCount(row, 'hourglass')).toBe(after - 1);
  await expect(guest.locator('[data-change]')).toHaveCount(0);
  await showSteps(guest, step + 1);
  expect(await shownCount(row, 'hourglass')).toBe(after);
});
