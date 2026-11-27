import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameClient, type GameClientState } from '@wwd/client-core';
import { MemoryReferee } from '@wwd/referee-memory';
import {
  TUTORIAL_START_TIMEOUT_MS,
  startTutorial,
  type TutorialRun,
} from '../../src/tutorial/runner.js';
import { TUTORIAL_STEPS, allowedCommand } from '../../src/tutorial/script.js';

let run: TutorialRun | undefined;
afterEach(() => {
  run?.dispose();
  run = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NAMES = { playerName: 'Player', opponentName: 'Opponent' };

function settled(client: GameClient, ready: (state: GameClientState) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const off = client.state.subscribe((state) => {
      if (!ready(state)) return;
      resolve();
      queueMicrotask(() => off());
    });
  });
}

function stepOf(r: TutorialRun): number {
  let value = -1;
  r.step.subscribe((n) => (value = n))();
  return value;
}

function reaches(r: TutorialRun, index: number): Promise<void> {
  return new Promise((resolve) => {
    const off = r.step.subscribe((n) => {
      if (n !== index) return;
      resolve();
      queueMicrotask(() => off());
    });
  });
}

/** Sends the player's command for the current step once the engine offers it. */
async function act(r: TutorialRun): Promise<void> {
  const cmd = allowedCommand(TUTORIAL_STEPS[stepOf(r)]!.allow)!;
  const kind = Object.keys(cmd)[0]!;
  await settled(r.player, (s) =>
    s.legal.some((offered) => typeof offered === 'object' && kind in offered),
  );
  r.player.command(cmd);
}

const fakeTimers = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
};

describe('startTutorial', () => {
  it('moves through the five steps as the script is followed', async () => {
    run = await startTutorial({ ...NAMES, delayMs: 0 });
    const seen: number[] = [];
    run.step.subscribe((n) => seen.push(n));
    expect(stepOf(run)).toBe(0);
    run.next();
    expect(stepOf(run)).toBe(1);
    await act(run);
    await reaches(run, 2);
    await act(run);
    await reaches(run, 3);
    await settled(run.player, (s) => s.view?.phase === 'round_over');
    run.next();
    expect(stepOf(run)).toBe(4);
    run.next();
    expect(stepOf(run)).toBe(4);
    expect(seen).toEqual([0, 1, 2, 3, 4]);
  });

  it('a game step lasts until the engine has both seats’ moves, not just the player’s', async () => {
    fakeTimers();
    run = await startTutorial({ ...NAMES, delayMs: 1000 });
    run.next();
    await act(run);
    await vi.advanceTimersByTimeAsync(999);
    expect(stepOf(run)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await reaches(run, 2);
    await act(run);
    await settled(run.player, (s) =>
      s.events.some(
        ([, e]) => 'hourglasses_placed' in e.kind && e.kind.hourglasses_placed.seat === 'p0',
      ),
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(stepOf(run)).toBe(2);
    expect(run.player.current.view?.phase).toEqual({ reveal_hourglass: { seat: 'p1' } });
    await vi.advanceTimersByTimeAsync(1);
    await reaches(run, 3);
  });

  it('names each seat as it is told', async () => {
    run = await startTutorial({ ...NAMES, delayMs: 0 });
    await settled(run.player, (s) => s.opponent.name !== undefined);
    expect(run.player.current.opponent.name).toBe('Opponent');
  });

  it.each(['', '   '])('starts with a blank player name (%j), sending none', async (playerName) => {
    const received = vi.spyOn(
      MemoryReferee.prototype as unknown as { receive: (...args: unknown[]) => void },
      'receive',
    );
    run = await startTutorial({ ...NAMES, playerName, delayMs: 0 });
    expect(run.player.current.seat).toBe('p0');
    expect(run.player.current.view).not.toBeNull();
    const hello = JSON.parse(received.mock.calls[0]![2] as string) as Record<string, unknown>;
    expect(hello.type).toBe('hello');
    expect(hello).not.toHaveProperty('name');
  });

  it('rejects when the room does not start its game in time', async () => {
    fakeTimers();
    vi.spyOn(
      MemoryReferee.prototype as unknown as { receive: () => void },
      'receive',
    ).mockImplementation(() => undefined);
    const starting = startTutorial({ ...NAMES, delayMs: 0 });
    const outcome = expect(starting).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(TUTORIAL_START_TIMEOUT_MS);
    await outcome;
  });

  it('rejects when its start is aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('left the screen'));
    await expect(
      startTutorial({ ...NAMES, delayMs: 0, signal: controller.signal }),
    ).rejects.toThrow('left the screen');
  });

  it('ignores next() on a step the player must act on', async () => {
    run = await startTutorial({ ...NAMES, delayMs: 0 });
    run.next();
    expect(TUTORIAL_STEPS[1]!.advance).toBe('game');
    run.next();
    run.next();
    expect(stepOf(run)).toBe(1);
  });

  it('sends nothing once disposed, even with an opponent move pending', async () => {
    fakeTimers();
    const command = vi.spyOn(GameClient.prototype, 'command');
    run = await startTutorial({ ...NAMES, delayMs: 1000 });
    run.next();
    await vi.advanceTimersByTimeAsync(500);
    run.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(command).not.toHaveBeenCalled();
  });

  it('sends the opponent move after the delay', async () => {
    fakeTimers();
    run = await startTutorial({ ...NAMES, delayMs: 1000 });
    run.next();
    await vi.advanceTimersByTimeAsync(999);
    expect(run.player.current.view?.players[1].plan).toBe('none');
    await vi.advanceTimersByTimeAsync(1);
    await settled(run.player, (s) => s.view?.players[1].plan !== 'none');
  });
});
