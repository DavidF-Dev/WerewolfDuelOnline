import { eventId } from '@wwd/engine';
import type { Character, Event, ForfeitReason, Plan, Seat, TargetCard } from '@wwd/engine';
import type { MessageArgs, Translator } from './i18n.js';
import {
  plainText,
  richMessage,
  type MarkerId,
  type RichKinds,
  type RichPart,
} from './rich-text.js';

/** A list of items split as `Intl.ListFormat.formatToParts` splits it. */
export type ListParts = (items: string[]) => Array<{ type: 'element' | 'literal'; value: string }>;

/** A seat as the message files expect it: a raw selector value plus a display name. */
type Who = 'you' | 'opponent' | Seat;

const other = (seat: Seat): Seat => (seat === 'p0' ? 'p1' : 'p0');

interface Context {
  tr: Translator;
  perspective: Seat | null;
  list: ListParts;
}

/** A message's arguments, with what each emphasised one names. */
interface Message {
  args: MessageArgs;
  kinds: RichKinds;
}

function who(ctx: Context, seat: Seat): Who {
  if (ctx.perspective === null) return seat;
  return seat === ctx.perspective ? 'you' : 'opponent';
}

/** Adds `key` (selector value) and `keyName` (display name) for a seat. */
function seatArgs(ctx: Context, key: string, seat: Seat): Message {
  return {
    args: { [key]: who(ctx, seat), [`${key}Name`]: ctx.tr.t(`seat-${seat}`) },
    kinds: { [`${key}Name`]: 'player' },
  };
}

function character(ctx: Context, c: Character): string {
  return ctx.tr.t(`character-${c.replaceAll('_', '-')}`);
}

/** A character's name as rich text. */
function named(ctx: Context, c: Character): RichPart[] {
  return [{ character: character(ctx, c) }];
}

/** Items joined as a list, each keeping its own parts. */
function list(ctx: Context, items: RichPart[][]): RichPart[] {
  let next = 0;
  return ctx
    .list(items.map(plainText))
    .flatMap((part) => (part.type === 'element' ? (items[next++] ?? []) : [{ text: part.value }]));
}

function targetCard(ctx: Context, card: TargetCard): RichPart[] {
  if (card === 'fool') return [{ text: ctx.tr.t('target-fool') }];
  const name = character(ctx, card.character);
  return richMessage(ctx.tr, 'target-character', { character: name }, { character: 'character' });
}

function plan(ctx: Context, p: Plan): RichPart[] {
  const name = character(ctx, p.character);
  if (p.targets.length === 0) {
    return richMessage(ctx.tr, 'plan-no-targets', { character: name }, { character: 'character' });
  }
  const targets = list(
    ctx,
    p.targets.map((card) => targetCard(ctx, card)),
  );
  return richMessage(
    ctx.tr,
    'plan-targeting',
    { character: name, targets: plainText(targets) },
    { character: 'character', targets: { parts: targets } },
  );
}

/** An argument that is itself rich text. */
const partsArg = (key: string, parts: RichPart[]): Message => ({
  args: { [key]: plainText(parts) },
  kinds: { [key]: { parts } },
});

/** A marker's name, or its name after a count of `n` of them. */
function marker(ctx: Context, m: MarkerId, n?: number): string {
  if (n === undefined || m === 'potion' || m === 'health' || m === 'badge') {
    return ctx.tr.t(`marker-${m}`);
  }
  return ctx.tr.t(`marker-${m}-count`, { n });
}

/** Why an attack was not made, with its marker names marked. */
function forfeit(ctx: Context, r: ForfeitReason): RichPart[] {
  const { args, kinds } = join(
    markerArg(ctx, 'cross', 'cross'),
    plainMarkerArg(ctx, 'fangs', 'fang', 'marker-fangs'),
  );
  return richMessage(ctx.tr, `forfeit-${r.replaceAll('_', '-')}`, args, kinds);
}

