import type { Character, WinReason } from '@wwd/engine';
import { CHARACTERS } from '../cards.js';
import type { HistoryRecord } from '../storage/db.js';
import { summarise, type Summary } from './summary.js';

export const WIN_REASONS: readonly WinReason[] = ['health', 'fangs', 'crosses', 'resignation'];

export interface Tally {
  won: number;
  lost: number;
}

export interface PickStats {
  character: Character;
  picked: number;
  succeeded: number;
  /** Null until the character has been picked. */
  rate: number | null;
}

export interface OpponentStats extends Tally {
  /** Null for games recorded without an opponent name. */
  name: string | null;
}

export interface Stats {
  games: number;
  wins: number;
  losses: number;
  byCondition: Record<WinReason, Tally>;
  picks: PickStats[];
  /** Null without any games. */
  averageRounds: number | null;
  opponents: OpponentStats[];
}

function summaryOf(record: HistoryRecord): Summary {
  try {
    return summarise(record);
  } catch {
    // A replay this build cannot play still counts with the result stored beside it.
    return {
      winner: record.winner,
      reason: record.reason,
      rounds: record.rounds,
      picks: [],
      successes: [],
    };
  }
}

/** Totals over `records`; every fact comes from the engine's events or the stored result. */
export function stats(records: readonly HistoryRecord[]): Stats {
  const byCondition = Object.fromEntries(
    WIN_REASONS.map((reason) => [reason, { won: 0, lost: 0 }]),
  ) as Record<WinReason, Tally>;
  const picked = new Map<Character, number>();
  const succeeded = new Map<Character, number>();
  const opponents = new Map<string | null, Tally>();
  let wins = 0;
  let rounds = 0;

  for (const record of records) {
    const summary = summaryOf(record);
    const won = summary.winner === record.seat;
    const key = won ? 'won' : 'lost';
    byCondition[summary.reason][key] += 1;
    const opponent = opponents.get(record.opponentName ?? null) ?? { won: 0, lost: 0 };
    opponent[key] += 1;
    opponents.set(record.opponentName ?? null, opponent);
    if (won) wins += 1;
    rounds += summary.rounds;
    for (const c of summary.picks) picked.set(c, (picked.get(c) ?? 0) + 1);
    for (const c of summary.successes) succeeded.set(c, (succeeded.get(c) ?? 0) + 1);
  }

  return {
    games: records.length,
    wins,
    losses: records.length - wins,
    byCondition,
    picks: CHARACTERS.map((character) => {
      const n = picked.get(character) ?? 0;
      const ok = succeeded.get(character) ?? 0;
      return { character, picked: n, succeeded: ok, rate: n === 0 ? null : ok / n };
    }),
    averageRounds: records.length === 0 ? null : rounds / records.length,
    opponents: [...opponents]
      .map(([name, tally]) => ({ name, ...tally }))
      .sort(
        (a, b) => b.won + b.lost - (a.won + a.lost) || (a.name ?? '').localeCompare(b.name ?? ''),
      ),
  };
}
