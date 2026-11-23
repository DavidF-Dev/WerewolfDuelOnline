import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { defaultRulesConfig, type Tiebreak } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import Table from '../../src/screens/Table.svelte';
import { newGame, stateFor } from '../games.js';

const localiser = createLocaliser('en');

function rulesText(tiebreak: Tiebreak | null): string {
  const state = {
    ...stateFor(newGame(12), 'p1'),
    config: tiebreak === null ? null : { ...defaultRulesConfig(), tiebreak },
  };
  const { unmount } = render(Table, { props: { localiser, state, onCommand: () => {} } });
  const text = screen.getByTestId('rules-order').textContent?.replace(/\s+/g, ' ').trim() ?? '';
  unmount();
  return text;
}

describe('LogDrawer', () => {
  it("rules drawer states the game's tiebreak", () => {
    expect(rulesText('hourglasses_then_badge')).toBe(
      'Lower initiative resolves first. On a tie, the player who placed more Hourglasses goes first, then the Badge holder.',
    );
    expect(rulesText('badge_only')).toBe(
      'Lower initiative resolves first. On a tie, the Badge holder goes first.',
    );
    expect(rulesText(null)).toBe('Lower initiative resolves first.');
  });
});
