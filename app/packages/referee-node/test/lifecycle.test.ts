import { readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig, verifyReplay } from '@wwd/engine';
import { loadEngineForNode } from '@wwd/engine/test-support';
import { encode } from '@wwd/protocol';
import { Room } from '@wwd/referee-core';
import { FileStore } from '../src/file-store.js';
import { LIMITS } from '@wwd/referee-service';
import {
  Client,
  FULL_GAME_TIMEOUT_MS,
  SEED,
  Xorshift,
  advancingClock,
  createRoom,
  expectUnknownRoom,
  joinBoth,
  play,
  removeTempDirs,
  start,
  tempDir,
  until,
  wsUrl,
  type TestServer,
} from './helpers.js';

beforeAll(loadEngineForNode);

const servers: TestServer[] = [];
const clients: Client[] = [];

async function server(
  opts: Parameters<typeof start>[0] = {},
  dataDir?: string,
): Promise<TestServer> {
  const s = await start(opts, dataDir);
  servers.push(s);
  return s;
}

async function open(s: TestServer, code: string): Promise<Client> {
  const c = await Client.open(wsUrl(s, code));
  clients.push(c);
  return c;
}

async function readSnapshot(s: TestServer, code: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(s.dataDir, `${code}.json`), 'utf8'));
}

/** Makes `Room.faulted` report true after any message handled while armed. */
function injectFault(): { armed: boolean } {
  const fault = { armed: false };
  let faulted = false;
  vi.spyOn(Room.prototype, 'faulted', 'get').mockImplementation(() => faulted);
  const original = Room.prototype.handle;
  vi.spyOn(Room.prototype, 'handle').mockImplementation(function (this: Room, conn, raw) {
    faulted = false;
    const out = original.call(this, conn, raw);
    faulted = fault.armed;
    return out;
  });
  return fault;
}

function entriesIn(snapshot: Record<string, unknown>): number {
  const replay = snapshot['replay'] as { segments: Array<{ entries: unknown[] }> } | null;
  return replay?.segments.reduce((n, segment) => n + segment.entries.length, 0) ?? 0;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const c of clients.splice(0)) c.close();
  for (const s of servers.splice(0)) await s.close();
  await removeTempDirs();
});

