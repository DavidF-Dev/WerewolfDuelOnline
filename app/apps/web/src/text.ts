import type {
  Character,
  Command,
  Event,
  PendingKind,
  Plan,
  PlanView,
  PlayerView,
  Seat,
  TargetCard,
} from '@wwd/engine';
import {
  plainText,
  richMessage,
  type ClientStatus,
  type GameClientState,
  type Localiser,
  type RichKinds,
  type RichPart,
  type StopReason,
} from '@wwd/client-core';
import { faction, initiative } from './cards.js';

const list = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export const characterName = (l: Localiser, c: Character): string =>
  l.t(`character-${c.replaceAll('_', '-')}`);

/** A character card's full accessible name, e.g. "Knight, initiative 3, Human". */
export const cardName = (l: Localiser, c: Character): string =>
  l.t('card-character', {
    name: characterName(l, c),
    initiative: initiative(c),
    faction: l.t(`faction-${faction(c)}`),
  });

/** A card button's accessible name, e.g. "3, Knight, Human. Gain an Hourglass, …". */
export const characterLabel = (l: Localiser, c: Character, shownInitiative: number): string =>
  l.t('card-name', {
    name: characterName(l, c),
    initiative: shownInitiative,
    faction: l.t(`faction-${faction(c)}`),
    ability: abilityText(l, { character: c }),
  });

const TEXT_MARKERS = ['cross', 'fang', 'hourglass', 'potion'] as const;
const TEXT_MARKER_KINDS: RichKinds = Object.fromEntries(
  TEXT_MARKERS.map((marker) => [marker, { marker }]),
);

const cardId = (card: TargetCard): string =>
  card === 'fool' ? 'fool' : card.character.replaceAll('_', '-');

const markerArgs = (l: Localiser): Record<string, string> =>
  Object.fromEntries(TEXT_MARKERS.map((marker) => [marker, l.t(`marker-${marker}`)]));

/** The ability text drawn on a card, with each marker it names marked out. */
export const cardText = (l: Localiser, card: TargetCard): RichPart[] =>
  richMessage(l, `card-text-${cardId(card)}`, markerArgs(l), TEXT_MARKER_KINDS);

/** A card's full ability, as it is read out with the card, e.g. "Gain an Hourglass, then …". */
export const abilityText = (l: Localiser, card: TargetCard): string =>
  l.t(`card-ability-${cardId(card)}`, markerArgs(l));

/** A card's full ability with each marker it names marked out. */
export const abilityParts = (l: Localiser, card: TargetCard): RichPart[] =>
  richMessage(l, `card-ability-${cardId(card)}`, markerArgs(l), TEXT_MARKER_KINDS);

export const targetName = (l: Localiser, card: TargetCard): string =>
  card === 'fool' ? l.t('card-fool') : cardName(l, card.character);

export function planText(l: Localiser, plan: Plan): string {
  const character = characterName(l, plan.character);
  if (plan.targets.length === 0) return l.t('plan-no-targets', { character });
  const targets = plan.targets.map((card) =>
    card === 'fool'
      ? l.t('target-fool')
      : l.t('target-character', { character: characterName(l, card.character) }),
  );
  return l.t('plan-targeting', { character, targets: list.format(targets) });
}

/** A plan as short rich text, such as "**Knight** → **Wolfen** + **Fool**". */
export function planSummaryParts(l: Localiser, plan: Plan): RichPart[] {
  const character = characterName(l, plan.character);
  if (plan.targets.length === 0) {
    return richMessage(l, 'plan-summary-short-none', { character }, { character: 'character' });
  }
  const names: RichPart[] = plan.targets.flatMap((card, i) => {
    const name: RichPart = {
      character: card === 'fool' ? l.t('plan-summary-fool') : characterName(l, card.character),
    };
    return i === 0 ? [name] : [{ text: ' + ' }, name];
  });
  return richMessage(
    l,
    'plan-summary-short',
    { character, targets: plainText(names) },
    { character: 'character', targets: { parts: names } },
  );
}

export function planStatus(l: Localiser, plan: PlanView): string {
  if (plan === 'none') return l.t('plan-status-none');
  if ('hidden' in plan) return l.t('plan-status-hidden', { count: plan.hidden.target_count });
  return l.t('plan-status-revealed', { plan: planText(l, plan.revealed) });
}

