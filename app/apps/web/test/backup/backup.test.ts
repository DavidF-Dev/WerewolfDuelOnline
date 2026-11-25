import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contentHash } from '@wwd/engine';
import { canonicalJson } from '@wwd/protocol';
import {
  BACKUP_FORMAT_VERSION,
  BackupError,
  MAX_BACKUP_BYTES,
  MAX_BACKUP_COMPRESSED_BYTES,
  backupFileName,
  gunzipText,
  gzipText,
} from '../../src/backup/format.js';
import { exportBackup } from '../../src/backup/export.js';
import { mergeBackup, previewBackup, readBackup } from '../../src/backup/import.js';
import { DEFAULT_SETTINGS } from '../../src/settings/settings.js';
import { openDeviceStore, type DeviceStore } from '../../src/storage/db.js';
import { SERVER, historyRecord, populate, sessionRecord } from './fixtures.js';

let store: DeviceStore;
let other: DeviceStore;
const NOW = Date.now();

beforeEach(async () => {
  store = await openDeviceStore();
  other = await openDeviceStore();
});

const reseal = async (edit: (body: Record<string, unknown>) => void): Promise<Blob> => {
  const body = JSON.parse(await gunzipText(await exportBackup(store))) as Record<string, unknown>;
  edit(body);
  const { checksum: _old, ...rest } = body;
  const sealed = { ...rest, checksum: contentHash(canonicalJson(rest)) };
  return new Blob([await gzipText(JSON.stringify(sealed))]);
};

