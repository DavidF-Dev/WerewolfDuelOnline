import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Command } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import ContinueElsewhere from '../../src/components/ContinueElsewhere.svelte';
import { DEFAULT_SERVER, rejoinLink } from '../../src/online.js';
import Table from '../../src/screens/Table.svelte';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import GameMenu from '../../src/table/GameMenu.svelte';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');

afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
});

describe('Game menu', () => {
  it('holds Describe table and Resign, which asks before resigning', async () => {
    const sent: Command[] = [];
    const onResign = vi.fn();
    render(Table, {
      props: {
        localiser,
        state: stateFor(newGame(12), 'p1'),
        onCommand: (cmd) => sent.push(cmd),
        onResign,
      },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    const menu = screen.getByTestId('game-menu');
    expect(menu.hasAttribute('open')).toBe(true);
    expect(within(menu).getByRole('button', { name: 'Describe table' })).toBeTruthy();
    expect(within(menu).queryByRole('button', { name: 'Pause after this round' })).toBeNull();

    await userEvent.click(within(menu).getByRole('button', { name: 'Resign' }));
    expect(onResign).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', {
      name: 'Resign this game? Your opponent wins.',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Resign' }));
    expect(onResign).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('game-menu'), 'resigning closes the menu').toBeNull();
    expect(sent, 'resigning is never sent as a legal command').toEqual([]);
  });

  it('offers Resign only when the table is told how to resign', async () => {
    render(Table, {
      props: { localiser, state: stateFor(newGame(12), 'p1'), onCommand: () => {} },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Game menu' }));
    const menu = screen.getByTestId('game-menu');
    expect(within(menu).queryByRole('button', { name: 'Resign' })).toBeNull();
  });

  it('offers to pause only once pausing is wired up', async () => {
    const game = newGame(12);
    const onPause = vi.fn();
    render(GameMenu, {
      props: {
        localiser,
        view: game.view({ seat: 'p1' }),
        seat: 'p1',
        canResign: false,
        onResign: () => {},
        onPause,
        onclose: () => {},
      },
    });
    expect(screen.queryByRole('button', { name: 'Resign' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Pause after this round' }));
    expect(onPause).toHaveBeenCalledOnce();
  });
});

describe('Continue on another device', () => {
  it('continue elsewhere qr never contains the pin', async () => {
    const { container } = render(ContinueElsewhere, {
      props: { localiser, room: 'K7Q2MX', seat: 'p1', server: DEFAULT_SERVER, pin: '4821' },
    });
    const user = userEvent.setup();
    await user.click(screen.getByText('Continue on another device'));
    await user.click(screen.getByRole('button', { name: 'Show PIN' }));
    expect(screen.getByTestId('pin').textContent).toBe('PIN: 4821');

    const qr = screen.getByTestId('rejoin-qr');
    const link = rejoinLink('K7Q2MX', 'p1', DEFAULT_SERVER);
    expect(link).toBe(`${location.origin}${location.pathname}#/rejoin?code=K7Q2MX&seat=p1`);
    expect(within(qr).getByText(link)).toBeTruthy();
    expect(qr.outerHTML).not.toContain('4821');
    expect(container.contains(qr)).toBe(true);
  });
});

describe('Haptics', () => {
  it('vibrates when it becomes my turn, only with haptics on', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    onTestFinished(() => {
      Reflect.deleteProperty(navigator, 'vibrate');
    });
    const game = newGame(12);
    const mine = game.legalActions('p1')[0];
    if (mine === undefined) throw new Error('no plan offered');

    setDisplaySettings({ ...DEFAULT_SETTINGS, haptics: false });
    const first = render(Table, {
      props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} },
    });
    expect(vibrate).not.toHaveBeenCalled();
    first.unmount();

    setDisplaySettings({ ...DEFAULT_SETTINGS, haptics: true });
    const { rerender } = render(Table, {
      props: { localiser, state: stateFor(game, 'p1'), onCommand: () => {} },
    });
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(30);
    game.apply('p1', mine);
    await rerender({ state: stateFor(game, 'p1') });
    expect(vibrate).toHaveBeenCalledOnce();
    const theirs = game.legalActions('p0')[0];
    if (theirs === undefined) throw new Error('no plan offered');
    game.apply('p0', theirs);
    const next = stateFor(game, 'p1');
    await rerender({ state: next });
    expect(next.pending?.seats).toEqual(['p1']);
    expect(vibrate).toHaveBeenCalledTimes(2);

    // A dropped and restored connection brings back the same offer, which is not a new turn.
    await rerender({ state: { ...next, status: 'disconnected' } });
    await rerender({ state: { ...next, status: 'disconnected', legal: [] } });
    await rerender({ state: stateFor(game, 'p1') });
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
});
