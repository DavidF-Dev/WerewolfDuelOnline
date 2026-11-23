import { describe, expect, it } from 'vitest';
import { EngineError, Game, defaultRulesConfig, engineVersion, initEngine } from '../src/index.js';
import { loadEngineForNode } from '../src/test-support.js';

describe('engine lifecycle', () => {
  it('reports use before init, then recovers from a failed init', async () => {
    expect(() => engineVersion()).toThrow(EngineError);
    try {
      Game.create('01'.repeat(32), defaultRulesConfig());
      expect.unreachable();
    } catch (thrown) {
      expect((thrown as EngineError).id).toBe('error-engine-not-ready');
    }

    await expect(initEngine(new Uint8Array([1, 2, 3]))).rejects.toBeDefined();
    await loadEngineForNode();
    expect(engineVersion()).not.toBe('');
  });

  it('reports use after dispose and tolerates a second dispose', async () => {
    await loadEngineForNode();
    const game = Game.create('01'.repeat(32), defaultRulesConfig());
    game.dispose();
    expect(() => game.dispose()).not.toThrow();
    try {
      game.view('spectator');
      expect.unreachable();
    } catch (thrown) {
      expect((thrown as EngineError).id).toBe('error-game-disposed');
    }
  });
});
