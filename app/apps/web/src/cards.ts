import {
  abilitySummary,
  type AbilitySummary,
  type Character,
  type Marker,
  type TargetCard,
} from '@wwd/engine';

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

/** A target shape drawn in an attack pill: one faction, or `any` character. */
export type TargetShape = Faction | 'any';

/** One item of a card's ability row, in the order the card resolves it. */
export type AbilityPill =
  | { kind: 'gain'; marker: Marker }
  | { kind: 'attack'; cost: Marker | null; targets: readonly TargetShape[]; damage: number };

/** The ability row drawn for an engine summary; it redraws the summary and states no rule itself. */
function pillsFor(summary: AbilitySummary): AbilityPill[] {
  const pills: AbilityPill[] = summary.gains.map((marker) => ({ kind: 'gain', marker }));
  const { spends, attack, damage } = summary;
  if (attack === null) return pills;
  const shape: TargetShape = attack.faction ?? 'any';
  const cost = spends !== null && 'one' in spends ? spends.one : null;
  const targets: TargetShape[] = Array.from({ length: attack.max ?? 1 }, () => shape);
  pills.push({ kind: 'attack', cost, targets, damage });
  if (spends !== null && 'per_extra_target' in spends) {
    pills.push({ kind: 'attack', cost: spends.per_extra_target, targets: [shape], damage });
  }
  return pills;
}

/** The ability row of a card that does nothing, such as the Fool. */
export const NO_PILLS: readonly AbilityPill[] = [];

const pillRows = new Map<Character, readonly AbilityPill[]>();

/** The ability row of `character`, from the engine's summary, read once per character. */
export function pillsOf(character: Character): readonly AbilityPill[] {
  let row = pillRows.get(character);
  if (row === undefined) {
    row = pillsFor(abilitySummary(character));
    pillRows.set(character, row);
  }
  return row;
}
