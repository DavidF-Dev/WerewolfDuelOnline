import { render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { defaultRulesConfig, type Character } from '@wwd/engine';
import { createLocaliser } from '@wwd/client-core';
import PlanSheet from '../../src/table/PlanSheet.svelte';
import TargetGrid from '../../src/table/TargetGrid.svelte';
import { gameDealing } from '../games.js';

const localiser = createLocaliser('en');

/** The plan builder for a seat dealt every card in `cards`. */
function planFor(cards: Character[]) {
  const game = gameDealing('p0', cards);
  const hand = game.view({ seat: 'p0' }).players[0].hand ?? [];
  const legal = game.legalActions('p0');
  render(PlanSheet, {
    props: { localiser, hand, legal, config: defaultRulesConfig(), onCommand: () => {} },
  });
  return hand;
}

const targets = (): HTMLElement[] =>
  within(screen.getByRole('region', { name: 'Targets' })).getAllByRole('button');

const frame = (button: HTMLElement): HTMLElement => button.closest('.frame') as HTMLElement;

describe('TargetGrid', () => {
  it('cards in the hand are not shown', () => {
    const hand: Character[] = ['knight', 'witch', 'villager'];
    render(TargetGrid, { props: { localiser, hand } });
    const grid = screen.getByRole('region', { name: 'Targets' });
    const shown = Array.from(grid.querySelectorAll<HTMLElement>('li[data-card]'), (li) =>
      li.getAttribute('data-card'),
    );
    expect(shown).toEqual(['hunter', 'wolf_king', 'wolfen', 'seer', 'wolf_beauty', 'fool']);
    expect(within(grid).getAllByRole('button')).toHaveLength(6);
    expect(grid.querySelector('[data-part="in-hand"]')).toBeNull();
  });

  it('nothing is faded before a character is chosen', () => {
    const hand = planFor(['knight', 'seer', 'villager']);
    expect(targets()).toHaveLength(9 - hand.length);
    for (const target of targets()) {
      expect(target.getAttribute('aria-disabled'), target.getAttribute('aria-label')!).toBeNull();
      expect(frame(target).classList.contains('disabled')).toBe(false);
      expect(frame(target).classList.contains('faded')).toBe(false);
    }
  });

  it("targets the chosen character can't use are faded, not crossed", async () => {
    planFor(['knight', 'seer', 'villager']);
    await userEvent.click(screen.getByTestId('plan-character-knight'));
    const humans = targets().filter((t) => / Human[.]/.test(t.getAttribute('aria-label')!));
    expect(humans.length).toBeGreaterThan(0);
    for (const human of humans) {
      expect(human.getAttribute('aria-disabled')).toBe('true');
      expect(frame(human).classList.contains('faded')).toBe(true);
      expect(frame(human).classList.contains('crossed')).toBe(false);
    }
    const werewolves = targets().filter((t) => / Werewolf[.]/.test(t.getAttribute('aria-label')!));
    for (const werewolf of werewolves) {
      expect(werewolf.getAttribute('aria-disabled')).toBeNull();
      expect(frame(werewolf).classList.contains('faded')).toBe(false);
    }
  });
});
