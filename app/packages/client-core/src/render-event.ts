import { eventId } from '@wwd/engine';
import type { Character, Event, ForfeitReason, Marker, Plan, Seat, TargetCard } from '@wwd/engine';
import type { MessageArgs, Translator } from './i18n.js';

/** A seat as the message files expect it: a raw selector value plus a display name. */
type Who = 'you' | 'opponent' | Seat;

const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');

interface Context {
  tr: Translator;
  perspective: Seat | null;
  list(items: string[]): string;
}

function who(ctx: Context, seat: Seat): Who {
  if (ctx.perspective === null) return seat;
  return seat === ctx.perspective ? 'you' : 'opponent';
}

/** Adds `key` (selector value) and `keyName` (display name) for a seat. */
function seatArgs(ctx: Context, key: string, seat: Seat): MessageArgs {
  return { [key]: who(ctx, seat), [`${key}Name`]: ctx.tr.t(`seat-${seat}`) };
}

function character(ctx: Context, c: Character): string {
  return ctx.tr.t(`character-${c.replaceAll('_', '-')}`);
}

function targetCard(ctx: Context, card: TargetCard): string {
  return card === 'fool' ? ctx.tr.t('target-fool') : character(ctx, card.character);
}

function plan(ctx: Context, p: Plan): string {
  const name = character(ctx, p.character);
  if (p.targets.length === 0) return ctx.tr.t('plan-no-targets', { character: name });
  const targets = ctx.list(p.targets.map((card) => targetCard(ctx, card)));
  return ctx.tr.t('plan-targeting', { character: name, targets });
}

const marker = (ctx: Context, m: Marker): string => ctx.tr.t(`marker-${m}`);
const forfeit = (ctx: Context, r: ForfeitReason): string =>
  ctx.tr.t(`forfeit-${r.replaceAll('_', '-')}`);

/** The Fluent arguments for an event; names match the engine message files. */
function eventArgs(ctx: Context, event: Event): MessageArgs {
  const kind = event.kind;
  if ('game_started' in kind) return { commitment: kind.game_started.seed_commitment };
  if ('round_started' in kind) {
    const { round, badge } = kind.round_started;
    return { round, ...seatArgs(ctx, 'actor', badge) };
  }
  if ('hand_dealt' in kind) {
    const { seat, cards } = kind.hand_dealt;
    return {
      ...seatArgs(ctx, 'actor', seat),
      cards: ctx.list(cards.map((c) => character(ctx, c))),
    };
  }
  if ('plan_submitted' in kind) {
    const { seat, target_count } = kind.plan_submitted;
    return { ...seatArgs(ctx, 'actor', seat), count: target_count };
  }
  if ('hourglasses_placed' in kind) {
    const { seat, n } = kind.hourglasses_placed;
    return { ...seatArgs(ctx, 'actor', seat), n };
  }
  if ('potion_target_chosen' in kind) {
    const { seat, card } = kind.potion_target_chosen;
    return { ...seatArgs(ctx, 'actor', seat), card: character(ctx, card) };
  }
  if ('plans_revealed' in kind) {
    const { plans, effective, order } = kind.plans_revealed;
    // The reader's own plan comes first; with no perspective, seat order is used.
    const actor = ctx.perspective ?? 'p0';
    const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);
    const a = index(actor);
    const o = index(other(actor));
    return {
      ...seatArgs(ctx, 'actor', actor),
      ...seatArgs(ctx, 'other', other(actor)),
      ...seatArgs(ctx, 'first', order[0]),
      actorPlan: plan(ctx, plans[a]),
      actorInitiative: effective[a],
      otherPlan: plan(ctx, plans[o]),
      otherInitiative: effective[o],
    };
  }
  if ('potion_resolved' in kind) {
    const { target, victim, hit, health_lost } = kind.potion_resolved;
    return {
      ...seatArgs(ctx, 'victim', victim),
      result: hit ? 'hit' : 'miss',
      card: character(ctx, target),
      health: health_lost,
    };
  }
  if ('character_resolved' in kind) {
    const { seat, character: c } = kind.character_resolved;
    return { ...seatArgs(ctx, 'actor', seat), character: character(ctx, c) };
  }
  if ('marker_gained' in kind) {
    const { seat, marker: m, from_opponent } = kind.marker_gained;
    return {
      ...seatArgs(ctx, 'actor', seat),
      ...seatArgs(ctx, 'other', other(seat)),
      marker: marker(ctx, m),
      source: from_opponent ? 'opponent' : 'supply',
    };
  }
  if ('marker_spent' in kind) {
    const { seat, marker: m, n } = kind.marker_spent;
    return { ...seatArgs(ctx, 'actor', seat), marker: marker(ctx, m), n };
  }
  if ('attack_hit' in kind) {
    const { seat, target_seat, character: c, health_lost } = kind.attack_hit;
    return {
      ...seatArgs(ctx, 'actor', seat),
      ...seatArgs(ctx, 'targetSeat', target_seat),
      character: character(ctx, c),
      health: health_lost,
    };
  }
  if ('attack_missed' in kind) return seatArgs(ctx, 'actor', kind.attack_missed.seat);
  if ('attack_forfeited' in kind) {
    const { seat, reason } = kind.attack_forfeited;
    return { ...seatArgs(ctx, 'actor', seat), reason: forfeit(ctx, reason) };
  }
  if ('round_ended' in kind) {
    const { round, next_badge } = kind.round_ended;
    return { round, ...seatArgs(ctx, 'actor', next_badge) };
  }
  if ('next_round_requested' in kind) {
    return seatArgs(ctx, 'actor', kind.next_round_requested.seat);
  }
  if ('resigned' in kind) return seatArgs(ctx, 'actor', kind.resigned.seat);
  if ('segment_started' in kind) return { round: kind.segment_started.round };
  const { winner, reason } = kind.game_over;
  return {
    ...seatArgs(ctx, 'actor', winner),
    ...seatArgs(ctx, 'other', other(winner)),
    reason,
  };
}

export function renderEvent(
  tr: Translator,
  list: (items: string[]) => string,
  event: Event,
  perspective: Seat | null,
): string {
  const ctx: Context = { tr, perspective, list };
  return tr.t(eventId(event.kind), eventArgs(ctx, event));
}
