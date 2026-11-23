import { beforeAll, describe, expect, it } from 'vitest';
import {
  EngineError,
  Game,
  defaultRulesConfig,
  engineFtl,
  type Replay,
  type Seat,
  verifyReplay,
} from '../src/index.js';
import { loadEngineForNode } from '../src/test-support.js';

const SEED = '01'.repeat(32);

beforeAll(loadEngineForNode);

function roundEnded(game: Game): boolean {
  const { phase } = game.view({ seat: 'p0' });
  return phase === 'round_over' || (typeof phase === 'object' && 'game_over' in phase);
}

function playRound(game: Game): void {
  for (let step = 0; step < 200; step += 1) {
    if (roundEnded(game)) return;
    const seats: Seat[] = game.pending().seats;
    const seat = seats[0];
    if (seat === undefined) throw new Error('no pending seat');
    const cmd = game.legalActions(seat)[0];
    if (cmd === undefined) throw new Error('no legal action');
    game.apply(seat, cmd);
  }
  throw new Error('round did not finish');
}

describe('@wwd/engine', () => {
  it('plays a scripted round', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    playRound(game);
    expect(roundEnded(game)).toBe(true);
    expect(game.view({ seat: 'p1' }).players[0].hand).toBeNull();
    expect(game.logLength()).toBeGreaterThan(0);
    game.dispose();
  });

  it('errors are EngineError with ids', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    expect(() => game.apply('p0', 'next_round')).toThrow(EngineError);
    try {
      game.apply('p0', 'next_round');
      expect.unreachable();
    } catch (thrown) {
      expect((thrown as EngineError).id).toBe('error-wrong-phase');
    }
    expect(() => Game.create('nope', defaultRulesConfig())).toThrow(EngineError);
    game.dispose();
  });

  it('replay verifies and tampering fails', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    playRound(game);
    const replay = game.replay();
    expect(() => verifyReplay(replay)).not.toThrow();
    const tampered: Replay = structuredClone(replay);
    const segment = tampered.segments[0];
    if (segment === undefined) throw new Error('no segment');
    segment.seed = '02'.repeat(32);
    let id = '';
    try {
      verifyReplay(tampered);
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(EngineError);
      id = (thrown as EngineError).id;
    }
    expect(id.startsWith('error-replay-')).toBe(true);
    game.dispose();
  });

  it('hex fields are strings', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    const seed = game.replay().segments[0]?.seed;
    expect(typeof seed).toBe('string');
    expect(seed).toHaveLength(64);
    game.dispose();
  });

  it('maps Option to null', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    expect(game.roundBoundary()).toBeNull();
    game.dispose();
  });

  it('exposes the English locale', () => {
    expect(engineFtl['en']).toContain('character-wolf-king');
  });
});

describe('canResign', () => {
  it('is true during play and false once the game is over', () => {
    const game = Game.create(SEED, defaultRulesConfig());
    expect(game.canResign('p0')).toBe(true);
    expect(game.canResign('p1')).toBe(true);
    game.apply('p1', 'resign');
    expect(game.canResign('p0')).toBe(false);
    expect(game.canResign('p1')).toBe(false);
    game.dispose();
  });
});