describe('referee-node lifecycle', () => {
  it('restart restores rooms from disk', { timeout: FULL_GAME_TIMEOUT_MS }, async () => {
    const clock = advancingClock();
    const first = await server({ clock, testOverrides: true });
    const code = await createRoom(first, { test: { seed: SEED } });
    const [a0, a1] = await joinBoth(first, code);
    clients.push(a0, a1);
    const rng = new Xorshift(3);
    expect(await play([a0, a1], rng, 12)).toBe(12);
    await first.close();
    await until(() => a0.closed && a1.closed);

    const second = await server({ clock, testOverrides: true }, first.dataDir);
    const b0 = await open(second, code);
    const b1 = await open(second, code);
    b0.hello(code, a0.token(), a0.nextSeq());
    b1.hello(code, a1.token(), a1.nextSeq());
    await until(() => b0.latest() !== undefined && b1.latest() !== undefined);
    // Only events the clients had not yet seen are resent.
    expect(b0.latest()!.from_seq).toBe(a0.nextSeq());
    expect(b1.latest()!.from_seq).toBe(a1.nextSeq());

    await play([b0, b1], rng);
    const replay = b0.ofType('game_over')[0]!.replay;
    expect(() => verifyReplay(replay)).not.toThrow();
  });

  it('idle room unloads and reloads', async () => {
    const clock = advancingClock();
    const lines: string[] = [];
    const logger = {
      info: (m: string) => lines.push(m),
      warn: () => {},
      error: () => {},
    };
    const s = await server({ clock, logger, idleUnloadMs: 500 });
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    await play([p0, p1], new Xorshift(9), 6);
    const seen = [p0.nextSeq(), p1.nextSeq()];

    // A room with a connection stays loaded however long it idles.
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(lines).not.toContain(`room ${code} unloaded`);

    p0.close();
    p1.close();
    await until(() => lines.includes(`room ${code} unloaded`), 10_000);
    expect(entriesIn(await readSnapshot(s, code))).toBe(6);

    const again = await open(s, code);
    again.hello(code, p0.token(), seen[0]);
    await until(() => again.latest() !== undefined);
    expect(lines).toContain(`room ${code} restored`);
    expect(again.latest()!.from_seq).toBe(seen[0]);
    expect(again.ofType('welcome')[0]!.seat).toBe(p0.ofType('welcome')[0]!.seat);
  });

  it('a connection arriving before the idle time keeps the room loaded', async () => {
    const lines: string[] = [];
    const logger = { info: (m: string) => lines.push(m), warn: () => {}, error: () => {} };
    const s = await server({ logger, idleUnloadMs: 500 });
    const code = await createRoom(s);
    const c = await open(s, code);
    c.hello(code);
    await until(() => c.ofType('welcome').length > 0);
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(lines).not.toContain(`room ${code} unloaded`);
  });

  it('an idle room whose revision changes during the unload write is unloaded later', async () => {
    const lines: string[] = [];
    const logger = { info: (m: string) => lines.push(m), warn: () => {}, error: () => {} };
    const s = await server({ logger, idleUnloadMs: 300 });
    const code = await createRoom(s);
    const c = await open(s, code);
    c.hello(code);
    await until(() => c.ofType('welcome').length > 0);

    let bump = 0;
    const revision = Object.getOwnPropertyDescriptor(Room.prototype, 'revision')!.get!;
    vi.spyOn(Room.prototype, 'revision', 'get').mockImplementation(function (this: Room) {
      return revision.call(this) + bump;
    });
    const settled = FileStore.prototype.settled;
    let armed = true;
    vi.spyOn(FileStore.prototype, 'settled').mockImplementation(async function (
      this: FileStore,
      c,
    ) {
      await settled.call(this, c);
      if (armed) {
        armed = false;
        bump = 1;
      }
    });
    c.close();
    await until(() => lines.includes(`room ${code} unloaded`), 10_000);
    expect(armed).toBe(false);
  });

  it('treats a corrupt room file as missing', async () => {
    const s = await server();
    const code = await createRoom(s);
    await s.close();
    await writeFile(join(s.dataDir, `${code}.json`), '{ not json');
    const errors: string[] = [];
    const logger = { info: () => {}, warn: () => {}, error: (m: string) => errors.push(m) };
    const restarted = await server({ logger }, s.dataDir);
    await expectUnknownRoom(restarted, code);
    expect(errors.some((m) => m.includes(code))).toBe(true);
  });

  it('grace expiry via real timer', async () => {
    const s = await server({ testOverrides: true });
    const code = await createRoom(s, { test: { grace_ms: 1000 } });
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    p1.close();
    await until(() => p0.ofType('opponent_status').some((m) => m.grace_deadline !== undefined));
    p0.send(encode({ type: 'claim_win' }));
    await until(() => p0.ofType('error').length > 0);
    expect(p0.ofType('error')[0]!.code).toBe('not_expired');

    await until(() => p0.ofType('opponent_status').some((m) => m.can_claim_win === true), 3000);
    p0.send(encode({ type: 'claim_win' }));
    await until(() => p0.ofType('game_over').length > 0);
    expect(() => verifyReplay(p0.ofType('game_over')[0]!.replay)).not.toThrow();
  });

  it('expired rooms are swept', async () => {
    const t0 = Date.now();
    let now = t0;
    const clock = { now: () => now };
    const first = await server({ clock });
    const onDiskOnly = await createRoom(first);
    await first.close();

    const s = await server({ clock, sweepIntervalMs: 50 }, first.dataDir);
    const inMemory = await createRoom(s);
    const watcher = await open(s, inMemory);
    watcher.hello(inMemory);
    await until(() => watcher.ofType('welcome').length > 0);

    now = t0 + LIMITS.IDLE_ROOM_TTL_MS + 1;
    const fresh = await createRoom(s);

    await until(() => watcher.closed, 2000);
    expect(watcher.ofType('error').at(-1)?.code).toBe('room_closed');
    await vi.waitFor(async () => {
      expect((await readdir(s.dataDir)).sort()).toEqual([`${fresh}.json`]);
    });
    await expectUnknownRoom(s, inMemory);
    await expectUnknownRoom(s, onDiskOnly);
  });

  it('faulted room is dropped not persisted', async () => {
    const clock = advancingClock();
    const s = await server({ clock });
    const code = await createRoom(s);
    const [p0, p1] = await joinBoth(s, code);
    clients.push(p0, p1);
    await play([p0, p1], new Xorshift(5), 4);
    await vi.waitFor(async () => {
      expect(entriesIn(await readSnapshot(s, code))).toBe(4);
    });

    const fault = injectFault();
    fault.armed = true;
    const seenBefore = p0.nextSeq();
    const mover = p0.latest()!.legal.length > 0 ? p0 : p1;
    mover.command(mover.latest()!.legal[0]!);

    expect(await p0.closedNow()).toBe(1011);
    expect(await p1.closedNow()).toBe(1011);

    // The next connection restores the last persisted state rather than reusing the faulted room.
    fault.armed = false;
    const again = await open(s, code);
    again.hello(code, p0.token());
    await until(() => again.latest() !== undefined);
    expect(again.nextSeq()).toBe(seenBefore);
    // The faulting command never reached the file.
    expect(entriesIn(await readSnapshot(s, code))).toBe(4);
  });

  it('a room that keeps faulting is quarantined', async () => {
    const s = await server();
    const code = await createRoom(s);
    const fault = injectFault();
    for (let i = 0; i < 3; i++) {
      fault.armed = true;
      const c = await open(s, code);
      c.hello(code);
      expect(await c.closedNow()).toBe(1011);
    }
    await vi.waitFor(async () => {
      expect(await readdir(s.dataDir)).toEqual([`${code}.faulted.json`]);
    });
    fault.armed = false;
    await expectUnknownRoom(s, code);
  });

  it('sweeps stale v1, temporary and quarantined files', async () => {
    const dir = await tempDir();
    const v1 = {
      version: 1,
      code: 'V1V1V1',
      config: defaultRulesConfig(),
      seats: [null, null],
      replay: null,
      segment_base: 0,
    };
    const hourAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
    const files: Array<[string, string, Date]> = [
      ['V1V1V1.json', JSON.stringify(v1), hourAgo(31 * 24)],
      ['.ABCDEF.0f0f0f0f-0000-4000-8000-000000000000.tmp', '{', hourAgo(2)],
      ['.ABCDEG.0f0f0f0f-0000-4000-8000-000000000001.tmp', '{', new Date()],
      ['ABCDEH.faulted.json', '{}', hourAgo(25)],
      ['ABCDEJ.faulted.json', '{}', hourAgo(1)],
    ];
    for (const [name, text, time] of files) {
      await writeFile(join(dir, name), text);
      await utimes(join(dir, name), time, time);
    }
    await server({ sweepIntervalMs: 50 }, dir);
    await vi.waitFor(async () => {
      expect((await readdir(dir)).sort()).toEqual([
        '.ABCDEG.0f0f0f0f-0000-4000-8000-000000000001.tmp',
        'ABCDEJ.faulted.json',
      ]);
    });
  });
});