export function commandLabel(l: Localiser, cmd: Command): string {
  if (cmd === 'next_round') return l.t('command-next-round');
  if (cmd === 'resign') return l.t('cli-resign');
  if ('submit_plan' in cmd)
    return l.t('command-submit-plan', { plan: planText(l, cmd.submit_plan) });
  if ('place_hourglasses' in cmd) {
    return l.t('command-place-hourglasses', { n: cmd.place_hourglasses.n });
  }
  if ('choose_potion_target' in cmd) {
    return l.t('command-choose-potion-target', {
      card: characterName(l, cmd.choose_potion_target.card),
    });
  }
  return l.t(
    cmd.hunter_spend_cross.spend
      ? 'command-hunter-spend-cross-yes'
      : 'command-hunter-spend-cross-no',
  );
}

/** One line of the visible game log; the game start is shown without its seed commitment. */
export const logLine = (l: Localiser, event: Event, seat: Seat | null): string =>
  'game_started' in event.kind ? l.t('log-game-started') : l.renderEvent(event, seat);

/** `logLine` with player and character names and markers marked out. */
export const logParts = (l: Localiser, event: Event, seat: Seat | null): RichPart[] =>
  'game_started' in event.kind ? [{ text: l.t('log-game-started') }] : l.richEvent(event, seat);

export const statusText = (l: Localiser, status: ClientStatus): string =>
  l.t(`status-${status.replaceAll('_', '-')}`);

const REJECTION_IDS: Readonly<Record<string, string>> = {
  unknown_room: 'rejected-unknown-room',
  room_full: 'rejected-room-full',
  protocol_version: 'rejected-protocol-version',
  superseded: 'rejected-superseded',
  wrong_pin: 'rejected-wrong-pin',
  pin_locked: 'rejected-pin-locked',
};

/** Why the referee refused this client; `online` words a refusal it cannot name for a game server. */
export function rejectionText(l: Localiser, code: string | null, online = false): string {
  const id = code === null ? undefined : REJECTION_IDS[code];
  return l.t(id ?? (online ? 'rejected-other-online' : 'rejected-other'));
}

const INSTRUCTIONS: Readonly<Record<PendingKind, string>> = {
  plan: 'phase-plan',
  place_hourglasses: 'phase-reveal-hourglass',
  choose_potion_target: 'phase-reveal-potion',
  hunter_choice: 'phase-hunter-choice',
  next_round: 'phase-round-over',
  none: 'phase-none',
};

/** Whether the game was won in a showdown: every win but a resignation is decided in one. */
function endedInShowdown(state: GameClientState): boolean {
  const phase = state.view?.phase;
  return (
    typeof phase === 'object' && 'game_over' in phase && phase.game_over.reason !== 'resignation'
  );
}

/** The one-line instruction for what this seat should do now. */
export function instructionText(l: Localiser, state: GameClientState): string {
  if (state.status === 'game_over' && endedInShowdown(state)) return l.t('phase-final-showdown');
  if (state.status !== 'playing') return statusText(l, state.status);
  if (state.legal.length === 0) return l.t('phase-waiting');
  return l.t(INSTRUCTIONS[state.pending?.kind ?? 'none']);
}

/** Each marker line shown for a player, in display order. */
export function markerLines(l: Localiser, player: PlayerView, hasBadge: boolean): string[] {
  return [
    l.t('count-health', { n: player.health }),
    l.t('count-cross', { n: player.cross }),
    l.t('count-fang', { n: player.fang }),
    l.t('count-hourglass', { n: player.hourglass }),
    ...(player.placed > 0 ? [l.t('count-placed', { n: player.placed })] : []),
    ...(player.potion ? [l.t('holds-potion')] : []),
    ...(hasBadge ? [l.t('holds-badge')] : []),
  ];
}

export const listText = (items: string[]): string => list.format(items);

/** Describes a problem code: an engine message id, a protocol code, or a local message id. */
export function problemText(l: Localiser, code: string, online = false): string {
  if (code.startsWith('error-') || code.startsWith('problem-')) return l.t(code);
  if (code === 'rate_limited') return l.t('problem-rate-limited');
  return l.t(online ? 'problem-other-online' : 'problem-other');
}

/** Why an online connection stopped, or null when there is nothing to explain. */
export function stopReasonText(
  l: Localiser,
  reason: StopReason | null,
  lastError: string | null,
): string | null {
  if (reason === null) return null;
  if (reason === 'rejected') return rejectionText(l, lastError, true);
  return l.t(`stop-${reason.replaceAll('_', '-')}`);
}
