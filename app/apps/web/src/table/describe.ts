import { showdownOrder, type Character, type PlanView, type Seat, type View } from '@wwd/engine';
import { plainText, type Localiser } from '@wwd/client-core';
import { listText, markerLines, planText } from '../text.js';

const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);
const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');

function planSentence(l: Localiser, who: 'my' | 'opponent', plan: PlanView): string {
  if (plan === 'none') return l.t(`describe-${who}-plan-none`);
  if ('hidden' in plan) {
    return l.t(`describe-${who}-plan-hidden`, { count: plan.hidden.target_count });
  }
  return l.t(`describe-${who}-plan`, { plan: planText(l, plan.revealed) });
}

const revealedCharacter = (plan: PlanView): Character | null =>
  typeof plan === 'object' && 'revealed' in plan ? plan.revealed.character : null;

function orderSentence(l: Localiser, view: View, seat: Seat): string | null {
  const order = showdownOrder(view);
  if (order === null) return null;
  const [firstSeat, secondSeat] = order;
  const first = revealedCharacter(view.players[index(firstSeat)].plan);
  const second = revealedCharacter(view.players[index(secondSeat)].plan);
  if (first === null || second === null) return null;
  return l.t('describe-order', {
    first: firstSeat === seat ? 'you' : 'opponent',
    firstCharacter: first,
    secondCharacter: second,
  });
}

function turnSentence(l: Localiser, view: View, seat: Seat): string {
  const seats = view.pending.seats;
  const mine = seats.includes(seat);
  const theirs = seats.includes(other(seat));
  if (mine && theirs) return l.t('describe-turn-both');
  if (mine) return l.t('describe-turn-you');
  if (theirs) return l.t('describe-turn-opponent');
  return l.t('describe-turn-none');
}

/** A plain-text summary of the table as `seat` sees it, one sentence per line. */
export function describe(view: View, seat: Seat, l: Localiser): string {
  const me = view.players[index(seat)];
  const opponentSeat = other(seat);
  const opponent = view.players[index(opponentSeat)];
  const hand = me.hand ?? [];
  const lines = [
    l.t('describe-round', { round: view.round }),
    turnSentence(l, view, seat),
    hand.length === 0
      ? l.t('describe-hand-empty')
      : plainText(l.cardsMessage('describe-hand', hand)),
    l.t('describe-my-markers', { markers: listText(l, markerLines(l, me, view.badge === seat)) }),
    planSentence(l, 'my', me.plan),
    l.t('describe-opponent-markers', {
      markers: listText(l, markerLines(l, opponent, view.badge === opponentSeat)),
    }),
    l.t('describe-opponent-hand', { n: opponent.hand_size }),
    planSentence(l, 'opponent', opponent.plan),
  ];
  if (view.potion_target !== null) {
    lines.push(l.t('describe-potion-target', { card: view.potion_target.card }));
  }
  const order = orderSentence(l, view, seat);
  if (order !== null) lines.push(order);
  return lines.join('\n');
}
