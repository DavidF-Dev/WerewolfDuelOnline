import { afterEach, describe, expect, it } from 'vitest';
import type { Command, EventKind, PlayerView } from '@wwd/engine';
import { sameCommand, type GameClient, type GameClientState } from '@wwd/client-core';
import { openTutorialTable, type TutorialTable } from '../../src/tutorial/runner.js';
import { TUTORIAL_PLAYER_SEAT, TUTORIAL_STEPS, allowedCommand } from '../../src/tutorial/script.js';

const DEALT =
  'TUTORIAL_SEED no longer deals the tutorial its hands; run `pnpm --filter @wwd/web tutorial:seed` for a new one';

let table: TutorialTable | undefined;
afterEach(() => {
  table?.dispose();
  table = undefined;
});

/** Resolves with the client's state once `ready` holds for it. */
function settled(
  client: GameClient,
  ready: (state: GameClientState) => boolean,
): Promise<GameClientState> {
  return new Promise((resolve) => {
    const off = client.state.subscribe((state) => {
      if (!ready(state)) return;
      resolve(state);
      queueMicrotask(() => off());
    });
  });
}

const kindOf = (cmd: Command): string => (typeof cmd === 'string' ? cmd : Object.keys(cmd)[0]!);

const own = (state: GameClientState): PlayerView =>
  state.view!.players[state.seat === 'p0' ? 0 : 1];
const other = (state: GameClientState): PlayerView =>
  state.view!.players[state.seat === 'p0' ? 1 : 0];

const kinds = (state: GameClientState): EventKind[] => state.events.map(([, event]) => event.kind);

/** Waits until the engine asks `client` for a command like `cmd`, checks it is legal and sends it. */
async function play(client: GameClient, cmd: Command): Promise<void> {
  const state = await settled(client, (s) =>
    s.legal.some((offered) => kindOf(offered) === kindOf(cmd)),
  );
  expect(
    state.legal.some((offered) => sameCommand(offered, cmd)),
    `${JSON.stringify(cmd)} is legal`,
  ).toBe(true);
  client.command(cmd);
}

async function open(): Promise<TutorialTable> {
  table = await openTutorialTable({ playerName: 'Player', opponentName: 'Opponent' });
  await Promise.all([
    settled(table.player, (s) => s.view !== null),
    settled(table.opponent, (s) => s.view !== null),
  ]);
  return table;
}

describe('the tutorial script', () => {
  it('has five steps in the order they are taught', () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      'goal',
      'plan',
      'reveal',
      'showdown',
      'round-end',
    ]);
  });

  it('a game step allows a command and an explain-only step allows none', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(allowedCommand(step.allow) !== null, step.id).toBe(step.advance === 'game');
    }
  });

  it('deals the player the Badge with the Knight, Seer, Witch and Villager', async () => {
    const { player, opponent } = await open();
    const mine = player.current;
    expect(mine.seat).toBe(TUTORIAL_PLAYER_SEAT);
    expect([...own(mine).hand!].sort(), DEALT).toEqual(['knight', 'seer', 'villager', 'witch']);
    expect(mine.view!.badge, DEALT).toBe(TUTORIAL_PLAYER_SEAT);
    expect(own(mine).hourglass, DEALT).toBe(0);
    const theirs = opponent.current;
    expect(own(theirs).hand, DEALT).toContain('wolfen');
    expect(own(theirs).hourglass, DEALT).toBe(1);
  });

  it('plays its round through the engine: the Knight eliminates the Wolfen', async () => {
    const { player, opponent } = await open();
    for (const step of TUTORIAL_STEPS) {
      const mine = allowedCommand(step.allow);
      if (mine !== null) await play(player, mine);
      if (step.opponent !== null) await play(opponent, step.opponent);
    }
    const end = await settled(player, (s) => s.view?.phase === 'round_over');
    const events = kinds(end);

    const revealed = events.find((kind) => 'plans_revealed' in kind);
    expect(revealed && 'plans_revealed' in revealed && revealed.plans_revealed.plans).toEqual([
      { character: 'knight', targets: [{ character: 'wolfen' }] },
      { character: 'wolfen', targets: [{ character: 'seer' }] },
    ]);
    const placed = events.flatMap((kind) =>
      'hourglasses_placed' in kind ? [kind.hourglasses_placed] : [],
    );
    expect(placed).toEqual([
      { seat: 'p0', n: 0 },
      { seat: 'p1', n: 0 },
    ]);

    expect(events).toContainEqual({
      attack_hit: {
        seat: 'p0',
        target_seat: 'p1',
        attacker: 'knight',
        character: 'wolfen',
        health_lost: 1,
      },
    });
    expect(
      events.some((kind) => 'character_resolved' in kind && kind.character_resolved.seat === 'p1'),
    ).toBe(false);
    expect(other(end).health).toBe(1);
    expect(own(end).hourglass).toBe(1);
    expect(end.view!.badge).toBe('p1');
    expect(end.status).toBe('playing');
    expect(events.some((kind) => 'game_over' in kind)).toBe(false);
  });
});
