import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Game,
  defaultRulesConfig,
  type Character,
  type Command,
  type RulesConfig,
} from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import { gameDealing as dealing, seedHex } from '../../src/gallery/games.js';
import { setDisplaySettings } from '../../src/settings/display.svelte.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import PlanSheet from '../../src/table/PlanSheet.svelte';

const localiser = createLocaliser('en');

const games: Game[] = [];
afterEach(() => {
  setDisplaySettings(DEFAULT_SETTINGS);
  for (const game of games.splice(0)) game.dispose();
});

/** The plan builder for a seat dealt every card in `cards`, under `config`. */
function setUp(cards: Character[], config: RulesConfig = defaultRulesConfig()) {
  setDisplaySettings({ ...DEFAULT_SETTINGS, confirmPlan: false });
  const game = dealing('p0', cards, (seed) => {
    const made = Game.create(seedHex(seed), config);
    games.push(made);
    return made;
  });
  const hand = game.view({ seat: 'p0' }).players[0].hand ?? [];
  const onCommand = vi.fn<(cmd: Command) => void>();
  render(PlanSheet, {
    props: { localiser, hand, legal: game.legalActions('p0'), config, onCommand },
  });
  return { onCommand };
}

const choose = (c: Character) => userEvent.click(screen.getByTestId(`plan-character-${c}`));
const fool = (): HTMLElement => screen.getByTestId('target-fool');
const seal = (): HTMLButtonElement => screen.getByTestId('seal-plan') as HTMLButtonElement;

describe('the plan builder', () => {
  for (const character of ['villager', 'witch'] as const) {
    it(`choosing the ${character === 'villager' ? 'Villager' : 'Witch'} chooses the Fool`, async () => {
      const { onCommand } = setUp([character, 'knight']);
      await choose(character);
      expect(fool().getAttribute('aria-pressed')).toBe('true');
      expect(seal().disabled).toBe(false);
      await userEvent.click(seal());
      expect(onCommand).toHaveBeenCalledExactlyOnceWith({
        submit_plan: { character, targets: ['fool'] },
      });
    });
  }

  it('switching away clears a Fool the app chose', async () => {
    setUp(['villager', 'knight']);
    await choose('villager');
    expect(fool().getAttribute('aria-pressed')).toBe('true');
    await choose('knight');
    expect(fool().getAttribute('aria-pressed')).toBe('false');
    expect(seal().disabled).toBe(true);
  });

  it('a Fool the player chose survives switching characters', async () => {
    setUp(['villager', 'knight', 'witch']);
    await choose('knight');
    await userEvent.click(fool());
    expect(fool().getAttribute('aria-pressed')).toBe('true');
    for (const next of ['villager', 'knight', 'witch', 'knight'] as const) {
      await choose(next);
      expect(fool().getAttribute('aria-pressed'), next).toBe('true');
    }
  });

  it('a Fool the app chose and the player then took away stays away', async () => {
    setUp(['villager', 'knight']);
    await choose('villager');
    await userEvent.click(fool());
    expect(fool().getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(fool());
    await choose('knight');
    expect(fool().getAttribute('aria-pressed'), 'chosen again by the player').toBe('true');
  });

  it('with min_targets 0 nothing is chosen for you', async () => {
    setUp(['villager', 'witch'], { ...defaultRulesConfig(), min_targets: 0 });
    for (const character of ['villager', 'witch'] as const) {
      await choose(character);
      expect(fool().getAttribute('aria-pressed'), character).toBe('false');
    }
  });
});
