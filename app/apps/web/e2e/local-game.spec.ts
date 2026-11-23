import { expect, test } from '@playwright/test';
import {
  isPlan,
  expectGameOver,
  mulberry32,
  openTable,
  perform,
  playToEnd,
  snapshot,
  tabTo,
  targetId,
} from './game.js';

const PRINTED_ORDER = [
  'hunter',
  'wolf_king',
  'knight',
  'wolfen',
  'seer',
  'witch',
  'wolf_beauty',
  'villager',
  'fool',
];

test('two tabs play a full game', async ({ context }) => {
  const table = await openTable(context);
  await playToEnd(table, { random: mulberry32(1) });
  await expectGameOver(table);
});

test('guest never receives the host hand', async ({ context }) => {
  const table = await openTable(context);
  let checked = 0;
  await playToEnd(table, {
    random: mulberry32(2),
    afterStep: async (_step, { guest, host }) => {
      for (const page of [guest, host]) {
        const s = await snapshot(page);
        expect(s.otherHand).toBeNull();
        expect(s.sawOtherHand, 'no hand_dealt for the other seat').toBe(false);
        if (s.otherPlan === 'revealed') expect(s.plansRevealed).toBeGreaterThanOrEqual(s.round);
        else expect(['none', 'hidden']).toContain(s.otherPlan);
      }
      checked += 1;
    },
  });
  expect(checked).toBeGreaterThan(0);
  await expectGameOver(table);
});

test('guest reload resumes at the same seat', async ({ context }) => {
  const table = await openTable(context);
  let reloaded = false;
  let seat: string | null = null;
  await playToEnd(table, {
    random: mulberry32(3),
    // In round 2 the host waits until the guest has sealed and reloaded, so hidden state is outstanding.
    hold: (page, s) => page === table.host && !reloaded && s.round === 2,
    afterStep: async (_step, { guest, host }) => {
      if (reloaded) return;
      const before = await snapshot(guest);
      if (before.round !== 2 || before.myPlan === 'none') return;
      expect((await snapshot(host)).myPlan).toBe('none');
      seat = before.seat;
      await guest.reload();
      await expect(guest.getByTestId('table')).toBeVisible();
      await expect.poll(async () => (await snapshot(guest)).seat).toBe(seat);
      await expect.poll(async () => (await snapshot(guest)).myPlan).not.toBe('none');
      reloaded = true;
    },
  });
  expect(reloaded).toBe(true);
  await expectGameOver(table);
});

test('guest seals a plan with the keyboard alone', async ({ context }) => {
  const { host, guest } = await openTable(context);
  await expect.poll(async () => (await snapshot(guest)).legal.length).toBeGreaterThan(0);

  const plans = (await snapshot(guest)).legal.filter(isPlan).map((cmd) => cmd.submit_plan);
  const plan = plans.find((p) => p.targets.length > 0) ?? plans[0];
  expect(plan).toBeDefined();
  if (plan === undefined) return;

  // Focus lands on the first plan control by itself, so tabbing starts from there.
  await tabTo(guest, `plan-character-${plan.character}`);
  await guest.keyboard.press('Space');
  await expect(guest.getByTestId(`plan-character-${plan.character}`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The targets are listed in printed order, which is the tab order.
  const targets = plan.targets
    .map(targetId)
    .sort((a, b) => PRINTED_ORDER.indexOf(a) - PRINTED_ORDER.indexOf(b));
  for (const target of targets) {
    await tabTo(guest, `target-${target}`);
    await guest.keyboard.press('Space');
    await expect(guest.getByTestId(`target-${target}`)).toHaveAttribute('aria-pressed', 'true');
  }

  await tabTo(guest, 'seal-plan');
  await expect(guest.getByTestId('seal-plan')).toBeFocused();
  await guest.keyboard.press('Enter');

  await expect(guest.getByTestId('plan-builder')).toBeHidden();

  // The host's plan completes the round, which shows the sealed plan reached the referee.
  const hostPlan = (await snapshot(host)).legal.find(isPlan);
  expect(hostPlan).toBeDefined();
  if (hostPlan === undefined) return;
  const before = (await snapshot(guest)).lastSeq;
  await perform(host, hostPlan);
  await expect.poll(async () => (await snapshot(guest)).lastSeq).toBeGreaterThan(before);
});
