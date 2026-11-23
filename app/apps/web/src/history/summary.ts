import { replayTimeline, type Character, type Seat, type WinReason } from '@wwd/engine';
import type { HistoryRecord } from '../storage/db.js';

export interface Summary {
  winner: Seat;
  reason: WinReason;
  rounds: number;
  /** The characters the record's seat revealed, one per round that reached its reveal. */
  picks: Character[];
  /** The picks whose character then gained a marker or hit with an attack, from the emitted events. */
  successes: Character[];
}

/** Reads a finished game's result and the record seat's picks from the engine's own events. */
export function summarise(record: HistoryRecord): Summary {
  const events = replayTimeline(record.replay, 'omniscient').flatMap((step) => step.events);
  const own = record.seat === 'p0' ? 0 : 1;
  const picks: Character[] = [];
  const successes: Character[] = [];
  let winner = record.winner;
  let reason = record.reason;
  let rounds = 0;
  // The own character now resolving, and whether it has had an effect yet.
  let resolving: { character: Character; landed: boolean } | null = null;

  const close = (): void => {
    if (resolving?.landed) successes.push(resolving.character);
    resolving = null;
  };

  for (const { kind } of events) {
    if ('round_started' in kind) {
      close();
      rounds = Math.max(rounds, kind.round_started.round);
    } else if ('plans_revealed' in kind) {
      picks.push(kind.plans_revealed.plans[own].character);
    } else if ('character_resolved' in kind) {
      close();
      if (kind.character_resolved.seat === record.seat) {
        resolving = { character: kind.character_resolved.character, landed: false };
      }
    } else if ('attack_hit' in kind) {
      if (resolving !== null && kind.attack_hit.seat === record.seat) resolving.landed = true;
    } else if ('marker_gained' in kind) {
      if (resolving !== null && kind.marker_gained.seat === record.seat) resolving.landed = true;
    } else if ('round_ended' in kind) {
      close();
    } else if ('game_over' in kind) {
      close();
      winner = kind.game_over.winner;
      reason = kind.game_over.reason;
    }
  }
  close();
  return { winner, reason, rounds: rounds === 0 ? record.rounds : rounds, picks, successes };
}
