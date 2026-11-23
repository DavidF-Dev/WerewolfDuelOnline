import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRulesConfig } from '@wwd/engine';
import type { RoomSnapshotV1 } from '@wwd/referee-core';
import { FileStore } from '../src/file-store.js';
import { removeTempDirs, tempDir } from './helpers.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
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

afterEach(async () => {
  vi.mocked(fs.writeFile).mockClear();
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
});
