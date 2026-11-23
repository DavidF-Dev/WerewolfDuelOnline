import type { DeviceStore } from '../storage/db.js';
import { BACKUP_FORMAT_VERSION, backupChecksum, gzipText, type BackupFile } from './format.js';

export const BACKUP_MIME = 'application/octet-stream';
const DOWNLOAD_URL_LIFETIME_MS = 10_000;

/** A gzip file holding the device's settings, identity, sessions and history, sealed with a checksum. */
export async function exportBackup(store: DeviceStore, now: number = Date.now()): Promise<Blob> {
  const body: Omit<BackupFile, 'checksum'> = {
    format_version: BACKUP_FORMAT_VERSION,
    exported_at: now,
    settings: await store.settings.get(),
    identity: await store.identity.get(),
    sessions: await store.sessions.list(now),
    history: await store.history.list(),
  };
  const sealed: BackupFile = { ...body, checksum: backupChecksum(body) };
  return new Blob([await gzipText(JSON.stringify(sealed))], {
    type: BACKUP_MIME,
  });
}

export type SaveResult = 'saved' | 'cancelled';

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

interface SavePicker {
  showSaveFilePicker(options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

/** Saves `file` through the save-file picker where there is one, otherwise as a download. */
export async function saveBackup(file: File, description: string): Promise<SaveResult> {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as SavePicker).showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description, accept: { [BACKUP_MIME]: ['.wwdb'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return 'saved';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
  return 'saved';
}

/** Whether this browser can hand `file` to the system share sheet. */
export const canShareBackup = (file: File): boolean =>
  typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

export async function shareBackup(file: File): Promise<SaveResult> {
  try {
    await navigator.share({ files: [file] });
    return 'saved';
  } catch (error) {
    if (isAbort(error)) return 'cancelled';
    throw error;
  }
}
