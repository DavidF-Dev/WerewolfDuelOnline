import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WasmGame } from '../dist/wasm/wwd_wasm.js';
import {
  EngineError,
  EngineFault,
  Game,
  defaultRulesConfig,
  engineVersion,
  eventId,
  seedCommitment,
  visibleTo,
  type Event,
  type Replay,
  type Seat,
} from '../src/index.js';
import { loadEngineForNode } from '../src/test-support.js';

const SEED = '01'.repeat(32);

beforeAll(loadEngineForNode);

function errorId(call: () => unknown): string {
  try {
    call();
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(EngineError);
    return (thrown as EngineError).id;
  }
  throw new Error('expected a throw');
}

describe('inputs', () => {
  it('round-trips a replay through JSON and keeps playing', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    const first = game.pending().seats[0] ?? 'p0';
    const opening = game.legalActions(first)[0];
    if (opening === undefined) throw new Error('no legal action');
    game.apply(first, opening);

    const copy = Game.fromReplay(JSON.parse(JSON.stringify(game.replay())) as Replay);
    expect(copy.logLength()).toBe(game.logLength());
    expect(copy.pending()).toEqual(game.pending());

    const seat = game.pending().seats[0] ?? 'p0';
    const cmd = game.legalActions(seat)[0];
    if (cmd === undefined) throw new Error('no legal action');
    expect(copy.apply(seat, cmd)).toEqual(game.apply(seat, cmd));
    game.dispose();
    copy.dispose();
  });

  it('accepts the default config and rejects null input', () => {
    Game.create(SEED, defaultRulesConfig()).dispose();
    // No engine input is an Option, so null for a required field is the invalid case.
    expect(errorId(() => Game.create(SEED, null as never))).toBe('error-invalid-input');
  });

  it.each(['01'.repeat(31) + '0', '01'.repeat(32) + '0', 'zz'.repeat(32)])(
    'rejects malformed seed %s',
    (seed) => {
      expect(errorId(() => Game.create(seed, defaultRulesConfig()))).toBe('error-invalid-input');
      expect(errorId(() => seedCommitment(seed))).toBe('error-invalid-input');
    },
  );
});

describe('faults', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports a thrown value without an id as an EngineFault, keeping the cause', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    const trap = new WebAssembly.RuntimeError('unreachable');
    vi.spyOn(WasmGame.prototype, 'logLength').mockImplementation(() => {
      throw trap;
    });
    let thrown: unknown;
    try {
      game.logLength();
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBeInstanceOf(EngineFault);
    expect(thrown).not.toBeInstanceOf(EngineError);
    expect((thrown as EngineFault).cause).toBe(trap);
    vi.restoreAllMocks();
    game.dispose();
  });

  it('keeps an object with a string id as an EngineError', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    vi.spyOn(WasmGame.prototype, 'logLength').mockImplementation(() => {
      throw { id: 'error-wrong-phase' };
    });
    expect(errorId(() => game.logLength())).toBe('error-wrong-phase');
    vi.restoreAllMocks();
    game.dispose();
  });
});

describe('helpers', () => {
  it('agree with the game', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    expect(seedCommitment(SEED)).toBe(game.replay().segments[0]?.seed_commitment);
    expect(engineVersion()).toBe(game.replay().engine_version);
    const events = game.eventsSince(0, 'spectator');
    const [index, event] = events[0] as [number, Event];
    expect(index).toBe(0);
    expect(eventId(event.kind)).toMatch(/^event-/);
    expect(visibleTo(event, 'spectator')).toBe(true);
    game.dispose();
  });
});

describe('redaction', () => {
  const handsDealtTo = (events: Array<[number, Event]>, seat: Seat) =>
    events.filter(([, e]) => 'hand_dealt' in e.kind && e.kind.hand_dealt.seat === seat);

  it('hides hands from the opponent and spectators', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    expect(game.view({ seat: 'p0' }).players[0].hand).not.toBeNull();
    expect(game.view({ seat: 'p1' }).players[0].hand).toBeNull();
    expect(game.view('spectator').players[0].hand).toBeNull();
    expect(game.view('spectator').players[1].hand).toBeNull();
    expect(game.view('omniscient').players[0].hand).not.toBeNull();
    expect(game.view('omniscient').players[1].hand).not.toBeNull();
    game.dispose();
  });

  it('hides hand_dealt events and visibleTo agrees', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    const dealt = handsDealtTo(game.eventsSince(0, 'omniscient'), 'p0');
    expect(dealt.length).toBeGreaterThan(0);
    expect(handsDealtTo(game.eventsSince(0, { seat: 'p1' }), 'p0')).toHaveLength(0);
    expect(handsDealtTo(game.eventsSince(0, 'spectator'), 'p0')).toHaveLength(0);
    expect(handsDealtTo(game.eventsSince(0, { seat: 'p0' }), 'p0')).toHaveLength(dealt.length);
    for (const [, event] of dealt) {
      expect(visibleTo(event, { seat: 'p1' })).toBe(false);
      expect(visibleTo(event, { seat: 'p0' })).toBe(true);
      expect(visibleTo(event, 'omniscient')).toBe(true);
    }
    game.dispose();
  });
});
