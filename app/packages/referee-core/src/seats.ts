import type { Seat } from '@wwd/engine';

export type SeatIndex = 0 | 1;
export type Pair<T> = [T, T];

export const SEATS: readonly [Seat, Seat] = ['p0', 'p1'];

export function opponentOf(i: SeatIndex): SeatIndex {
  return i === 0 ? 1 : 0;
}
