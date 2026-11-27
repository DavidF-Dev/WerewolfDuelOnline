import { describe, expect, it } from 'vitest';
import { contentHash } from '@wwd/engine';
import { canonicalJson } from '@wwd/protocol';
import { exportBackup } from '../../src/backup/export.js';
import { gunzipText, gzipText } from '../../src/backup/format.js';
import { mergeBackup, readBackup } from '../../src/backup/import.js';
import { DEFAULT_SETTINGS, normaliseSettings } from '../../src/settings/settings.js';
import { openDeviceStore } from '../../src/storage/db.js';

describe('settings', () => {
  it('the tutorial and newcomer flags start false', () => {
    const settings = normaliseSettings({});
    expect(settings.tutorialFinished).toBe(false);
    expect(settings.newcomerCardDismissed).toBe(false);
    expect(DEFAULT_SETTINGS.tutorialFinished).toBe(false);
    expect(DEFAULT_SETTINGS.newcomerCardDismissed).toBe(false);
  });

  it('the flags go into a backup and come back from it', async () => {
    const store = await openDeviceStore();
    const other = await openDeviceStore();
    await store.settings.put({ ...DEFAULT_SETTINGS, tutorialFinished: true });
    const backup = await readBackup(await exportBackup(store));
    expect(backup.settings.tutorialFinished).toBe(true);
    expect(backup.settings.newcomerCardDismissed).toBe(false);
    await mergeBackup(other, backup, { settings: true });
    expect((await other.settings.get()).tutorialFinished).toBe(true);
  });

  it('a backup made before the flags existed restores both as false', async () => {
    const store = await openDeviceStore();
    const other = await openDeviceStore();
    await other.settings.put({
      ...DEFAULT_SETTINGS,
      tutorialFinished: true,
      newcomerCardDismissed: true,
    });
    const body = JSON.parse(await gunzipText(await exportBackup(store))) as {
      settings: Record<string, unknown>;
      checksum?: string;
    };
    delete body.settings['tutorialFinished'];
    delete body.settings['newcomerCardDismissed'];
    delete body.checksum;
    const sealed = { ...body, checksum: contentHash(canonicalJson(body)) };
    const backup = await readBackup(new Blob([await gzipText(JSON.stringify(sealed))]));
    await mergeBackup(other, backup, { settings: true });
    const restored = await other.settings.get();
    expect(restored.tutorialFinished).toBe(false);
    expect(restored.newcomerCardDismissed).toBe(false);
  });
});