/** Joins messages, keeping every argument and its kind. */
function join(...parts: Message[]): Message {
  return {
    args: Object.assign({}, ...parts.map((p) => p.args)) as MessageArgs,
    kinds: Object.assign({}, ...parts.map((p) => p.kinds)) as RichKinds,
  };
}

const plainArgs = (args: MessageArgs): Message => ({ args, kinds: {} });
const characterArg = (ctx: Context, key: string, c: Character): Message => ({
  args: { [key]: character(ctx, c) },
  kinds: { [key]: 'character' },
});
/** A marker argument whose words come from message `id`. */
const plainMarkerArg = (ctx: Context, key: string, m: MarkerId, id: string): Message => ({
  args: { [key]: ctx.tr.t(id) },
  kinds: { [key]: { marker: m } },
});
const markerArg = (ctx: Context, key: string, m: MarkerId, n?: number): Message => ({
  args: { [key]: marker(ctx, m, n) },
  kinds: { [key]: { marker: m } },
});

const PLAYER_WORDS = {
  youCap: 'player-you-cap',
  you: 'player-you',
  yourCap: 'player-your-cap',
  your: 'player-your',
  opponentCap: 'player-opponent-cap',
  opponent: 'player-opponent',
} as const;

/** The words that stand for a player from a seat's perspective, emphasised as player names. */
function playerWords(ctx: Context): Message {
  if (ctx.perspective === null) return plainArgs({});
  const entries = Object.entries(PLAYER_WORDS);
  return {
    args: Object.fromEntries(entries.map(([key, id]) => [key, ctx.tr.t(id)])),
    kinds: Object.fromEntries(entries.map(([key]) => [key, 'player'])),
  };
}

