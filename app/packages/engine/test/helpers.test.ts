import { beforeAll, describe, expect, it } from 'vitest';
import {
  EngineError,
  Game,
  abilitySummary,
  contentHash,
  verifyReplay,
  defaultRulesConfig,
  effectiveInitiative,
  replayTimeline,
  showdownOrder,
  validatePlan,
} from '../src/index.js';
import { readFileSync } from 'node:fs';
import type { Replay } from '../src/index.js';
import { loadEngineForNode } from '../src/test-support.js';

const SEED = '01'.repeat(32);
const NEW_SEED = '02'.repeat(32);

beforeAll(loadEngineForNode);

/** A game played with the first legal actions until round 1 ends. */
function atRoundOver(): Game {
  const game = Game.create(SEED, { ...defaultRulesConfig(), badge_start: { seat: 'p0' } });
  while (game.roundBoundary() === null) {
    const seat = game.pending().seats[0];
    if (seat === undefined) throw new Error('no pending seat');
    const cmd = game.legalActions(seat)[0];
    if (cmd === undefined) throw new Error('no legal action');
    game.apply(seat, cmd);
  }
  return game;
}

function idOf(call: () => unknown): string {
  try {
    call();
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(EngineError);
    return (thrown as EngineError).id;
  }
  throw new Error('expected an EngineError');
}

describe('UI helpers', () => {
  it('validatePlan returns null or an error id', () => {
    const config = defaultRulesConfig();
    expect(validatePlan({ character: 'seer', targets: ['fool'] }, config)).toBeNull();
    expect(validatePlan({ character: 'witch', targets: [] }, config)).toBe('error-too-few-targets');
    expect(validatePlan({ character: 'hunter', targets: [{ character: 'seer' }] }, config)).toBe(
      'error-target-not-allowed',
    );
  });

  it('abilitySummary describes what each character does', () => {
    expect(abilitySummary('hunter')).toEqual({
      gains: [],
      spends: { one: 'cross' },
      attack: { faction: 'werewolf', max: 2 },
      damage: 1,
      optional_cross: true,
    });
    expect(abilitySummary('seer').damage).toBe(2);
    expect(abilitySummary('villager')).toEqual({
      gains: ['cross'],
      spends: null,
      attack: null,
      damage: 0,
      optional_cross: false,
    });
    expect(idOf(() => abilitySummary('dragon' as never))).toBe('error-invalid-input');
  });

  it('a replay saved by engine 0.1.0 still verifies and replays', () => {
    const old = JSON.parse(
      readFileSync(
        new URL(
          '../../../../engine/crates/wwd-core/tests/fixtures/replay-0.1.0.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as Replay;
    expect(() => verifyReplay(old)).not.toThrow();
    const events = replayTimeline(old, 'omniscient').flatMap((step) => step.events);
    expect(events.some((event) => 'discard_revealed' in event.kind)).toBe(true);
  });

  it('effectiveInitiative clamps at zero', () => {
    expect(effectiveInitiative('seer', 2)).toBe(3);
    expect(effectiveInitiative('hunter', 2)).toBe(0);
  });

  it('showdownOrder is null before the reveal and the revealed order after it', () => {
    const fresh = Game.create(SEED, defaultRulesConfig());
    expect(showdownOrder(fresh.view('spectator'))).toBeNull();
    fresh.dispose();

    const game = atRoundOver();
    const revealed = game
      .eventsSince(0, 'spectator')
      .map(([, event]) => event.kind)
      .find((kind) => 'plans_revealed' in kind);
    if (revealed === undefined || !('plans_revealed' in revealed)) throw new Error('no reveal');
    expect(showdownOrder(game.view('spectator'))).toEqual(revealed.plans_revealed.order);
    game.dispose();
  });

  it('contentHash matches the BLAKE3 test vector', () => {
    expect(contentHash('')).toBe(
      'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
    );
  });
});

describe('resume and timeline', () => {
  it('Game.resume starts a segment and rejects a mismatched boundary', () => {
    const played = atRoundOver();
    const boundary = played.roundBoundary();
    if (boundary === null) throw new Error('no boundary');
    const resumed = Game.resume(boundary, played.replay(), NEW_SEED);
    expect(resumed.replay().segments).toHaveLength(2);
    const first = resumed.eventsSince(0, 'spectator')[0]?.[1];
    expect(first?.kind).toHaveProperty('segment_started.round', boundary.round + 1);

    const mismatched = { ...boundary, badge: boundary.badge === 'p0' ? 'p1' : 'p0' } as const;
    expect(idOf(() => Game.resume(mismatched, played.replay(), NEW_SEED))).toMatch(
      /^error-replay-/,
    );
    resumed.dispose();
    played.dispose();
  });

  it('replayTimeline has a step for the start of each segment and each command', () => {
    const played = atRoundOver();
    const boundary = played.roundBoundary();
    if (boundary === null) throw new Error('no boundary');
    const resumed = Game.resume(boundary, played.replay(), NEW_SEED);
    resumed.apply('p0', 'next_round');
    const replay = resumed.replay();
    const commands = replay.segments.reduce((n, segment) => n + segment.entries.length, 0);

    const steps = replayTimeline(replay, { seat: 'p1' });
    expect(steps).toHaveLength(commands + replay.segments.length);
    expect(steps[0]?.index).toBe(0);
    expect(steps.at(-1)?.view).toEqual(resumed.view({ seat: 'p1' }));

    const tampered = structuredClone(replay);
    const segment = tampered.segments[0];
    if (segment === undefined) throw new Error('no segment');
    segment.seed = '09'.repeat(32);
    expect(idOf(() => replayTimeline(tampered, 'spectator'))).toMatch(/^error-replay-/);
    resumed.dispose();
    played.dispose();
  });
});