const rejection = async (blob: Blob): Promise<unknown> => {
  try {
    await readBackup(blob);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('backup file', () => {
  it('names the file by local date', () => {
    expect(backupFileName(new Date(2026, 10, 3))).toBe('werewolf-duel-backup-20261103.wwdb');
  });

  it('backup round-trips', async () => {
    await populate(store);
    const backup = await readBackup(await exportBackup(store, 5_000));
    expect(backup.format_version).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.exported_at).toBe(5_000);
    expect(backup.settings.theme).toBe('dark');
    expect(backup.identity).toEqual({ deviceId: 'device-1', displayName: 'Mika' });
    expect(backup.sessions.map((s) => s.room).sort()).toEqual(['AAAAAA', 'BBBBBB']);
    expect(backup.sessions.find((s) => s.room === 'BBBBBB')?.save).toBeDefined();
    expect(backup.history.map((h) => h.id).sort()).toEqual(['g1', 'g2']);

    await other.identity.put({ deviceId: 'device-2' });
    await mergeBackup(other, backup, { settings: true });
    expect((await other.history.list()).map((h) => h.id).sort()).toEqual(['g1', 'g2']);
    expect(await other.sessions.get(sessionRecord('BBBBBB', 0).id)).toEqual(
      await store.sessions.get(sessionRecord('BBBBBB', 0).id),
    );
    expect((await other.settings.get()).theme).toBe('dark');
  });

  it('corrupt and edited files are refused', async () => {
    await populate(store);
    const good = await exportBackup(store);

    const garbage = await rejection(new Blob([new Uint8Array([1, 2, 3, 4])]));
    expect(garbage).toBeInstanceOf(BackupError);
    expect((garbage as BackupError).reason).toBe('corrupt');

    const notJson = await rejection(new Blob([await gzipText('not json')]));
    expect((notJson as BackupError).reason).toBe('corrupt');

    const truncated = await rejection(good.slice(0, 20));
    expect((truncated as BackupError).reason).toBe('corrupt');

    const edited = JSON.parse(await gunzipText(good)) as { settings: { theme: string } };
    edited.settings.theme = 'light';
    const checksum = await rejection(new Blob([await gzipText(JSON.stringify(edited))]));
    expect((checksum as BackupError).reason).toBe('checksum');

    const version = await rejection(await reseal((body) => (body['format_version'] = 2)));
    expect((version as BackupError).reason).toBe('version');

    const noHistory = await rejection(await reseal((body) => delete body['history']));
    expect((noHistory as BackupError).reason).toBe('corrupt');

    const badSession = await rejection(
      await reseal((body) => (body['sessions'] = [{ id: 'x', room: 4 }])),
    );
    expect((badSession as BackupError).reason).toBe('corrupt');
  });
});

describe('limits and session checks', () => {
  it('an oversized file is refused', async () => {
    const big = new Blob([new Uint8Array(MAX_BACKUP_COMPRESSED_BYTES + 1)]);
    expect(((await rejection(big)) as BackupError).reason).toBe('corrupt');
  });

  it('a decompression bomb is refused early', async () => {
    const bomb = new Blob([await gzipText('a'.repeat(MAX_BACKUP_BYTES + 1024 * 1024))]);
    expect(bomb.size).toBeLessThan(MAX_BACKUP_COMPRESSED_BYTES);
    const cancel = vi.spyOn(ReadableStreamDefaultReader.prototype, 'cancel');
    const refusal = await rejection(bomb);
    expect((refusal as BackupError).reason).toBe('corrupt');
    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
    expect(await store.history.list()).toEqual([]);
    expect(await store.sessions.list()).toEqual([]);
  });

  it('drops sessions whose id or server does not hold up and counts them', async () => {
    await populate(store);
    const blob = await reseal((body) => {
      const sessions = body['sessions'] as Record<string, unknown>[];
      sessions.push({ ...sessions[0], id: 'wrong' });
      sessions.push({ ...sessions[0], server: 'ftp://x', id: 'ftp%3A%2F%2Fx.AAAAAA' });
    });
    const backup = await readBackup(blob);
    expect(backup.sessions).toHaveLength(2);
    expect((await previewBackup(other, backup)).skipped).toBe(2);
    await mergeBackup(other, backup);
    expect(await other.sessions.list()).toHaveLength(2);
  });

  it('drops sessions whose room or resumed room is not a join code and counts them', async () => {
    await populate(store);
    const blob = await reseal((body) => {
      const sessions = body['sessions'] as Record<string, unknown>[];
      sessions.push({ ...sessions[0], resumedAs: 'ABCDEF?server=https://x' });
      sessions.push({ ...sessions[0], room: 'abc?de', id: `${encodeURIComponent(SERVER)}.abc?de` });
      sessions.push({
        ...sessions[0],
        room: 'ZZZZZZ',
        id: `${encodeURIComponent(SERVER)}.ZZZZZZ`,
        resumedAs: 'CCCCCC',
      });
    });
    const backup = await readBackup(blob);
    expect(backup.sessions.map((s) => s.room).sort()).toEqual(['AAAAAA', 'BBBBBB', 'ZZZZZZ']);
    expect((await previewBackup(other, backup)).skipped).toBe(2);
  });

  it('accepts a finished session', async () => {
    await store.sessions.put(
      sessionRecord('AAAAAA', NOW, { status: 'finished', finishedAt: NOW, opponentName: 'Jo' }),
    );
    const backup = await readBackup(await exportBackup(store));
    expect(backup.sessions[0]).toMatchObject({ status: 'finished', finishedAt: NOW });
  });

  it('accepts the round and turn, and files without them', async () => {
    await store.sessions.put(sessionRecord('AAAAAA', NOW, { round: 4, yourTurn: true }));
    await store.sessions.put(sessionRecord('BBBBBB', NOW));
    const backup = await readBackup(await exportBackup(store));
    expect(backup.sessions.find((s) => s.room === 'AAAAAA')).toMatchObject({
      round: 4,
      yourTurn: true,
    });
    expect(backup.sessions.find((s) => s.room === 'BBBBBB')?.round).toBeUndefined();
  });

  it('refuses a session whose round has the wrong type', async () => {
    await store.sessions.put(sessionRecord('AAAAAA', NOW));
    const blob = await reseal((body) => {
      (body['sessions'] as Record<string, unknown>[])[0]!['round'] = 'four';
    });
    expect(await rejection(blob)).toBeDefined();
  });
});

describe('merging', () => {
  const idOf = (room: string): string => sessionRecord(room, 0).id;

  it('newer records win on merge', async () => {
    await other.sessions.put(sessionRecord('AAAAAA', NOW - 500, { lastSeq: 1 }));
    await other.sessions.put(sessionRecord('CCCCCC', NOW + 9_000, { lastSeq: 77 }));
    await other.history.put({ ...historyRecord('g1', NOW + 9_000), rounds: 9 });
    await other.history.put({ ...historyRecord('g2', NOW + 100), rounds: 1 });

    await store.sessions.put(sessionRecord('AAAAAA', NOW - 100, { lastSeq: 50 }));
    await store.sessions.put(sessionRecord('CCCCCC', NOW + 2_000, { lastSeq: 2 }));
    await store.sessions.put(sessionRecord('DDDDDD', NOW + 2_000));
    await store.history.put({ ...historyRecord('g1', NOW + 1_000), rounds: 2 });
    await store.history.put({ ...historyRecord('g2', NOW + 4_000), rounds: 5 });
    await store.history.put(historyRecord('g3', NOW + 10));

    const result = await mergeBackup(other, await readBackup(await exportBackup(store)));
    expect(result).toEqual({ added: 2, updated: 2 });
    expect((await other.sessions.get(idOf('AAAAAA')))?.lastSeq).toBe(50);
    expect((await other.sessions.get(idOf('CCCCCC')))?.lastSeq).toBe(77);
    expect(await other.sessions.get(idOf('DDDDDD'))).toBeDefined();
    expect((await other.history.get('g1'))?.rounds).toBe(9);
    expect((await other.history.get('g2'))?.rounds).toBe(5);
    expect(await other.history.get('g3')).toBeDefined();
  });

  it('keeps this device identity and settings unless asked', async () => {
    await populate(store);
    await other.identity.put({ deviceId: 'device-2', displayName: 'Local' });
    const backup = await readBackup(await exportBackup(store));
    await mergeBackup(other, backup);
    expect(await other.identity.get()).toEqual({ deviceId: 'device-2', displayName: 'Local' });
    expect(await other.settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("never imports the backup's server, even when replacing the settings", async () => {
    await store.settings.put({ ...DEFAULT_SETTINGS, theme: 'dark', server: 'https://x.example' });
    await other.settings.put({ ...DEFAULT_SETTINGS, server: 'https://mine.example' });
    const backup = await readBackup(await exportBackup(store));
    await mergeBackup(other, backup, { settings: true });
    expect(await other.settings.get()).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      server: 'https://mine.example',
    });

    await other.settings.put({ ...DEFAULT_SETTINGS, theme: 'dark', server: null });
    expect((await previewBackup(other, backup)).settingsDiffer).toBe(false);
    await mergeBackup(other, backup, { settings: true });
    expect((await other.settings.get()).server).toBeNull();
  });

  it('adopts the backup display name when this device has none', async () => {
    await populate(store);
    const { deviceId } = await other.identity.get();
    await mergeBackup(other, await readBackup(await exportBackup(store)));
    expect(await other.identity.get()).toEqual({ deviceId, displayName: 'Mika' });
  });

  it('a failed import changes nothing', async () => {
    await populate(store);
    await other.history.put({ ...historyRecord('g1', NOW), rounds: 1 });
    const backup = await readBackup(await exportBackup(store));
    const failing: DeviceStore = {
      ...other,
      history: {
        ...other.history,
        put: async (record) => {
          if (record.id === 'g2') throw new Error('disk full');
          await other.history.put(record);
        },
      },
    };
    await expect(mergeBackup(failing, backup)).rejects.toThrow('disk full');
    expect((await other.history.list()).map((h) => h.id)).toEqual(['g1']);
    expect((await other.history.get('g1'))?.rounds).toBe(1);
    expect(await other.sessions.list()).toEqual([]);
  });

  it('previews the counts and whether the settings differ', async () => {
    await populate(store);
    const backup = await readBackup(await exportBackup(store));
    expect(await previewBackup(other, backup)).toEqual({
      games: 2,
      sessions: 2,
      settingsDiffer: true,
      skipped: 0,
    });
    await other.settings.put(backup.settings);
    expect((await previewBackup(other, backup)).settingsDiffer).toBe(false);
  });
});