/** The Fluent arguments for an event, and their kinds; names match the engine message files. */
function eventMessage(ctx: Context, event: Event): Message {
  const kind = event.kind;
  if ('game_started' in kind) return plainArgs({ commitment: kind.game_started.seed_commitment });
  if ('round_started' in kind) {
    const { round, badge } = kind.round_started;
    return join(
      plainArgs({ round }),
      seatArgs(ctx, 'actor', badge),
      markerArg(ctx, 'badge', 'badge'),
    );
  }
  if ('hand_dealt' in kind) {
    const { seat, cards } = kind.hand_dealt;
    return join(
      seatArgs(ctx, 'actor', seat),
      partsArg(
        'cards',
        list(
          ctx,
          cards.map((c) => named(ctx, c)),
        ),
      ),
    );
  }
  if ('plan_submitted' in kind) {
    const { seat, target_count } = kind.plan_submitted;
    return join(seatArgs(ctx, 'actor', seat), plainArgs({ count: target_count }));
  }
  if ('hourglasses_placed' in kind) {
    const { seat, n } = kind.hourglasses_placed;
    return join(
      seatArgs(ctx, 'actor', seat),
      plainArgs({ n }),
      markerArg(ctx, 'hourglasses', 'hourglass', n),
    );
  }
  if ('potion_target_chosen' in kind) {
    const { seat, card } = kind.potion_target_chosen;
    return join(
      seatArgs(ctx, 'actor', seat),
      markerArg(ctx, 'potion', 'potion'),
      characterArg(ctx, 'card', card),
    );
  }
  if ('plans_revealed' in kind) {
    const { plans, effective, order } = kind.plans_revealed;
    // The reader's own plan comes first; with no perspective, seat order is used.
    const actor = ctx.perspective ?? 'p0';
    const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);
    const a = index(actor);
    const o = index(other(actor));
    return join(
      seatArgs(ctx, 'actor', actor),
      seatArgs(ctx, 'other', other(actor)),
      seatArgs(ctx, 'first', order[0]),
      partsArg('actorPlan', plan(ctx, plans[a])),
      partsArg('otherPlan', plan(ctx, plans[o])),
      plainArgs({ actorInitiative: effective[a], otherInitiative: effective[o] }),
    );
  }
  if ('potion_resolved' in kind) {
    const { target, victim, hit, health_lost } = kind.potion_resolved;
    return join(
      seatArgs(ctx, 'victim', victim),
      plainArgs({ result: hit ? 'hit' : 'miss', lost: health_lost }),
      markerArg(ctx, 'potion', 'potion'),
      characterArg(ctx, 'card', target),
      markerArg(ctx, 'health', 'health'),
    );
  }
  if ('character_resolved' in kind) {
    const { seat, character: c } = kind.character_resolved;
    return join(seatArgs(ctx, 'actor', seat), characterArg(ctx, 'character', c));
  }
  if ('marker_gained' in kind) {
    const { seat, marker: m, from_opponent } = kind.marker_gained;
    return join(
      seatArgs(ctx, 'actor', seat),
      seatArgs(ctx, 'other', other(seat)),
      plainArgs({ markerId: m, source: from_opponent ? 'opponent' : 'supply' }),
      markerArg(ctx, 'marker', m),
    );
  }
  if ('marker_spent' in kind) {
    const { seat, marker: m, n } = kind.marker_spent;
    return join(seatArgs(ctx, 'actor', seat), plainArgs({ n }), markerArg(ctx, 'marker', m, n));
  }
  if ('attack_hit' in kind) {
    const { seat, target_seat, attacker, character: c, health_lost } = kind.attack_hit;
    return join(
      seatArgs(ctx, 'actor', seat),
      seatArgs(ctx, 'targetSeat', target_seat),
      characterArg(ctx, 'attacker', attacker),
      characterArg(ctx, 'character', c),
      plainArgs({ lost: health_lost }),
      markerArg(ctx, 'health', 'health'),
    );
  }
  if ('attack_missed' in kind) {
    const { seat, attacker } = kind.attack_missed;
    return join(seatArgs(ctx, 'actor', seat), characterArg(ctx, 'attacker', attacker));
  }
  if ('attack_forfeited' in kind) {
    const { seat, reason } = kind.attack_forfeited;
    return join(seatArgs(ctx, 'actor', seat), partsArg('reason', forfeit(ctx, reason)));
  }
  if ('round_ended' in kind) {
    const { round, next_badge } = kind.round_ended;
    return join(
      plainArgs({ round }),
      seatArgs(ctx, 'actor', next_badge),
      markerArg(ctx, 'badge', 'badge'),
    );
  }
  if ('discard_revealed' in kind) {
    const { round, character: c } = kind.discard_revealed;
    return join(plainArgs({ round }), characterArg(ctx, 'character', c));
  }
  if ('next_round_requested' in kind) {
    return seatArgs(ctx, 'actor', kind.next_round_requested.seat);
  }
  if ('resigned' in kind) return seatArgs(ctx, 'actor', kind.resigned.seat);
  if ('segment_started' in kind) return plainArgs({ round: kind.segment_started.round });
  const { winner, reason } = kind.game_over;
  return join(
    seatArgs(ctx, 'actor', winner),
    seatArgs(ctx, 'other', other(winner)),
    plainArgs({ reason }),
    markerArg(ctx, 'health', 'health'),
    plainMarkerArg(ctx, 'fangs', 'fang', 'marker-fangs'),
    plainMarkerArg(ctx, 'crosses', 'cross', 'marker-crosses'),
  );
}

export function renderEvent(
  tr: Translator,
  list: ListParts,
  event: Event,
  perspective: Seat | null,
): string {
  const ctx = { tr, perspective, list };
  const { args } = join(eventMessage(ctx, event), playerWords(ctx));
  return tr.t(eventId(event.kind), args);
}

/** The event's sentence split into plain text, bold player and character names, and markers. */
export function richEvent(
  tr: Translator,
  list: ListParts,
  event: Event,
  perspective: Seat | null,
): RichPart[] {
  const ctx = { tr, perspective, list };
  const { args, kinds } = join(eventMessage(ctx, event), playerWords(ctx));
  return richMessage(tr, eventId(event.kind), args, kinds);
}
