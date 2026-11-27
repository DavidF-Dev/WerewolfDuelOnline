import type { Character, TargetCard } from '@wwd/engine';
import { TARGET_CARDS } from '../cards.js';

/** Whether `card` names a character in `hand`; the Fool never does. */
export const isInHand = (card: TargetCard, hand: readonly Character[]): boolean =>
  card !== 'fool' && hand.includes(card.character);

/** The target cards not in `hand`, in their usual order. */
export const shownTargets = (hand: readonly Character[]): TargetCard[] =>
  TARGET_CARDS.filter((card) => !isInHand(card, hand));
