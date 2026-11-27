import type { EventKind, Seat } from '@wwd/engine';
import type { SequencedEvent } from './showdown.js';

/** The markers a player holds, as the marker rows show them. */
export interface Markers {
  health: number;
  cross: number;
  fang: number;
  hourglass: number;
  potion: boolean;
}

const index = (seat: Seat): 0 | 1 => (seat === 'p0' ? 0 : 1);

/** Takes back what the event `kind` did to `players`' markers. */
function undo(players: [Markers, Markers], kind: EventKind): void {
  if ('marker_gained' in kind) {
    const { seat, marker, from_opponent } = kind.marker_gained;
    const player = players[index(seat)];
    if (marker === 'potion') {
      player.potion = false;
      return;
    }
    player[marker] -= 1;
    if (from_opponent) players[1 - index(seat)]![marker] += 1;
  } else if ('marker_spent' in kind) {
    const { seat, marker, n } = kind.marker_spent;
    const player = players[index(seat)];
    if (marker === 'potion') player.potion = true;
    else player[marker] += n;
  } else if ('attack_hit' in kind) {
    players[index(kind.attack_hit.target_seat)].health += kind.attack_hit.health_lost;
  } else if ('potion_resolved' in kind) {
    players[index(kind.potion_resolved.victim)].health += kind.potion_resolved.health_lost;
  }
}

/**
 * The markers as of the showdown's first `shown` steps: the live `players`, with what the steps
 * from `shown` on gained, spent and lost taken back. Returns `players` itself once every step is
 * shown.
 */
export function shownMarkers(
  players: readonly [Markers, Markers],
  steps: readonly SequencedEvent[][],
  shown: number,
): readonly [Markers, Markers] {
  if (shown >= steps.length) return players;
  const copy = ({ health, cross, fang, hourglass, potion }: Markers): Markers => ({
    health,
    cross,
    fang,
    hourglass,
    potion,
  });
  const result: [Markers, Markers] = [copy(players[0]), copy(players[1])];
  for (const step of steps.slice(Math.max(0, shown))) {
    for (const [, event] of step) undo(result, event.kind);
  }
  return result;
}
