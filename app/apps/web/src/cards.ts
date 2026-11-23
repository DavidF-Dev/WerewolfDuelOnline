import type { Character, TargetCard } from '@wwd/engine';

export type Faction = 'human' | 'werewolf';

/** Every character, in printed initiative order. */
export const CHARACTERS: readonly Character[] = [
  'hunter',
  'wolf_king',
  'knight',
  'wolfen',
  'seer',
  'witch',
  'wolf_beauty',
  'villager',
];

const WEREWOLVES: ReadonlySet<Character> = new Set(['wolf_king', 'wolfen', 'wolf_beauty']);

export const faction = (c: Character): Faction => (WEREWOLVES.has(c) ? 'werewolf' : 'human');

export const initiative = (c: Character): number => CHARACTERS.indexOf(c) + 1;

/** Each player's nine target cards, in canonical order: characters by initiative, then the Fool. */
export const TARGET_CARDS: readonly TargetCard[] = [
  ...CHARACTERS.map((character) => ({ character })),
  'fool',
];

/** A stable identifier for a target card: the character id, or `fool`. */
export const targetId = (card: TargetCard): string => (card === 'fool' ? 'fool' : card.character);

/** Sorts target cards into canonical order. */
export function canonicalTargets(cards: Iterable<TargetCard>): TargetCard[] {
  const ids = new Set([...cards].map(targetId));
  return TARGET_CARDS.filter((card) => ids.has(targetId(card)));
}
