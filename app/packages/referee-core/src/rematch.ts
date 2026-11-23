import type { Phase, RulesConfig, Seat } from '@wwd/engine';

/** No seat has asked for a rematch. */
export const NO_ONE: readonly Seat[] = [];

/** Records that `seat` asked for a rematch, keeping the seats in seat order. */
export function request(ready: readonly Seat[], seat: Seat): readonly Seat[] {
  if (ready.includes(seat)) return ready;
  return (['p0', 'p1'] as const).filter((s) => s === seat || ready.includes(s));
}

/** Forgets that `seat` asked for a rematch. */
export function forget(ready: readonly Seat[], seat: Seat): readonly Seat[] {
  return ready.includes(seat) ? ready.filter((s) => s !== seat) : ready;
}

export function bothReady(ready: readonly Seat[]): boolean {
  return ready.length === 2;
}

/** The seat that lost a finished game, or `null` while the game is not over. */
export function loserOf(phase: Phase): Seat | null {
  if (typeof phase !== 'object' || !('game_over' in phase)) return null;
  return phase.game_over.winner === 'p0' ? 'p1' : 'p0';
}

/** The rules for a rematch: `config` with the Badge starting with the loser. */
export function rematchConfig(config: RulesConfig, loser: Seat): RulesConfig {
  return { ...config, badge_start: { seat: loser } };
}
