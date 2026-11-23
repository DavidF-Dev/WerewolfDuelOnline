import type { Settings } from './settings/settings.js';
import type { DeviceStore } from './storage/db.js';

let current: DeviceStore | undefined;
let settingsWrites: Promise<void> = Promise.resolve();

/** Shares the opened device store with the screens. */
export function setDeviceStore(store: DeviceStore): void {
  current = store;
}

/** The device store, or undefined before it opens; screens then run without saving. */
export function getDeviceStore(): DeviceStore | undefined {
  return current;
}

/** Detaches the device store; for tests. */
export function resetDeviceStore(): void {
  current = undefined;
}

/**
 * Merges `patch` into the settings of `store`, the shared device store by default. Writes run
 * one at a time, each reading the record afresh, so no write overwrites another's fields. The
 * returned promise settles once this write is done; a failed write is dropped.
 */
export function patchSettings(
  patch: Partial<Settings>,
  store: DeviceStore | undefined = current,
): Promise<void> {
  settingsWrites = settingsWrites
    .then(async () => {
      if (store !== undefined)
        await store.settings.put({ ...(await store.settings.get()), ...patch });
    })
    .catch(() => {
      // Swallowed so that the queue keeps running for later writes.
    });
  return settingsWrites;
}

/** Stores `name` as the display name; false when it could not be saved. */
export async function rememberDisplayName(name: string): Promise<boolean> {
  if (current === undefined) return false;
  try {
    await current.identity.put({ ...(await current.identity.get()), displayName: name });
    return true;
  } catch {
    return false;
  }
}
