import type { Event, EventKind } from '@wwd/engine';

export type SequencedEvent = [number, Event];

/** Events that open a new step of the showdown list. */
const opensStep = (kind: EventKind): boolean =>
  'potion_resolved' in kind ||
  'character_resolved' in kind ||
  'round_ended' in kind ||
  'game_over' in kind;

/** Events that report what a step did rather than anybody's choice. */
const isResult = (kind: EventKind): boolean =>
  opensStep(kind) ||
  'marker_gained' in kind ||
  'marker_spent' in kind ||
  'attack_hit' in kind ||
  'attack_missed' in kind ||
  'attack_forfeited' in kind ||
  'discard_revealed' in kind;

/**
 * The results of the current round's showdown, in the order the engine reported them, grouped
 * into steps: the Potion, each character that resolves, and the end of the round or game. Empty
 * until this round's plans are revealed, or when the reveal is not among the held events.
 */
export function showdownSteps(events: readonly SequencedEvent[]): SequencedEvent[][] {
  let start = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    const kind = events[i]![1].kind;
    if ('plans_revealed' in kind) {
      start = i + 1;
      break;
    }
    if ('round_started' in kind || 'segment_started' in kind) return [];
  }
  if (start < 0) return [];

  const steps: SequencedEvent[][] = [];
  for (const entry of events.slice(start)) {
    const kind = entry[1].kind;
    if (!isResult(kind)) continue;
    const current = steps.at(-1);
    if (current === undefined || opensStep(kind)) steps.push([entry]);
    else current.push(entry);
  }
  return steps;
}

export type Reveal = Extract<EventKind, { plans_revealed: unknown }>['plans_revealed'];

/** This round's revealed plans, once held: both plans, effective initiatives and the order. */
export function roundReveal(events: readonly SequencedEvent[]): Reveal | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const kind = events[i]![1].kind;
    if ('plans_revealed' in kind) return kind.plans_revealed;
    if ('round_started' in kind || 'segment_started' in kind) return null;
  }
  return null;
}
