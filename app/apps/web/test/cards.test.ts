import { describe, expect, it } from 'vitest';
import type { Character } from '@wwd/engine';
import { CHARACTERS, pillsOf, type AbilityPill } from '../src/cards.js';

/** A pill written as `gain marker` or `attack cost [targets] damage`. */
const written = (pill: AbilityPill): string =>
  pill.kind === 'gain'
    ? `gain ${pill.marker}`
    : `attack ${pill.cost} [${pill.targets.join(', ')}] ${pill.damage}`;

describe('ability pills', () => {
  it('pills match the engine summary for every character', () => {
    const expected: Record<Character, string[]> = {
      hunter: ['attack cross [werewolf, werewolf] 1'],
      wolf_king: ['attack null [human] 1', 'attack fang [human] 1'],
      knight: ['gain hourglass', 'attack null [werewolf] 1'],
      wolfen: ['gain hourglass', 'attack null [any] 1'],
      seer: ['attack null [werewolf] 2'],
      witch: ['gain potion'],
      wolf_beauty: ['gain fang', 'attack null [any] 1'],
      villager: ['gain cross'],
    };
    for (const character of CHARACTERS) {
      expect(pillsOf(character).map(written), character).toEqual(expected[character]);
    }
  });

  it('reads each character once', () => {
    expect(pillsOf('knight')).toBe(pillsOf('knight'));
  });
});
