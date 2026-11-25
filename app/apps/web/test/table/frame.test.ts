import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Command, Plan } from '@wwd/engine';
import { createLocaliser, type GameClientState } from '@wwd/client-core';
import { canonicalTargets, targetId } from '../../src/cards.js';
import { ONLINE, OPPONENT, potionState } from '../../src/gallery/fixtures.js';
import OnlineTable from '../../src/gallery/OnlineTable.svelte';
import Table from '../../src/screens/Table.svelte';
import { newGame, playUntil, stateFor } from '../games.js';

const localiser = createLocaliser('en');

const planning = (): GameClientState => stateFor(newGame(12), 'p1');

function roundOver(): GameClientState {
  const game = newGame(12);
  playUntil(game, () => game.pending().kind === 'next_round');
  return stateFor(game, 'p1');
}

/** Whether `element` is drawn: not inside a visually hidden or closed part of the page. */
const drawn = (element: Element): boolean =>
  element.closest('.visually-hidden, [hidden], dialog:not([open])') === null;

describe('Table frame', () => {
  it('table bar shows the round with menu and log buttons', () => {
    const { unmount } = render(Table, {
      props: { localiser, state: planning(), onCommand: () => {} },
    });
    const bar = within(screen.getByRole('banner'));
    expect(bar.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Round 1');
    expect(bar.getByRole('button', { name: 'Game menu' })).toBeTruthy();
    expect(bar.getByRole('button', { name: 'Game log and rules' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Table' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'In play' })).toBeNull();
    expect(screen.queryByText(/^Status:/)).toBeNull();
    expect(screen.queryByTestId('game-menu'), 'the menu is a closed sheet').toBeNull();
    expect(screen.queryByTestId('event-log'), 'the log is a closed sheet').toBeNull();
    unmount();

    render(Table, { props: { localiser, state: roundOver(), onCommand: () => {} } });
    expect(
      within(screen.getByRole('banner')).getByRole('heading', { level: 1 }).textContent?.trim(),
    ).toBe('Round 1 · Showdown');
  });

  it('phase bar shows four steps, the step, the instruction and the action', () => {
    render(Table, { props: { localiser, state: roundOver(), onCommand: () => {} } });
    const bar = screen.getByTestId('phase-bar');
    const steps = bar.querySelectorAll('[data-part="step-bar"]');
    expect(steps).toHaveLength(4);
    expect(Array.from(steps).filter((step) => step.hasAttribute('data-done'))).toHaveLength(4);
    expect(within(bar).getByTestId('phase-step').textContent?.trim()).toBe('Round over');
    expect(within(bar).getByTestId('phase-instruction').textContent).toBe('The round is over.');
    expect(within(bar).getByRole('button', { name: 'Next round' })).toBeTruthy();
  });

  it('sheets restore focus', async () => {
    const user = userEvent.setup();
    render(Table, { props: { localiser, state: planning(), onCommand: () => {} } });
    for (const [name, testId] of [
      ['Game menu', 'game-menu'],
      ['Game log and rules', 'log-drawer'],
    ] as const) {
      const opener = screen.getByRole('button', { name });
      await user.click(opener);
      const sheet = screen.getByTestId(testId);
      expect(sheet.tagName).toBe('DIALOG');
      expect(sheet.hasAttribute('open')).toBe(true);
      expect(within(sheet).getByRole('heading', { level: 2 }).textContent).toBe(name);
      expect(sheet.contains(document.activeElement), `${name} takes focus`).toBe(true);
      await user.click(within(sheet).getByRole('button', { name: 'Close' }));
      expect(screen.queryByTestId(testId)).toBeNull();
      expect(document.activeElement, `${name} gives focus back`).toBe(opener);
    }
  });

  it('log sheet holds the log, the rules and the ability legend', async () => {
    render(Table, { props: { localiser, state: planning(), onCommand: () => {} } });
    await userEvent.click(screen.getByRole('button', { name: 'Game log and rules' }));
    const sheet = within(screen.getByTestId('log-drawer'));
    expect(sheet.getByRole('region', { name: 'Game log' })).toBeTruthy();
    expect(sheet.getByRole('region', { name: 'Rules' })).toBeTruthy();
    expect(sheet.getByTestId('ability-legend')).toBeTruthy();
  });

  it('game menu sheet carries the unofficial notice', async () => {
    render(Table, { props: { localiser, state: planning(), onCommand: () => {} } });
    expect(screen.queryByTestId('unofficial-notice')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    expect(
      within(screen.getByTestId('game-menu')).getByTestId('unofficial-notice').textContent?.trim(),
    ).toBe(localiser.t('footer-unofficial'));
  });

  it('no status text duplicates the opponent strip', () => {
    const state: GameClientState = {
      ...planning(),
      opponent: { connected: true, name: OPPONENT },
    };
    render(OnlineTable, { props: { localiser, state, connection: ONLINE } });
    const strip = screen.getByRole('region', { name: `Opponent: ${OPPONENT}` });
    const said = [
      within(strip).getByTestId('opponent-connection').textContent?.trim() ?? '',
      within(strip).getByTestId('opponent-plan').textContent?.trim() ?? '',
    ];
    expect(said).toEqual(['Connected', 'Plan: not sealed yet']);
    const table = screen.getByTestId('table').parentElement ?? document.body;
    const elsewhere = Array.from(table.querySelectorAll('*'))
      .filter((element) => !strip.contains(element) && drawn(element))
      .map((element) => element.textContent?.trim() ?? '');
    for (const text of said) expect(elsewhere, text).not.toContain(text);
    expect(elsewhere.some((text) => text.startsWith('Status:'))).toBe(false);
  });

  it('opponent strip shows their sealed plan, then says when they wait for me', () => {
    const game = newGame(12);
    const theirs = game.legalActions('p0')[0];
    if (theirs === undefined) throw new Error('no plan offered');
    game.apply('p0', theirs);
    const sealed = render(Table, {
      props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} },
    });
    const chip = () => screen.getByTestId('opponent-plan').textContent?.trim();
    expect(chip()).toMatch(/^✓\s*Sealed · \d targets?$/);
    sealed.unmount();

    const mine = game.legalActions('p1')[0];
    if (mine === undefined) throw new Error('no plan offered');
    game.apply('p1', mine);
    const seat = game.pending().seats[0];
    if (seat === undefined) throw new Error('nobody to place Hourglasses');
    render(Table, { props: { localiser, state: stateFor(game, seat), onCommand: () => {} } });
    expect(chip()).toBe('Waiting for you');
  });

  it('my strip shows my markers, the Badge and You', () => {
    const state = planning();
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    const mine = screen.getByTestId('my-area');
    const region = within(mine);
    expect(region.getByText('Health: 2')).toBeTruthy();
    expect(region.getByText('You')).toBeTruthy();
    if (state.view?.badge === 'p1') expect(region.getByText('Badge')).toBeTruthy();
    else expect(region.queryByText('Badge')).toBeNull();
  });

  it('each pending phase hands its one primary action to the phase bar', () => {
    const inBar = (id: string): boolean =>
      screen.getByTestId('phase-bar').contains(screen.getByTestId(id));
    const cases: Array<[GameClientState, string[]]> = [
      [planning(), ['seal-plan']],
      [potionState(), ['confirm-potion']],
      [roundOver(), ['showdown-next', 'action-next-round']],
    ];
    const game = newGame(12);
    for (const seat of ['p0', 'p1'] as const) {
      const plan = game.legalActions(seat)[0];
      if (plan === undefined) throw new Error('no plan offered');
      game.apply(seat, plan);
    }
    const placing = game.pending().seats[0];
    if (placing === undefined) throw new Error('nobody to place Hourglasses');
    cases.push([stateFor(game, placing), ['place-hourglasses']]);
    for (const [state, ids] of cases) {
      const { unmount } = render(Table, { props: { localiser, state, onCommand: () => {} } });
      for (const id of ids) expect(inBar(id), id).toBe(true);
      expect(screen.getByTestId('phase-bar').querySelectorAll('button')).toHaveLength(ids.length);
      unmount();
    }
  });

  it('phase bar offers no action while this seat only waits', () => {
    const game = newGame(12);
    const mine = game.legalActions('p1')[0];
    if (mine === undefined) throw new Error('no plan offered');
    game.apply('p1', mine);
    render(Table, { props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} } });
    const bar = screen.getByTestId('phase-bar');
    expect(bar.querySelectorAll('button')).toHaveLength(0);
    expect(within(bar).getByTestId('phase-instruction').textContent).toBe(
      'Waiting for your opponent.',
    );
  });

  it('plan summary is the phase bar instruction in rich text', async () => {
    const user = userEvent.setup();
    const state = planning();
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    const bar = screen.getByTestId('phase-bar');
    const instruction = within(bar).getByTestId('phase-instruction');
    expect(instruction.textContent?.trim()).toBe('Choose a character');
    expect(
      within(bar).queryByTestId('phase-hint'),
      'the seal confirmation carries the hint',
    ).toBeNull();

    const plan = state.legal
      .filter(
        (cmd): cmd is Extract<Command, { submit_plan: Plan }> =>
          typeof cmd === 'object' && 'submit_plan' in cmd,
      )
      .map((cmd) => cmd.submit_plan)
      .find((p) => p.targets.length >= 2);
    if (plan === undefined) throw new Error('no plan with two targets');
    await user.click(screen.getByTestId(`plan-character-${plan.character}`));
    for (const card of plan.targets)
      await user.click(screen.getByTestId(`target-${targetId(card)}`));

    const name = (id: string): string =>
      id === 'fool' ? 'Fool' : localiser.t(`character-${id.replaceAll('_', '-')}`);
    const names = [plan.character, ...canonicalTargets(plan.targets).map(targetId)].map(name);
    const shown = instruction.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(shown?.textContent).toBe(`${names[0]} → ${names.slice(1).join(' + ')}`);
    expect(Array.from(shown?.querySelectorAll('strong') ?? [], (b) => b.textContent)).toEqual(
      names,
    );
    expect(instruction.textContent).toContain(`Plan: ${names[0]} targeting`);
    expect(within(bar).getByTestId('seal-plan')).toBeTruthy();
    expect(
      within(screen.getByTestId('plan-builder')).queryByTestId('plan-summary'),
      'no summary under the targets',
    ).toBeNull();
  });

  it('once my plan is sealed my hand shows in its own panel', () => {
    const game = newGame(12);
    const mine = game.legalActions('p1')[0];
    if (mine === undefined) throw new Error('no plan offered');
    game.apply('p1', mine);
    const state = stateFor(game, 'p1');
    const hand = state.view?.players[1].hand ?? [];
    expect(hand.length).toBeGreaterThan(0);
    render(Table, { props: { localiser, state, onCommand: () => {} } });
    expect(screen.queryByTestId('plan-builder')).toBeNull();
    const panel = within(screen.getByRole('region', { name: 'Your hand' }));
    expect(panel.getAllByTestId(/^card-/).map((card) => card.dataset['testid'])).toEqual(
      hand.map((c) => `card-${c}`),
    );
  });

  it('focus moves to the new action once a sheet closes', async () => {
    const user = userEvent.setup();
    const probe = newGame(12);
    for (const seat of ['p0', 'p1'] as const) probe.apply(seat, probe.legalActions(seat)[0]!);
    const first = probe.pending().seats[0];
    if (first === undefined) throw new Error('nobody to place Hourglasses');
    const other = first === 'p0' ? 'p1' : 'p0';

    const game = newGame(12);
    game.apply(first, game.legalActions(first)[0]!);
    const { rerender } = render(Table, {
      props: { localiser, state: stateFor(game, first), onCommand: () => {} },
    });
    const opener = screen.getByRole('button', { name: 'Game menu' });
    await user.click(opener);
    const sheet = screen.getByTestId('game-menu');
    game.apply(other, game.legalActions(other)[0]!);
    await rerender({ state: stateFor(game, first) });
    expect(sheet.contains(document.activeElement), 'the open sheet keeps focus').toBe(true);
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(screen.getByTestId('place-hourglasses'));
  });

  it('the next round hands its plan action to the phase bar again', async () => {
    const game = newGame(12);
    const { rerender } = render(Table, {
      props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} },
    });
    const actions = () =>
      Array.from(screen.getByTestId('phase-bar').querySelectorAll('button')).map(
        (button) => button.dataset['testid'],
      );
    expect(actions()).toEqual(['seal-plan']);
    playUntil(game, () => game.pending().kind === 'next_round');
    await rerender({ state: stateFor(game, 'p1') });
    expect(actions()).toEqual(['showdown-next', 'action-next-round']);
    for (const seat of ['p0', 'p1'] as const) game.apply(seat, 'next_round');
    await rerender({ state: stateFor(game, 'p1') });
    expect(actions()).toEqual(['seal-plan']);
  });
});
