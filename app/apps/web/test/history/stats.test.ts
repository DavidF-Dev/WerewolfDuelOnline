import { describe, expect, it } from 'vitest';
import { replayTimeline } from '@wwd/engine';
import { stats } from '../../src/history/stats.js';
import { summarise } from '../../src/history/summary.js';
import { gameDealing } from '../games.js';
import { finishedGame, oneRound, recordFrom } from './records.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const records = () =>
  SEEDS.map((seed) => recordFrom(finishedGame(seed), seed % 2 === 0 ? 'p0' : 'p1', `r${seed}`));

describe('summarise', () => {
  it('reads the result and round count from the emitted events', () => {
    for (const record of records()) {
      const summary = summarise(record);
      expect(summary.winner).toBe(record.winner);
      expect(summary.reason).toBe(record.reason);
      expect(summary.rounds).toBe(record.rounds);
    }
  });

  it('lists the record seat picks, one per round that reached its reveal', () => {
    const record = recordFrom(finishedGame(3), 'p0', 'x');
    const revealed = replayTimeline(record.replay, 'omniscient')
      .flatMap((step) => step.events)
      .filter((event) => 'plans_revealed' in event.kind);
    expect(summarise(record).picks).toHaveLength(revealed.length);
  });
});

describe('stats', () => {
  it('stats count each win condition', () => {
    const all = records();
    const result = stats(all);
    for (const reason of ['health', 'fangs', 'crosses', 'resignation'] as const) {
      const mine = all.filter((r) => r.reason === reason);
      expect(result.byCondition[reason]).toEqual({
        won: mine.filter((r) => r.winner === r.seat).length,
        lost: mine.filter((r) => r.winner !== r.seat).length,
      });
    }
    expect(result.games).toBe(all.length);
    expect(result.wins + result.losses).toBe(all.length);
  });

  it('counts a resignation', () => {
    const game = oneRound(gameDealing('p0', ['villager']), 'p0', 'villager', 'p1');
    const result = stats([recordFrom(game, 'p0', 'a')]);
    expect(result.byCondition.resignation).toEqual({ won: 1, lost: 0 });
  });

  it('pick success rate counts a pick whose effect landed and not one that forfeited', () => {
    const villager = oneRound(gameDealing('p0', ['villager']), 'p0', 'villager', 'p1');
    const hunter = oneRound(gameDealing('p0', ['hunter']), 'p0', 'hunter', 'p1');
    const result = stats([recordFrom(villager, 'p0', 'a'), recordFrom(hunter, 'p0', 'b')]);
    const row = (c: string) => result.picks.find((p) => p.character === c);
    expect(row('villager')).toMatchObject({ picked: 1, succeeded: 1, rate: 1 });
    expect(row('hunter')).toMatchObject({ picked: 1, succeeded: 0, rate: 0 });
    expect(row('seer')).toMatchObject({ picked: 0, succeeded: 0, rate: null });
  });

  it('average rounds', () => {
    const all = records();
    const expected = all.reduce((sum, r) => sum + r.rounds, 0) / all.length;
    expect(stats(all).averageRounds).toBeCloseTo(expected);
    expect(stats([]).averageRounds).toBeNull();
  });

  it('groups results by opponent name', () => {
    const [a, b, c] = records();
    const result = stats([{ ...a!, opponentName: 'Jo' }, { ...b!, opponentName: 'Jo' }, { ...c! }]);
    const jo = result.opponents.find((o) => o.name === 'Jo');
    expect(jo!.won + jo!.lost).toBe(2);
    expect(result.opponents.find((o) => o.name === null)).toBeDefined();
  });
});
