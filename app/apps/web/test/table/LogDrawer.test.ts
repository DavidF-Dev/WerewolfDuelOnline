import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { defaultRulesConfig, type Tiebreak } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import Table from '../../src/screens/Table.svelte';
import LogDrawer from '../../src/table/LogDrawer.svelte';
import { logLine } from '../../src/text.js';
import { newGame, playUntil, stateFor } from '../games.js';

const localiser = createLocaliser('en');

async function rulesText(tiebreak: Tiebreak | null): Promise<string> {
  const state = {
    ...stateFor(newGame(12), 'p1'),
    config: tiebreak === null ? null : { ...defaultRulesConfig(), tiebreak },
  };
  const { unmount } = render(Table, { props: { localiser, state, onCommand: () => {} } });
  await userEvent.click(screen.getByRole('button', { name: 'Game log and rules' }));
  const text = screen.getByTestId('rules-order').textContent?.replace(/\s+/g, ' ').trim() ?? '';
  unmount();
  return text;
}

describe('LogDrawer', () => {
  it('the rules sheet carries the plan hint while rules hints are on', async () => {
    const state = stateFor(newGame(12), 'p1');
    const first = render(Table, { props: { localiser, state, onCommand: () => {} } });
    await userEvent.click(screen.getByRole('button', { name: 'Game log and rules' }));
    const rules = screen.getByRole('region', { name: 'Rules' });
    expect(within(rules).getByTestId('rules-plan-hint').textContent).toBe(localiser.t('hint-plan'));
    first.unmount();

    setDisplaySettings({ ...DEFAULT_SETTINGS, rulesHints: false });
    try {
      render(Table, { props: { localiser, state, onCommand: () => {} } });
      await userEvent.click(screen.getByRole('button', { name: 'Game log and rules' }));
      expect(screen.queryByTestId('rules-plan-hint')).toBeNull();
    } finally {
      setDisplaySettings(DEFAULT_SETTINGS);
    }
  });

  it("rules drawer states the game's tiebreak", async () => {
    expect(await rulesText('hourglasses_then_badge')).toBe(
      'Lower initiative resolves first. On a tie, the player who placed more Hourglasses goes first, then the Badge holder.',
    );
    expect(await rulesText('badge_only')).toBe(
      'Lower initiative resolves first. On a tie, the Badge holder goes first.',
    );
    expect(await rulesText(null)).toBe('Lower initiative resolves first.');
  });

  it('log lines bold names and put the marker icon before marker words', () => {
    const game = newGame(12);
    playUntil(game, () => game.pending().kind === 'next_round');
    const events = game.eventsSince(0, { seat: 'p1' });
    render(LogDrawer, {
      props: { localiser, events, seat: 'p1', tiebreak: null, open: true, onclose: () => {} },
    });
    const items = within(screen.getByTestId('event-log')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(
      events.map(([, event]) => logLine(localiser, event, 'p1')),
    );
    const resolved = items.find((item) => /resolves.$/.test(item.textContent ?? ''));
    expect(resolved?.querySelector('strong')?.textContent).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?$/);
    const ended = items.find((item) => /ends./.test(item.textContent ?? ''));
    const badge = ended?.querySelector('[data-part="marker"]');
    expect(badge?.textContent).toBe('Badge');
    expect(badge?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('the rules sheet shows the ability legend', () => {
    render(LogDrawer, {
      props: { localiser, events: [], seat: 'p1', tiebreak: null, open: true, onclose: () => {} },
    });
    const rules = screen.getByRole('region', { name: 'Rules' });
    const legend = screen.getByTestId('ability-legend');
    expect(
      rules.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the legend follows the rules',
    ).toBeTruthy();
    expect(within(legend).getByRole('heading', { level: 3 }).textContent).toBe(
      localiser.t('legend-heading'),
    );
  });
});
