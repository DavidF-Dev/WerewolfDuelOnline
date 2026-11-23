import type { Character, PlanView, Seat, TargetCard, View } from '@wwd/engine';
import { targetId } from '../cards.js';

export type DeductionMark = 'mine' | 'possible' | 'ruled-out';

/** What the tracker has seen in public view facts this round, and the player's own marks. */
export interface Deduction {
  readonly round: number;
  /** Characters seen in my hand or my plan this round. */
  readonly mine: readonly Character[];
  /** Characters seen in the opponent's revealed plan this round. */
  readonly revealed: readonly Character[];
  /** Target card ids the player has ruled out by hand. */
  readonly ruledOut: readonly string[];
}

export const startDeduction = (round: number): Deduction => ({
  round,
  mine: [],
  revealed: [],
  ruledOut: [],
});

const planCharacter = (plan: PlanView): Character[] =>
  typeof plan === 'object' && 'revealed' in plan ? [plan.revealed.character] : [];

/** Adds `extra` to `known`, returning `known` itself when nothing is new. */
function union(known: readonly Character[], extra: readonly Character[]): readonly Character[] {
  const added = extra.filter((c, i) => !known.includes(c) && extra.indexOf(c) === i);
  return added.length === 0 ? known : [...known, ...added];
}

/**
 * Records what `seat` can see in `view`: its own hand and plan, and the opponent's plan once it
 * is revealed. A new round starts afresh; the result is `d` itself when nothing changed.
 */
export function observe(d: Deduction, view: View, seat: Seat): Deduction {
  const base = view.round === d.round ? d : startDeduction(view.round);
  const me = view.players[seat === 'p0' ? 0 : 1];
  const opponent = view.players[seat === 'p0' ? 1 : 0];
  const mine = union(base.mine, [...(me.hand ?? []), ...planCharacter(me.plan)]);
  const revealed = union(base.revealed, planCharacter(opponent.plan));
  if (mine === base.mine && revealed === base.revealed) return base;
  return { ...base, mine, revealed };
}

const automaticMark = (d: Deduction, card: TargetCard): DeductionMark | null => {
  if (card === 'fool') return null;
  if (d.mine.includes(card.character)) return 'mine';
  if (d.revealed.includes(card.character)) return 'ruled-out';
  return null;
};

/** Whether `card` is marked from view facts, so a tap does not change it. */
export const isAutomatic = (d: Deduction, card: TargetCard, autoMark: boolean): boolean =>
  autoMark && automaticMark(d, card) !== null;

export function markOf(d: Deduction, card: TargetCard, autoMark: boolean): DeductionMark {
  const automatic = autoMark ? automaticMark(d, card) : null;
  if (automatic !== null) return automatic;
  return d.ruledOut.includes(targetId(card)) ? 'ruled-out' : 'possible';
}

/** Moves a manually marked card between possible and ruled out. */
export function cycleMark(d: Deduction, card: TargetCard, autoMark: boolean): Deduction {
  if (isAutomatic(d, card, autoMark)) return d;
  const id = targetId(card);
  const ruledOut = d.ruledOut.includes(id)
    ? d.ruledOut.filter((other) => other !== id)
    : [...d.ruledOut, id];
  return { ...d, ruledOut };
}
