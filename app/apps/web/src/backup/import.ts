import { canonicalJson } from '@wwd/protocol';
import { normaliseSettings, type Settings } from '../settings/settings.js';
import type { DeviceStore } from '../storage/db.js';
import { SESSION_MAX_AGE_MS } from '../storage/sessions.js';
import {
  BackupError,
  gunzipText,
  parseBackup,
  skippedSessions,
  type BackupFile,
} from './format.js';

/** Reads a backup, refusing a file that is damaged, edited, or made by another format version. */
export async function readBackup(file: Blob): Promise<BackupFile> {
  let text: string;
  try {
    text = await gunzipText(file);
  } catch {
    throw new BackupError('corrupt');
  }
  return parseBackup(text);
}

export interface BackupPreview {
  games: number;
  sessions: number;
  settingsDiffer: boolean;
  /** Sessions in the file that cannot be imported. */
  skipped: number;
}

/** The backup's settings as this device would take them: the referee server stays this device's own. */
const importedSettings = (backup: BackupFile, current: Settings): Settings => ({
  ...normaliseSettings(backup.settings),
  server: current.server,
});

const usableSessions = (backup: BackupFile, now: number): BackupFile['sessions'] =>
  backup.sessions.filter((session) => now - session.savedAt <= SESSION_MAX_AGE_MS);

/** What importing `backup` would bring in, without changing anything. */
export async function previewBackup(
  store: DeviceStore,
  backup: BackupFile,
  now: number = Date.now(),
): Promise<BackupPreview> {
  const current = await store.settings.get();
  return {
    games: backup.history.length,
    sessions: usableSessions(backup, now).length,
    skipped: skippedSessions(backup),
    settingsDiffer: canonicalJson(importedSettings(backup, current)) !== canonicalJson(current),
  };
}

export interface MergeOptions {
  /** Replace this device's settings, apart from its server, with the backup's; they are kept by default. */
  settings?: boolean;
}

interface Step {
  apply(): Promise<void>;
  undo(): Promise<void>;
}

/**
 * Adds the backup's games and sessions that this device lacks and replaces those it holds an
 * older copy of. The device keeps its identity, except that it takes the backup's display name
 * when it has none. A failure part-way restores what was already written.
 */
export async function mergeBackup(
  store: DeviceStore,
  backup: BackupFile,
  options: MergeOptions = {},
  now: number = Date.now(),
): Promise<{ added: number; updated: number }> {
  const steps: Step[] = [];
  let added = 0;
  let updated = 0;

  for (const record of usableSessions(backup, now)) {
    const held = await store.sessions.get(record.id);
    if (held !== undefined && held.savedAt >= record.savedAt) continue;
    if (held === undefined) added++;
    else updated++;
    steps.push({
      apply: () => store.sessions.put(record),
      undo: () =>
        held === undefined ? store.sessions.delete(record.id) : store.sessions.put(held),
    });
  }

  for (const record of backup.history) {
    const held = await store.history.get(record.id);
    if (held !== undefined && held.finishedAt >= record.finishedAt) continue;
    if (held === undefined) added++;
    else updated++;
    steps.push({
      apply: () => store.history.put(record),
      undo: () => (held === undefined ? store.history.delete(record.id) : store.history.put(held)),
    });
  }

  const identity = await store.identity.get();
  const name = backup.identity.displayName;
  if (identity.displayName === undefined && name !== undefined) {
    steps.push({
      apply: () => store.identity.put({ ...identity, displayName: name }),
      undo: () => store.identity.put(identity),
    });
  }

  if (options.settings === true) {
    const settings = await store.settings.get();
    steps.push({
      apply: () => store.settings.put(importedSettings(backup, settings)),
      undo: () => store.settings.put(settings),
    });
  }

  const done: Step[] = [];
  try {
    for (const step of steps) {
      await step.apply();
      done.push(step);
    }
  } catch (error) {
    // A step that failed part-way may have written, so it is undone too.
    for (const step of [...done, ...steps.slice(done.length, done.length + 1)].reverse()) {
      await step.undo().catch(() => undefined);
    }
    throw error;
  }
  return { added, updated };
}
