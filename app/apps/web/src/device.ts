import { setDeviceStore } from './device-store.js';
import { initSessions } from './session.js';
import { applySettings, watchSystemPreferences } from './settings/apply.js';
import { DEFAULT_SETTINGS } from './settings/settings.js';
import { openDeviceStore } from './storage/db.js';

/**
 * Opens device storage and applies the saved settings, then keeps them following the system's
 * preferences; any storage failure leaves the defaults.
 */
export async function prepareDevice(root: HTMLElement): Promise<void> {
  await applyStoredSettings(root);
  try {
    watchSystemPreferences();
  } catch {
    // The System choices then keep the preference read at start-up.
  }
}

async function applyStoredSettings(root: HTMLElement): Promise<void> {
  try {
    const store = await openDeviceStore();
    setDeviceStore(store);
    await initSessions(store);
    try {
      applySettings(await store.settings.get(), root);
      return;
    } catch {
      // Fall through to the defaults below.
    }
  } catch {
    // Fall through to the defaults below.
  }
  try {
    applySettings(DEFAULT_SETTINGS, root);
  } catch {
    // The stylesheet's own defaults apply.
  }
}
