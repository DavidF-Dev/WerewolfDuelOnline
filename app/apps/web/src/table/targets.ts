import type { Character, TargetCard } from '@wwd/engine';

/** Whether `card` names a character in `hand`; the Fool never does. */
export const isInHand = (card: TargetCard, hand: readonly Character[]): boolean =>
  card !== 'fool' && hand.includes(card.character);
