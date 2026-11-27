import { describe, expect, it } from 'vitest';
import type { Command, EventKind, Seat } from '@wwd/engine';
import { shownBadge, shownMarkers, type Markers } from '../../src/table/shown-markers.js';
import { showdownSteps, type SequencedEvent } from '../../src/table/showdown.js';
import { newGame, playUntil } from '../games.js';

const markers = (extra: Partial<Markers> = {}): Markers => ({
  health: 2,
  cross: 0,
  fang: 0,
  hourglass: 0,
  potion: false,
  ...extra,
});

let seq = 0;
const event = (kind: EventKind): SequencedEvent => [seq++, { visibility: 'public', kind }];
const resolved = (seat: Seat): SequencedEvent =>
  event({ character_resolved: { seat, character: 'knight' } });

/**
 * A showdown after which p0 has gained an Hourglass taken from p1 and a Cross, and p1 has paid a
 * Fang and hit p0 for one Health, in three steps.
 */
function showdown(): { players: [Markers, Markers]; steps: SequencedEvent[][] } {
  const steps = [
    [
      resolved('p0'),
      event({ marker_gained: { seat: 'p0', marker: 'hourglass', from_opponent: true } }),
      event({ marker_gained: { seat: 'p0', marker: 'cross', from_opponent: false } }),
    ],
    [
      resolved('p1'),
      event({ marker_spent: { seat: 'p1', marker: 'fang', n: 1 } }),
      event({
        attack_hit: {
          seat: 'p1',
          target_seat: 'p0',
          attacker: 'wolf_king',
          character: 'knight',
          health_lost: 1,
        },
      }),
    ],
    [event({ round_ended: { round: 1, next_badge: 'p1' } })],
  ];
  const players: [Markers, Markers] = [
    markers({ health: 1, hourglass: 3, cross: 1 }),
    markers({ hourglass: 0, fang: 1 }),
  ];
  return { players, steps };
}

describe('shownMarkers', () => {
  it('step 0 undoes every gain and loss of the showdown', () => {
    const { players, steps } = showdown();
    expect(shownMarkers(players, steps, 0)).toEqual([
      markers({ health: 2, hourglass: 2, cross: 0 }),
      markers({ hourglass: 1, fang: 2 }),
    ]);
  });

  it('each step applies only its own events', () => {
    const { players, steps } = showdown();
    expect(shownMarkers(players, steps, 1)).toEqual([
      markers({ health: 2, hourglass: 3, cross: 1 }),
      markers({ hourglass: 0, fang: 2 }),
    ]);
    expect(shownMarkers(players, steps, 2)).toEqual(players);
  });

  it('all steps shown equals the live counts', () => {
    const { players, steps } = showdown();
    expect(shownMarkers(players, steps, 3)).toBe(players);
    expect(shownMarkers(players, [], 0)).toBe(players);
  });

  it('a Potion lost to a hit gives the Health back until its step', () => {
    const players: [Markers, Markers] = [markers(), markers({ health: 1 })];
    const steps = [
      [event({ potion_resolved: { target: 'seer', victim: 'p1', hit: true, health_lost: 1 } })],
    ];
    expect(shownMarkers(players, steps, 0)[1].health).toBe(2);
    expect(shownMarkers(players, steps, 1)[1].health).toBe(1);
  });

  it("a Potion gained by the Witch appears only at the Witch's step", () => {
    const isWitchPlan = (cmd: Command): boolean =>
      typeof cmd === 'object' &&
      'submit_plan' in cmd &&
      cmd.submit_plan.character === 'witch' &&
      cmd.submit_plan.targets.length > 0;
    const game = newGame(1);
    playUntil(
      game,
      () => game.pending().kind === 'next_round',
      (legal) => legal.find(isWitchPlan) ?? legal.find((c) => c !== 'resign'),
    );
    const view = game.view({ seat: 'p0' });
    const steps = showdownSteps(game.eventsSince(0, { seat: 'p0' }));
    const witchStep = steps.findIndex((step) =>
      step.some(([, e]) => 'marker_gained' in e.kind && e.kind.marker_gained.marker === 'potion'),
    );
    expect(witchStep).toBeGreaterThan(0);
    const holder = view.players.findIndex((p) => p.potion);
    expect(holder).toBeGreaterThanOrEqual(0);
    for (let shown = 0; shown <= steps.length; shown++) {
      expect(shownMarkers(view.players, steps, shown)[holder]!.potion, `step ${shown}`).toBe(
        shown > witchStep,
      );
    }
  });
});

describe('shownBadge', () => {
  it('holds the Badge back until the step that ends the round is shown', () => {
    const { steps } = showdown();
    // The round ended with the Badge passing from p0 to p1, as the view now has it.
    expect(shownBadge('p1', steps, 0)).toBe('p0');
    expect(shownBadge('p1', steps, 2)).toBe('p0');
    expect(shownBadge('p1', steps, 3)).toBe('p1');
    expect(shownBadge('p1', steps.slice(0, 2), 0)).toBe('p1');
    expect(shownBadge(null, [], 0)).toBeNull();
  });
});
