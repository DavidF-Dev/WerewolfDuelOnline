import { eventId } from '@wwd/engine';
import type { Character, Event, ForfeitReason, Plan, Seat, TargetCard } from '@wwd/engine';
import { characterParts, GrammarError, listForm, type CharacterForm } from './grammar.js';
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

/** Items joined as a list, each keeping its own parts. */
function list(listParts: ListParts, items: ReadonlyArray<readonly RichPart[]>): RichPart[] {
  let next = 0;
  return listParts(items.map(plainText)).flatMap((part) =>
    part.type === 'element' ? (items[next++] ?? []) : [{ text: part.value }],
  );
}

/** The parts of message `id`, or the id alone when a character in it cannot be named. */
function orId(id: string, parts: () => RichPart[]): RichPart[] {
  try {
    return parts();
  } catch (error) {
    if (error instanceof GrammarError) return [{ text: id }];
    throw error;
  }
}

/**
 * Message `id` with `cards` as its `cards` list, each in the form that message declares, or the
 * id alone when a card cannot be named.
 */
export function cardsMessage(
  tr: Translator,
  listParts: ListParts,
  id: string,
  cards: readonly Character[],
  args: MessageArgs = {},
): RichPart[] {
  return orId(id, () => {
    const names = characterList(tr, listParts, id, cards);
    return richMessage(tr, id, { ...args, cards: plainText(names) }, { cards: { parts: names } });
  });
}

/** `cards` as the list argument of message `id`, each in the form that message declares. */
function characterList(
  tr: Translator,
  listParts: ListParts,
  id: string,
  cards: readonly Character[],
): RichPart[] {
  const form = listForm(tr, id);
  return list(
    listParts,
    cards.map((c) => characterParts(tr, c, form)),
  );
}

function targetCard(tr: Translator, card: TargetCard, form: CharacterForm): RichPart[] {
  if (card === 'fool') return richMessage(tr, 'target-fool', { ...form });
  const name = characterParts(tr, card.character, form);
  return richMessage(
    tr,
    'target-character',
    { character: plainText(name) },
    { character: { parts: name } },
  );
}

/**
 * A plan as the messages word it, with its character and target names marked out, or the plan
 * message's id when a target cannot be named.
 */
export function planParts(tr: Translator, listParts: ListParts, p: Plan): RichPart[] {
  if (p.targets.length === 0) {
    return richMessage(
      tr,
      'plan-no-targets',
      { character: p.character },
      { character: 'character' },
    );
  }
  return orId('plan-targeting', () => planTargeting(tr, listParts, p));
}

function planTargeting(tr: Translator, listParts: ListParts, p: Plan): RichPart[] {
  const form = listForm(tr, 'plan-targeting');
  const targets = list(
    listParts,
    p.targets.map((card) => targetCard(tr, card, form)),
  );
  return richMessage(
    tr,
    'plan-targeting',
    { character: p.character, targets: plainText(targets) },
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
const characterArg = (key: string, c: Character): Message => ({
  args: { [key]: c },
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
  youDat: 'player-you-dat',
  yourAccMasculine: 'player-your-acc-masculine',
  yourAccFeminine: 'player-your-acc-feminine',
  opponentDat: 'player-opponent-dat',
  opponentGen: 'player-opponent-gen',
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
      partsArg('cards', characterList(ctx.tr, ctx.list, eventId(kind), cards)),
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
      characterArg('card', card),
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
      partsArg('actorPlan', planParts(ctx.tr, ctx.list, plans[a])),
      partsArg('otherPlan', planParts(ctx.tr, ctx.list, plans[o])),
      plainArgs({ actorInitiative: effective[a], otherInitiative: effective[o] }),
    );
  }
  if ('potion_resolved' in kind) {
    const { target, victim, hit, health_lost } = kind.potion_resolved;
    return join(
      seatArgs(ctx, 'victim', victim),
      plainArgs({ result: hit ? 'hit' : 'miss', lost: health_lost }),
      markerArg(ctx, 'potion', 'potion'),
      characterArg('card', target),
      markerArg(ctx, 'health', 'health'),
    );
  }
  if ('character_resolved' in kind) {
    const { seat, character: c } = kind.character_resolved;
    return join(seatArgs(ctx, 'actor', seat), characterArg('character', c));
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
      characterArg('attacker', attacker),
      characterArg('character', c),
      plainArgs({ lost: health_lost }),
      markerArg(ctx, 'health', 'health'),
    );
  }
  if ('attack_missed' in kind) {
    const { seat, attacker } = kind.attack_missed;
    return join(seatArgs(ctx, 'actor', seat), characterArg('attacker', attacker));
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
    return join(plainArgs({ round }), characterArg('character', c));
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
  const id = eventId(event.kind);
  return plainText(
    orId(id, () => {
      const { args } = join(eventMessage(ctx, event), playerWords(ctx));
      return [{ text: tr.t(id, args) }];
    }),
  );
}

/** The event's sentence split into plain text, bold player and character names, and markers. */
export function richEvent(
  tr: Translator,
  list: ListParts,
  event: Event,
  perspective: Seat | null,
): RichPart[] {
  const ctx = { tr, perspective, list };
  const id = eventId(event.kind);
  return orId(id, () => {
    const { args, kinds } = join(eventMessage(ctx, event), playerWords(ctx));
    return richMessage(tr, id, args, kinds);
  });
}
