import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import type { RoomSnapshotV1 } from '@wwd/referee-core';
import { FileStore } from '../src/file-store.js';
import { removeTempDirs, tempDir } from './helpers.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) };
});

const CODE = 'K7Q2MX';
const OWNER_ONLY = 0o600;

function snapshot(): RoomSnapshotV1 {
  return {
    version: 1,
    code: CODE,
    config: defaultRulesConfig(),
    seats: [{ token: 'ab'.repeat(16) }, null],
    replay: null,
    segment_base: 0,
  };
}

/** The error Windows gives a rename whose target another handle has open. */
function targetOpen(): NodeJS.ErrnoException {
  return Object.assign(new Error('operation not permitted, rename'), { code: 'EPERM' });
}

afterEach(async () => {
  vi.mocked(fs.writeFile).mockClear();
  vi.mocked(fs.rename).mockClear();
  await removeTempDirs();
});

describe('file store', () => {
  it('writes snapshot files readable only by their owner', async () => {
    const dir = await tempDir();
    const store = new FileStore(dir, () => {});
    await store.init();
    await store.write(CODE, snapshot());

    const writes = vi.mocked(fs.writeFile).mock.calls;
    expect(writes).toHaveLength(1);
    expect(writes[0]![2]).toMatchObject({ mode: OWNER_ONLY });
    expect(await store.read(CODE)).toEqual(snapshot());
    if (process.platform !== 'win32') {
      expect((await fs.stat(join(dir, `${CODE}.json`))).mode & 0o777).toBe(OWNER_ONLY);
    }
  });

  it('retries replacing a snapshot file that is open elsewhere', async () => {
    const dir = await tempDir();
    const errors: unknown[] = [];
    const store = new FileStore(dir, (_code, thrown) => errors.push(thrown));
    await store.init();
    vi.mocked(fs.rename).mockRejectedValueOnce(targetOpen()).mockRejectedValueOnce(targetOpen());

    store.schedule(CODE, snapshot);
    await store.settled(CODE);

    expect(errors).toEqual([]);
    expect(vi.mocked(fs.rename).mock.calls).toHaveLength(3);
    expect(await store.read(CODE)).toEqual(snapshot());
  });

  it('gives up on a rename that fails for another reason', async () => {
    const dir = await tempDir();
    const errors: unknown[] = [];
    const store = new FileStore(dir, (_code, thrown) => errors.push(thrown));
    await store.init();
    const crossDevice = Object.assign(new Error('cross-device link'), { code: 'EXDEV' });
    vi.mocked(fs.rename).mockRejectedValueOnce(crossDevice);

    store.schedule(CODE, snapshot);
    await store.settled(CODE);

    expect(errors).toEqual([crossDevice]);
    expect(vi.mocked(fs.rename).mock.calls).toHaveLength(1);
    expect(await fs.readdir(dir)).toEqual([]);
  });
});
